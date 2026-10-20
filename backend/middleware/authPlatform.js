const { verifyAdminToken, verifyTenantToken } = require('../services/jwt');
const db = require('../config/db');

const authPlatform = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No admin token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    // 1. Try verifying as a Platform Admin
    try {
      decoded = verifyAdminToken(token);
    } catch (err) {
      // 2. If that fails, try verifying as an Impersonation Tenant Token
      try {
        const decodedTenant = verifyTenantToken(token);
        if (!decodedTenant.impersonation_token_id) {
          throw new Error('Not an impersonation token');
        }
        decoded = decodedTenant;
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
    }

    // 3. If it's an impersonation token, check the session table
    if (decoded.impersonation_token_id) {
      const { rows } = await db.query(
        'SELECT * FROM impersonation_sessions WHERE token_id = $1 AND ended_at IS NULL',
        [decoded.impersonation_token_id]
      );
      const session = rows[0];

      if (!session || new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ success: false, error: 'Impersonation session expired or ended' });
      }
      
      req.admin = { id: session.admin_id, email: session.admin_email };
      return next();
    }

    // 4. Normal platform admin flow
    const { rows } = await db.query(
      'SELECT id, email, full_name, is_active FROM platform_admins WHERE id = $1',
      [decoded.id]
    );
    const admin = rows[0];

    if (!admin || !admin.is_active) {
      return res.status(401).json({ success: false, error: 'Admin account not found or deactivated' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Auth Platform Error:', error);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

module.exports = authPlatform;