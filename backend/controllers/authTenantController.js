const db = require('../config/db');
const { verifyPassword, hashPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');
const { TENANT_BLOCKED_SQL, TENANT_BLOCKED_ERROR } = require('../middleware/subscriptionGuard');

// Every tenant created before random passwords got this one. Whoever still
// uses it must choose a new password before doing anything else.
const LEGACY_DEFAULT_PASSWORD = 'Welcome123!';

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const cleanEmail = email.toLowerCase().trim();

    const { rows } = await db.query(`
      SELECT u.*, t.subscription_status, ${TENANT_BLOCKED_SQL} AS tenant_blocked
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

    // Checked after the password, so a stranger cannot learn which accounts are suspended
    if (user.tenant_blocked) return res.status(403).json(TENANT_BLOCKED_ERROR);

    let mustChangePassword = user.must_change_password === true;
    if (!mustChangePassword && password === LEGACY_DEFAULT_PASSWORD) {
      mustChangePassword = true;
      await db.query('UPDATE tenant_users SET must_change_password = true WHERE id = $1', [user.id]);
    }

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
      tenant_status: user.subscription_status,
      must_change_password: mustChangePassword
    });
  } catch (error) {
    console.error('Tenant login error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/tenant/auth/change-password
// Wrong answers use 400, not 401: a 401 would log the user out in the panel.
const changePassword = async (req, res) => {
  try {
    if (req.tenantUser.is_impersonation) {
      return res.status(403).json({ success: false, error: 'The password cannot be changed while impersonating.' });
    }

    const { current_password, new_password } = req.body || {};
    if (typeof current_password !== 'string' || typeof new_password !== 'string' || !current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'Please fill in your current and your new password.' });
    }
    // bcrypt only uses the first 72 characters
    if (new_password.length < 8 || new_password.length > 72) {
      return res.status(400).json({ success: false, error: 'The new password must be 8 to 72 characters long.' });
    }
    if (new_password === current_password) {
      return res.status(400).json({ success: false, error: 'The new password must be different from the current one.' });
    }
    if (new_password === LEGACY_DEFAULT_PASSWORD) {
      return res.status(400).json({ success: false, error: 'This password is not allowed. Please choose another one.' });
    }

    const { rows } = await db.query('SELECT password_hash FROM tenant_users WHERE id = $1', [req.tenantUser.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const isValid = await verifyPassword(current_password, rows[0].password_hash);
    if (!isValid) return res.status(400).json({ success: false, error: 'Your current password is not correct.' });

    const newHash = await hashPassword(new_password);
    await db.query(
      'UPDATE tenant_users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newHash, req.tenantUser.id]
    );

    return res.status(200).json({ success: true, message: 'Password changed' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, error: 'Failed to change password' });
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

module.exports = { login, changePassword, endImpersonationSelf };
