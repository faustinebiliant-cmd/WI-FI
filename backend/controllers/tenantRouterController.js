// ============================================================
// OSWAGOTech WiFi - Tenant Router Controller
// ============================================================
const crypto = require('crypto');
const db = require('../config/db');
const { isValidIPAddress, isSafeText } = require('../utils/validators');
const { encrypt } = require('../utils/encryption');

const listRouters = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM routers WHERE tenant_id = $1', [req.tenantId]);
  return res.status(200).json({ success: true, data: rows });
};

const createRouter = async (req, res) => {
  try {
    const { name, location_label, ip_address, api_port, api_username, api_password } = req.body;

    if (!name || !ip_address || !api_username || !api_password) {
      return res.status(400).json({ success: false, error: 'Name, IP, Username and Password are required' });
    }

    if (!isSafeText(name) || !isSafeText(api_username)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in name or username' });
    }

    if (!isValidIPAddress(ip_address)) {
      return res.status(400).json({ success: false, error: 'Invalid IP address format' });
    }

    const encryptedPassword = encrypt(api_password);
    if (!encryptedPassword) return res.status(500).json({ success: false, error: 'Encryption failed' });

    const routerToken = crypto.randomBytes(16).toString('hex');

    const { rows } = await db.query(
      `INSERT INTO routers (tenant_id, name, location_label, ip_address, api_port, api_username, api_password_encrypted, router_token, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'offline') RETURNING *`,
      [req.tenantId, name.trim(), location_label, ip_address, api_port || 8728, api_username, encryptedPassword, routerToken]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create router' });
  }
};

const deleteRouter = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if router exists and belongs to this tenant
    const checkRes = await db.query('SELECT id FROM routers WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    // Delete the router. The database schema has ON DELETE CASCADE for packages and sessions,
    // so deleting the router will automatically delete its packages and vouchers.
    await db.query('DELETE FROM routers WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);

    return res.status(200).json({ success: true, message: 'Router and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete router' });
  }
};

module.exports = { listRouters, createRouter, deleteRouter };