const db = require('../config/db');
const { verifyPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const cleanEmail = email.toLowerCase().trim();

    const { rows } = await db.query(`
      SELECT u.*, t.subscription_status 
      FROM tenant_users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = $1
    `, [cleanEmail]);

    const user = rows[0];

    const FAILED = { success: false, error: 'Invalid credentials' };
    if (!user) return res.status(401).json(FAILED);
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) return res.status(401).json(FAILED);

    const token = signTenantToken({
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      full_name: user.full_name
    });

    await db.query('UPDATE tenant_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return res.status(200).json({
      success: true,
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      tenant_status: user.subscription_status
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

const endImpersonationSelf = async (req, res) => {
  try {
    if (!req.tenantUser.is_impersonation) {
      return res.status(400).json({ success: false, error: 'Not in an impersonation session' });
    }
    await db.query(`
      UPDATE impersonation_sessions 
      SET ended_at = NOW(), ended_by = 'tenant' 
      WHERE tenant_user_id = $1 AND ended_at IS NULL
    `, [req.tenantUser.id]);

    return res.status(200).json({ success: true, message: 'Impersonation ended' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to end impersonation' });
  }
};

module.exports = { login, endImpersonationSelf };