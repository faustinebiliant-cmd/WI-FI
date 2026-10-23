const db = require('../config/db');

const listPackages = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM packages WHERE tenant_id = $1 ORDER BY created_at DESC', [req.tenantId]);
  return res.status(200).json({ success: true, data: rows });
};

const createPackage = async (req, res) => {
  try {
    const { name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps } = req.body;
    
    // Basic presence check
    if (!name || price_tzs === undefined || duration_minutes === undefined || speed_down_kbps === undefined || speed_up_kbps === undefined) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    // A3: MATH VALIDATION
    const price = Number(price_tzs);
    const duration = Number(duration_minutes);
    const down = Number(speed_down_kbps);
    const up = Number(speed_up_kbps);

    if (price < 0 || duration <= 0 || down <= 0 || up <= 0) {
      return res.status(400).json({ success: false, error: 'Price cannot be negative, and duration/speeds must be greater than zero.' });
    }
    
    const { rows } = await db.query(
      `INSERT INTO packages (tenant_id, name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.tenantId, name.trim(), price, duration, down, up]
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