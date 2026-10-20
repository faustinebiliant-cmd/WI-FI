const crypto = require('crypto');
const db = require('../config/supabase');
const { hashPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');
const { isValidEmail, isValidPhone, isSafeText } = require('../utils/validators');

const createTenant = async (req, res) => {
  try {
    const { business_name, owner_name, owner_email, owner_phone, monthly_fee } = req.body;
    if (!business_name || !owner_name || !owner_email || !owner_phone) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    // RESTORED VALIDATION
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
    const existing = await db.query('SELECT id FROM tenant_users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email is already registered to another tenant' });

    const tempPassword = 'Welcome123!';
    const passwordHash = await hashPassword(tempPassword);

    const { rows } = await db.query(
      `SELECT create_tenant_with_owner($1, $2, $3, $4, $5, $6) as result`,
      [business_name.trim(), owner_name.trim(), cleanEmail, owner_phone.trim(), passwordHash, monthly_fee || 0]
    );

    const result = rows[0].result;
    return res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: { tenant_id: result.tenant_id, owner_email: cleanEmail, temp_password: tempPassword }
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

const listTenants = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM tenants ORDER BY created_at DESC');
  return res.status(200).json({ success: true, data: rows });
};

const getTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantRes = await db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    if (tenantRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Tenant not found' });
    
    const tenant = tenantRes.rows[0];
    const routerCount = await db.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [id]);
    const activeSessions = await db.query('SELECT COUNT(*) FROM sessions WHERE tenant_id = $1 AND ended_at IS NULL', [id]);

    return res.status(200).json({
      success: true,
      data: {
        ...tenant,
        router_count: parseInt(routerCount.rows[0].count),
        active_sessions: parseInt(activeSessions.rows[0].count)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get tenant' });
  }
};

const toggleTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    const newStatus = action === 'suspend' ? 'suspended' : 'active';

    const { rows } = await db.query(
      'UPDATE tenants SET subscription_status = $1 WHERE id = $2 RETURNING *',
      [newStatus, id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Tenant not found' });

    await db.query(
      `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details) 
       VALUES ($1, $2, $3, 'tenant', $4, $5, $6)`,
      [req.admin.id, req.admin.email, action === 'suspend' ? 'Tenant Suspended' : 'Tenant Unsuspended', id, rows[0].business_name, JSON.stringify({ reason: reason || 'No reason provided' })]
    );

    return res.status(200).json({ success: true, message: `Tenant ${action}ed successfully`, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update tenant status' });
  }
};

const impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || reason.trim().length < 10) return res.status(400).json({ success: false, error: 'A detailed reason (min 10 chars) is required' });

    const ownerRes = await db.query("SELECT * FROM tenant_users WHERE tenant_id = $1 AND role = 'owner'", [id]);
    if (ownerRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Tenant owner not found' });
    const owner = ownerRes.rows[0];

    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      `INSERT INTO impersonation_sessions (admin_id, admin_email, tenant_id, tenant_user_id, reason, token_id, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.admin.id, req.admin.email, id, owner.id, reason.trim(), tokenId, expiresAt.toISOString()]
    );

    const impersonationToken = signTenantToken({
      id: owner.id, email: owner.email, full_name: owner.full_name,
      tenant_id: id, role: 'owner', impersonation_token_id: tokenId
    });

    await db.query(
      `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details) 
       VALUES ($1, $2, 'Impersonation Started', 'tenant', $3, $4, $5)`,
      [req.admin.id, req.admin.email, id, owner.full_name, JSON.stringify({ reason: reason.trim() })]
    );

    return res.status(200).json({
      success: true,
      message: 'Impersonation session started',
      token: impersonationToken,
      tenant_user: { full_name: owner.full_name, email: owner.email }
    });
  } catch (error) {
    console.error('Impersonation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to start impersonation' });
  }
};

module.exports = { createTenant, listTenants, getTenant, toggleTenantStatus, impersonateTenant };