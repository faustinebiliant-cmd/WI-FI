const db = require('../config/db');
const { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } = require('../utils/validators');
const { verifyPassword, hashPassword, wasteSameTime } = require('../services/password');
const { signTenantToken } = require('../services/jwt');
const { redeemImpersonationCode } = require('../services/impersonationCodes');
const { TENANT_BLOCKED_SQL, TENANT_BLOCKED_ERROR } = require('../middleware/subscriptionGuard');

// Every tenant created before random passwords got this one. Whoever still
// uses it must choose a new password before doing anything else.
const LEGACY_DEFAULT_PASSWORD = 'Welcome123!';

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    // Sizes: no email or password in this system is longer than 50 characters
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password ||
        email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const { rows } = await db.query(`
      SELECT u.*, ${TENANT_BLOCKED_SQL} AS tenant_blocked
      FROM tenant_users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = $1
    `, [cleanEmail]);

    const user = rows[0];

    // A stranger gets the same answer, after the same time, whether the email exists or not
    const FAILED = { success: false, error: 'Invalid credentials' };
    const isValid = user ? await verifyPassword(password, user.password_hash) : await wasteSameTime(password);
    if (!isValid) return res.status(401).json(FAILED);

    // Checked after the password, so a stranger cannot learn which accounts are deactivated or suspended
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });
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
    if (current_password.length > MAX_PASSWORD_LENGTH || new_password.length < 8 || new_password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `The new password must be 8 to ${MAX_PASSWORD_LENGTH} characters long.` });
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

    // password_changed_at logs out every login issued before it (other devices, a stolen
    // login). Whole seconds, like a token's issue time, so the new token below still works.
    const newHash = await hashPassword(new_password);
    await db.query(
      `UPDATE tenant_users
       SET password_hash = $1, must_change_password = false, password_changed_at = date_trunc('second', NOW())
       WHERE id = $2`,
      [newHash, req.tenantUser.id]
    );

    // This device stays logged in with a fresh login
    const { id, tenant_id, role, full_name } = req.tenantUser;
    const token = signTenantToken({ id, tenant_id, role, full_name });

    return res.status(200).json({ success: true, message: 'Password changed', token });
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
    // Only this session: another admin may be helping the same owner at the same time
    await db.query(
      "UPDATE impersonation_sessions SET ended_at = NOW(), ended_by = 'tenant' WHERE token_id = $1 AND ended_at IS NULL",
      [req.tenantUser.impersonation_token_id]
    );

    return res.status(200).json({ success: true, message: 'Impersonation ended' });
  } catch (error) {
    console.error('End impersonation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to end impersonation' });
  }
};

// The Business Panel swaps the one-time code from the admin panel for the login token
const exchangeImpersonationCode = async (req, res) => {
  try {
    const result = redeemImpersonationCode(req.body && req.body.code);
    if (!result) {
      return res.status(400).json({ success: false, error: 'This impersonation link has expired or was already used. Start it again from the admin panel.' });
    }
    return res.status(200).json({ success: true, token: result.token, user: result.tenantUser });
  } catch (error) {
    console.error('Impersonation exchange error:', error);
    return res.status(500).json({ success: false, error: 'Failed to start impersonation' });
  }
};

// POST /api/tenant/auth/logout-all
// Logs this account out on every device, this one included (a borrowed laptop, a lost
// phone, a login someone copied). The time is set to the start of the NEXT second, so
// every login issued up to now is refused; logging in again works a second later.
const logoutAllDevices = async (req, res) => {
  try {
    if (req.tenantUser.is_impersonation) {
      return res.status(403).json({ success: false, error: 'This cannot be done while impersonating.' });
    }
    await db.query(
      "UPDATE tenant_users SET logged_out_at = date_trunc('second', NOW()) + INTERVAL '1 second' WHERE id = $1",
      [req.tenantUser.id]
    );
    return res.status(200).json({ success: true, message: 'Logged out of all devices' });
  } catch (error) {
    console.error('Log out of all devices error:', error);
    return res.status(500).json({ success: false, error: 'Failed to log out of all devices' });
  }
};

module.exports = { login, changePassword, endImpersonationSelf, exchangeImpersonationCode, logoutAllDevices };
