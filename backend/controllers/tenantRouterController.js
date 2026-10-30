// ============================================================
// OSWAGOTech WiFi - Tenant Router Controller
// ============================================================
const crypto = require('crypto');
const db = require('../config/db');
const { isSafeText } = require('../utils/validators');
const { encrypt } = require('../utils/encryption');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROUTERS_PER_TENANT = 10;

// Only what the page needs. Tokens and passwords are never sent to the browser.
const listRouters = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, location_label, ip_address, status, last_seen_at, created_at
       FROM routers
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenantId]
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('List routers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list routers' });
  }
};

const createRouter = async (req, res) => {
  try {
    // Only the name and the location come from the browser.
    // Tokens, address and password are created here, on the server.
    const name = String((req.body && req.body.name) || '').trim();
    const location = String((req.body && req.body.location_label) || '').trim();

    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Please enter a router name (up to 100 characters).' });
    }
    if (!isSafeText(name)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in the router name.' });
    }
    if (location && (location.length > 100 || !isSafeText(location))) {
      return res.status(400).json({ success: false, error: 'Invalid location.' });
    }

    const countRes = await db.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [req.tenantId]);
    if (parseInt(countRes.rows[0].count, 10) >= MAX_ROUTERS_PER_TENANT) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum number of routers.' });
    }

    const provisionToken = crypto.randomBytes(24).toString('hex'); // 48 characters, secret
    const routerToken = crypto.randomBytes(16).toString('hex');    // used in the guest portal link
    const apiPassword = crypto.randomBytes(16).toString('hex');    // one password per router

    const encryptedPassword = encrypt(apiPassword);
    if (!encryptedPassword) {
      return res.status(500).json({ success: false, error: 'Encryption failed' });
    }

    const { rows } = await db.query(
      `INSERT INTO routers
         (tenant_id, name, location_label, ip_address, api_port, api_username,
          api_password_encrypted, router_token, status, provision_token)
       VALUES ($1, $2, $3, '0.0.0.0', 8728, 'wifiapi', $4, $5, 'offline', $6)
       RETURNING id, name, location_label, ip_address, status, provision_token`,
      [req.tenantId, name, location || null, encryptedPassword, routerToken, provisionToken]
    );

    // This is the ONLY time the setup token is sent to the browser
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create router' });
  }
};

const deleteRouter = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(String(id))) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    const { rows } = await db.query(
      'DELETE FROM routers WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, req.tenantId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    return res.status(200).json({ success: true, message: 'Router and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete router' });
  }
};

module.exports = { listRouters, createRouter, deleteRouter };