// ============================================================
// Oswagolink - Platform Auth Controller
// ============================================================
const db = require('../config/db');
const { verifyPassword } = require('../services/password');
const { signAdminToken } = require('../services/jwt');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Find the admin using Raw SQL
    const { rows } = await db.query(
      'SELECT * FROM platform_admins WHERE email = $1', 
      [cleanEmail]
    );
    const admin = rows[0];

    // Use a generic error message so attackers can't guess valid emails
    const FAILED = { success: false, error: 'Invalid credentials' };

    if (!admin) return res.status(401).json(FAILED);
    if (!admin.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

    // 2. Check password
    const isValid = await verifyPassword(password, admin.password_hash);
    if (!isValid) return res.status(401).json(FAILED);

    // 3. Generate Token
    const token = signAdminToken({
      id: admin.id,
      email: admin.email,
      type: 'admin'
    });

    // 4. Update last login time
    await db.query(
      'UPDATE platform_admins SET last_login_at = NOW() WHERE id = $1',
      [admin.id]
    );

    return res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'An error occurred during login' });
  }
};

const getMe = async (req, res) => {
  // req.admin was attached by the authPlatform middleware
  return res.status(200).json({ success: true, admin: req.admin });
};

module.exports = { login, getMe };