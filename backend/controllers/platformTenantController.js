const crypto = require('crypto');
const db = require('../config/db');
const { hashPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');
const { issueImpersonationCode } = require('../services/impersonationCodes');
const { removeWireGuardPeer } = require('../services/wireguard');
const { isValidEmail, isValidPhone, cleanPhone, isValidName, nameRuleMessage, isWholeNumberBetween, isValidUUID } = require('../utils/validators');

// A new business may use the system this many days, then it is blocked
// automatically (see TENANT_BLOCKED_SQL) until it is activated in the admin panel
const TRIAL_DAYS = 14;

// Suspend / unsuspend / activate: the new status and the Audit Logs wording
const STATUS_ACTIONS = {
  suspend: { status: 'suspended', log: 'Tenant Suspended', message: 'Business suspended' },
  unsuspend: { status: 'active', log: 'Tenant Unsuspended', message: 'Business unsuspended' },
  activate: { status: 'active', log: 'Tenant Activated', message: 'Business activated' }
};

// Easy to read out over the phone: no 0/O, 1/l/I
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const makeTempPassword = () =>
  Array.from({ length: 10 }, () => TEMP_PASSWORD_CHARS[crypto.randomInt(TEMP_PASSWORD_CHARS.length)]).join('');

const createTenant = async (req, res) => {
  try {
    const { business_name, owner_name, owner_email, owner_phone, monthly_fee } = req.body || {};
    if (!business_name || !owner_name || !owner_email || !owner_phone) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    if (!isValidName(business_name, 2, 60)) {
      return res.status(400).json({ success: false, error: nameRuleMessage('Business name', 2, 60) });
    }
    if (!isValidName(owner_name, 2, 60)) {
      return res.status(400).json({ success: false, error: nameRuleMessage('Owner name', 2, 60) });
    }
    if (!isValidEmail(typeof owner_email === 'string' ? owner_email.trim() : owner_email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone format (use 07XXXXXXXX)' });
    }
    // Empty means no fee agreed yet
    const fee = monthly_fee === undefined || monthly_fee === null || monthly_fee === '' ? 0 : monthly_fee;
    if (!isWholeNumberBetween(fee, 0, 1000000)) {
      return res.status(400).json({ success: false, error: 'Monthly fee: a whole number from 0 to 1,000,000 TZS.' });
    }

    const cleanEmail = owner_email.toLowerCase().trim();

    // A different password for every tenant; the owner must replace it at first login
    const tempPassword = makeTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    // Business, owner login, "must change password" and the trial end date together,
    // or none of them. An email already in use is refused by the database (23505 below).
    const result = await db.transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT create_tenant_with_owner($1, $2, $3, $4, $5, $6) as result`,
        [business_name.trim(), owner_name.trim(), cleanEmail, cleanPhone(owner_phone), passwordHash, Number(fee)]
      );
      await client.query('UPDATE tenant_users SET must_change_password = true WHERE id = $1', [rows[0].result.user_id]);
      // Last trial day = today + TRIAL_DAYS, counted in Tanzania time
      await client.query(
        "UPDATE tenants SET trial_ends_at = (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date + $2::int WHERE id = $1",
        [rows[0].result.tenant_id, TRIAL_DAYS]
      );
      return rows[0].result;
    });
    return res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: { tenant_id: result.tenant_id, owner_email: cleanEmail, temp_password: tempPassword }
    });
  } catch (error) {
    // Two creations with the same email at the same moment: the database refuses the second
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Email is already registered to another tenant' });
    }
    console.error('Create tenant error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

const listTenants = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM tenants ORDER BY created_at DESC');
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('List tenants error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list tenants' });
  }
};

const getTenant = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(404).json({ success: false, error: 'Tenant not found' });

    // The business and its two counts in one trip to the database
    const tenantRes = await db.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM routers WHERE tenant_id = t.id) AS router_count,
        (SELECT COUNT(*) FROM sessions WHERE tenant_id = t.id AND ended_at IS NULL) AS active_sessions
      FROM tenants t WHERE t.id = $1
    `, [id]);
    if (tenantRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const tenant = tenantRes.rows[0];
    return res.status(200).json({
      success: true,
      data: {
        ...tenant,
        router_count: parseInt(tenant.router_count, 10),
        active_sessions: parseInt(tenant.active_sessions, 10)
      }
    });
  } catch (error) {
    console.error('Get tenant error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get tenant' });
  }
};

const toggleTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    // Text only: an object would turn into the 15 characters "[object Object]"
    const rawReason = (req.body || {}).reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    // Only known actions: anything else (a typo) must not silently change a business
    const change = Object.prototype.hasOwnProperty.call(STATUS_ACTIONS, action) ? STATUS_ACTIONS[action] : null;
    if (!change) {
      return res.status(400).json({ success: false, error: 'Action must be suspend, unsuspend or activate' });
    }
    if (reason.length < 5 || reason.length > 500) {
      return res.status(400).json({ success: false, error: 'Write a reason (5 to 500 characters).' });
    }
    if (!isValidUUID(id)) return res.status(404).json({ success: false, error: 'Tenant not found' });

    // The change and its audit log line together: no change without a record
    const tenant = await db.transaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE tenants SET subscription_status = $1 WHERE id = $2 RETURNING *',
        [change.status, id]
      );
      if (rows.length === 0) return null;

      await client.query(
        `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details)
         VALUES ($1, $2, $3, 'tenant', $4, $5, $6)`,
        [req.admin.id, req.admin.email, change.log, id, rows[0].business_name, JSON.stringify({ reason })]
      );
      return rows[0];
    });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    return res.status(200).json({ success: true, message: change.message, data: tenant });
  } catch (error) {
    console.error('Update tenant status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update tenant status' });
  }
};

const impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const rawReason = (req.body || {}).reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (reason.length < 10 || reason.length > 300) {
      return res.status(400).json({ success: false, error: 'Write a reason (10 to 300 characters).' });
    }
    if (!isValidUUID(id)) return res.status(404).json({ success: false, error: 'Tenant owner not found' });

    const ownerRes = await db.query("SELECT * FROM tenant_users WHERE tenant_id = $1 AND role = 'owner'", [id]);
    if (ownerRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Tenant owner not found' });
    const owner = ownerRes.rows[0];

    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // The session and its audit log line together: no impersonation without a record
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO impersonation_sessions (admin_id, admin_email, tenant_id, tenant_user_id, reason, token_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.admin.id, req.admin.email, id, owner.id, reason, tokenId, expiresAt.toISOString()]
      );
      await client.query(
        `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details)
         VALUES ($1, $2, 'Impersonation Started', 'tenant', $3, $4, $5)`,
        [req.admin.id, req.admin.email, id, owner.full_name, JSON.stringify({ reason })]
      );
    });

    const impersonationToken = signTenantToken({
      id: owner.id, email: owner.email, full_name: owner.full_name,
      tenant_id: id, role: 'owner', impersonation_token_id: tokenId
    });

    // The token itself never goes to the admin panel: it gets a one-time code
    // that the Business Panel swaps for the token (see services/impersonationCodes)
    const code = issueImpersonationCode(impersonationToken, { full_name: owner.full_name, email: owner.email });

    return res.status(200).json({
      success: true,
      message: 'Impersonation session started',
      code
    });
  } catch (error) {
    console.error('Start impersonation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to start impersonation' });
  }
};

// DELETE /api/platform/tenants/:id
// Deletes a business and everything that belongs to it: owner login, routers,
// packages, vouchers, sessions, payments and impersonation records (the database
// removes them with the business). Every router's VPN tunnel is removed from the VPS
// FIRST, because its address is handed to the next new router; if one cannot be
// removed, nothing is deleted. Removing a tunnel twice is harmless, so trying again
// after a failure is safe. The Audit Logs keep a line about the deletion.
const deleteTenant = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(404).json({ success: false, error: 'Business not found' });

    const tenantRes = await db.query('SELECT business_name FROM tenants WHERE id = $1', [id]);
    if (tenantRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Business not found' });
    const businessName = tenantRes.rows[0].business_name;

    const { rows: routers } = await db.query(
      'SELECT name, public_key, provisioned_at FROM routers WHERE tenant_id = $1',
      [id]
    );

    // Set up by an older version that did not save the key: its tunnel cannot be found automatically
    const unknownTunnel = routers.find((r) => !r.public_key && r.provisioned_at);
    if (unknownTunnel) {
      return res.status(409).json({
        success: false,
        error: `Router "${unknownTunnel.name}" was set up with an older version: its VPN tunnel must be removed by hand first. Nothing was deleted.`
      });
    }

    for (const r of routers.filter((x) => x.public_key)) {
      if (!(await removeWireGuardPeer(r.public_key))) {
        return res.status(503).json({
          success: false,
          error: `The VPN tunnel of router "${r.name}" could not be removed from the server, so the business was NOT deleted. Please try again in a minute.`
        });
      }
    }

    // The record and the deletion together: no deletion without a line in the Audit Logs
    await db.transaction(async (client) => {
      const { rows: [counts] } = await client.query(
        `SELECT (SELECT COUNT(*) FROM routers WHERE tenant_id = $1)::int AS routers,
                (SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1)::int AS vouchers`,
        [id]
      );
      await client.query(
        `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details)
         VALUES ($1, $2, 'Tenant Deleted', 'tenant', $3, $4, $5)`,
        [req.admin.id, req.admin.email, id, businessName, JSON.stringify(counts)]
      );
      await client.query('DELETE FROM tenants WHERE id = $1', [id]);
    });

    return res.status(200).json({ success: true, message: `Business "${businessName}" deleted` });
  } catch (error) {
    console.error('Delete tenant error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete the business' });
  }
};

module.exports = { createTenant, listTenants, getTenant, toggleTenantStatus, impersonateTenant, deleteTenant };