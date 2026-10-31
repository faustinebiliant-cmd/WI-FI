const { verifyAdminToken } = require('../services/jwt');
const db = require('../config/db');

// Only a real platform admin token is accepted here. An impersonation token
// is a tenant token and works in the tenant panel only.
const authPlatform = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No admin token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyAdminToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

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