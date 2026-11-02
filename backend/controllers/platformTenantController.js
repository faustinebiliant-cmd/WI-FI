const crypto = require('crypto');
const db = require('../config/db');
const { hashPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');
const { issueImpersonationCode } = require('../services/impersonationCodes');
const { isValidEmail, isValidPhone, isSafeText, isValidUUID } = require('../utils/validators');

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
    const { business_name, owner_name, owner_email, owner_phone, monthly_fee } = req.body;
    if (!business_name || !owner_name || !owner_email || !owner_phone) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    if (!isSafeText(business_name) || !isSafeText(owner_name)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in name' });
    }
    if (!isValidEmail(owner_email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone format (use 07XXXXXXXX)' });
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
        [business_name.trim(), owner_name.trim(), cleanEmail, owner_phone.trim(), passwordHash, monthly_fee || 0]
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
    const reason = String((req.body || {}).reason || '').trim();
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
    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) return res.status(400).json({ success: false, error: 'A detailed reason (min 10 chars) is required' });
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
        [req.admin.id, req.admin.email, id, owner.id, reason.trim(), tokenId, expiresAt.toISOString()]
      );
      await client.query(
        `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details)
         VALUES ($1, $2, 'Impersonation Started', 'tenant', $3, $4, $5)`,
        [req.admin.id, req.admin.email, id, owner.full_name, JSON.stringify({ reason: reason.trim() })]
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

module.exports = { createTenant, listTenants, getTenant, toggleTenantStatus, impersonateTenant };