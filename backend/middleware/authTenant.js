// ============================================================
// Oswagolink - Tenant Auth Middleware
// ============================================================
const { verifyTenantToken } = require('../services/jwt');
const db = require('../config/db');
const { TENANT_BLOCKED_SQL, TENANT_BLOCKED_ERROR } = require('./subscriptionGuard');

const authTenant = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No tenant token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyTenantToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired tenant token' });
    }

    // Handle Impersonation (Admin acting as Tenant)
    if (decoded.impersonation_token_id) {
      const { rows } = await db.query(
        'SELECT * FROM impersonation_sessions WHERE token_id = $1 AND ended_at IS NULL',
        [decoded.impersonation_token_id]
      );
      const session = rows[0];

      if (!session || new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ success: false, error: 'Impersonation session expired or ended' });
      }

      req.tenantUser = { id: session.tenant_user_id, role: 'owner', is_impersonation: true };
      req.tenantId = session.tenant_id;
      return next();
    }

    // Normal Tenant User Flow
    const { rows } = await db.query(`
      SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active, u.must_change_password,
             ${TENANT_BLOCKED_SQL} AS tenant_blocked
      FROM tenant_users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1
    `, [decoded.id]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'Tenant user not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    if (user.tenant_blocked) {
      return res.status(403).json(TENANT_BLOCKED_ERROR);
    }

    // A temporary password allows nothing except choosing a new one
    if (user.must_change_password && req.path !== '/auth/change-password') {
      return res.status(403).json({
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        error: 'Please choose a new password first.'
      });
    }

    req.tenantUser = user;
    req.tenantId = user.tenant_id;
    next();
  } catch (error) {
    console.error('Tenant Auth Error:', error);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

module.exports = authTenant;