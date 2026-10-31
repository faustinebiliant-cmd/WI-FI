const db = require('../config/db');
const { isValidUUID } = require('../utils/validators');

// Every router is set up with speed profiles for 1 to 20 Mbps (see provisionController),
// so a package speed must be one of those: a whole number of Mbps from 1 to 20.
const MIN_SPEED_KBPS = 1 * 1024;
const MAX_SPEED_KBPS = 20 * 1024;
const isAllowedSpeed = (kbps) => Number.isInteger(kbps) && kbps % 1024 === 0 && kbps >= MIN_SPEED_KBPS && kbps <= MAX_SPEED_KBPS;

const listPackages = async (req, res) => {
  try {
    // Include the router name for the frontend
    const { rows } = await db.query(`
      SELECT p.*, r.name as router_name
      FROM packages p
      LEFT JOIN routers r ON p.router_id = r.id
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC
    `, [req.tenantId]);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('List packages error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list packages' });
  }
};

const createPackage = async (req, res) => {
  try {
    const { name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps, router_id } = req.body;
    
    if (!name || price_tzs === undefined || duration_minutes === undefined || speed_down_kbps === undefined || speed_up_kbps === undefined || !router_id) {
      return res.status(400).json({ success: false, error: 'All fields, including Router, are required' });
    }

    // Limit check: Max 20 packages per tenant
    const countRes = await db.query('SELECT COUNT(*) FROM packages WHERE tenant_id = $1', [req.tenantId]);
    if (parseInt(countRes.rows[0].count) >= 20) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum limit of 20 packages.' });
    }

    if (!isValidUUID(router_id)) {
      return res.status(400).json({ success: false, error: 'Invalid router selected.' });
    }

    // Check if the router belongs to this tenant
    const routerCheck = await db.query('SELECT id FROM routers WHERE id = $1 AND tenant_id = $2', [router_id, req.tenantId]);
    if (routerCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Invalid router selected.' });
    }

    // MATH VALIDATION & MAX LIMITS
    const price = Number(price_tzs);
    const duration = Number(duration_minutes);
    const down = Number(speed_down_kbps);
    const up = Number(speed_up_kbps);

    if (![price, duration, down, up].every(Number.isFinite)) {
      return res.status(400).json({ success: false, error: 'Price, duration and speeds must be numbers.' });
    }
    if (price < 0) return res.status(400).json({ success: false, error: 'Price cannot be negative.' });
    if (duration <= 0 || duration > 525600) return res.status(400).json({ success: false, error: 'Duration must be between 1 minute and 365 days.' });
    if (!isAllowedSpeed(down) || !isAllowedSpeed(up)) {
      return res.status(400).json({ success: false, error: 'Speed must be a whole number from 1 to 20 Mbps.' });
    }
    
    const { rows } = await db.query(
      `INSERT INTO packages (tenant_id, router_id, name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.tenantId, router_id, name.trim(), price, duration, down, up]
    );
    
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Failed to create package' });
  }
};

const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid package ID' });

    // Deleting a package also deletes its vouchers. Refuse while customers may still
    // hold a sold code (unused) or are using one (active), so nobody loses paid time.
    const inUse = await db.query(
      "SELECT COUNT(*) FROM vouchers WHERE package_id = $1 AND tenant_id = $2 AND status IN ('unused', 'active')",
      [id, req.tenantId]
    );
    const inUseCount = parseInt(inUse.rows[0].count, 10);
    if (inUseCount > 0) {
      return res.status(409).json({
        success: false,
        error: `This package still has ${inUseCount} unused or active voucher(s). Revoke them, or wait until they are used and expired, then delete the package.`
      });
    }

    await db.query('DELETE FROM packages WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    return res.status(200).json({ success: true, message: 'Package deleted' });
  } catch (error) {
    console.error('Delete package error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete package' });
  }
};

module.exports = { listPackages, createPackage, deletePackage };