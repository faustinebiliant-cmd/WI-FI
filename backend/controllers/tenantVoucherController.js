const crypto = require('crypto');
const db = require('../config/db');
const { getTodayRangeEAT, formatDateTimeEAT } = require('../utils/tz');
const { getRouter } = require('../services/routers/routerFactory');

const generateCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

const generateVouchers = async (req, res) => {
  try {
    const { package_id, quantity } = req.body;
    
    let count = parseInt(quantity) || 50; 
    if (count < 1 || count > 50) {
      return res.status(400).json({ success: false, error: 'You can generate between 1 and 50 vouchers at a time.' });
    }

    const pkgCheck = await db.query('SELECT id FROM packages WHERE id = $1 AND tenant_id = $2', [package_id, req.tenantId]);
    if (pkgCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Package not found' });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countRes = await db.query(
      'SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND created_at >= $2',
      [req.tenantId, oneHourAgo]
    );
    const generatedLastHour = parseInt(countRes.rows[0].count);
    const remainingAllowance = 150 - generatedLastHour;

    if (remainingAllowance <= 0) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum limit per hour. Please wait before generating more.' });
    }

    if (count > remainingAllowance) {
      count = remainingAllowance;
    }

    const vouchers = [];
    for (let i = 0; i < count; i++) {
      const code = generateCode();
      const { rows } = await db.query(
        `INSERT INTO vouchers (tenant_id, package_id, code, status, created_by) 
         VALUES ($1, $2, $3, 'unused', $4) RETURNING code`,
        [req.tenantId, package_id, code, req.tenantUser.id]
      );
      vouchers.push(rows[0].code);
    }

    return res.status(201).json({ success: true, message: `Generated ${count} vouchers`, data: vouchers });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to generate vouchers' });
  }
};

const listVouchers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let query = `
      SELECT v.*, p.name as package_name, r.name as router_name 
      FROM vouchers v 
      LEFT JOIN packages p ON v.package_id = p.id 
      LEFT JOIN routers r ON p.router_id = r.id
      WHERE v.tenant_id = $1
    `;
    const params = [req.tenantId];

    if (req.query.today === 'true') {
      const { start, end } = getTodayRangeEAT();
      if (req.query.scope === 'used') {
        query += ` AND v.used_at >= $2 AND v.used_at <= $3`;
      } else {
        query += ` AND v.created_at >= $2 AND v.created_at <= $3`;
      }
      params.push(start.toISOString(), end.toISOString());
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM (${query}) AS sub`, params);
    const total = parseInt(countRes.rows[0].count);

    query += ` ORDER BY v.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);

    const formattedData = rows.map(r => {
      let expiresAtEat = null;
      if (r.expires_at) {
        expiresAtEat = formatDateTimeEAT(r.expires_at);
      }
      return {
        ...r,
        expires_at: expiresAtEat,
        packages: { 
          name: r.package_name,
          router_name: r.router_name 
        }
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedData,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Failed to list vouchers' });
  }
};

// UPDATED: This now tells the MikroTik to kick the user
const revokeVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Find the voucher and its router
    const vRes = await db.query(
      `SELECT v.id, v.code, p.router_id FROM vouchers v
       JOIN packages p ON p.id = v.package_id
       WHERE v.id = $1 AND v.tenant_id = $2`, [id, req.tenantId]);
       
    if (vRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Voucher not found' });
    const v = vRes.rows[0];

    // 2. Tell the router to kick the user
    let routerCleaned = true;
    const rRes = await db.query('SELECT * FROM routers WHERE id = $1 AND tenant_id = $2', [v.router_id, req.tenantId]);
    if (rRes.rows[0]) {
      const result = await getRouter(rRes.rows[0]).removeVoucher(v.code);
      routerCleaned = result.ok;
    }

    // 3. Mark as cancelled in the database
    await db.query("UPDATE vouchers SET status = 'cancelled' WHERE id = $1", [v.id]);
    
    // 4. Close the active session
    await db.query(
      "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'revoked' WHERE voucher_id = $1 AND ended_at IS NULL",
      [v.id]
    );

    return res.status(200).json({ success: true, message: 'Voucher revoked' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Failed to revoke voucher' });
  }
};

module.exports = { generateVouchers, listVouchers, revokeVoucher };