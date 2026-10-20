const db = require('../config/db');

const listPackages = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM packages WHERE tenant_id = $1 ORDER BY created_at DESC', [req.tenantId]);
  return res.status(200).json({ success: true, data: rows });
};

const createPackage = async (req, res) => {
  try {
    const { name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps } = req.body;
    if (!name || !price_tzs || !duration_minutes || !speed_down_kbps || !speed_up_kbps) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    const { rows } = await db.query(
      `INSERT INTO packages (tenant_id, name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.tenantId, name.trim(), price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps]
    );
    
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to create package' });
  }
};

const deletePackage = async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM packages WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
  return res.status(200).json({ success: true, message: 'Package deleted' });
};

module.exports = { listPackages, createPackage, deletePackage };