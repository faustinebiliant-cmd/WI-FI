const crypto = require('crypto');
const db = require('../config/db');
const { getTodayRangeEAT, formatDateTimeEAT } = require('../utils/tz');
const { getRouter } = require('../services/routers/routerFactory');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOUCHER_STATUSES = ['unused', 'active', 'expired', 'cancelled'];

const generateCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

const generateVouchers = async (req, res) => {
  try {
    const { package_id, quantity } = req.body;

    let count = parseInt(quantity, 10);
    if (!count || count < 1 || count > 50) {
      return res.status(400).json({ success: false, error: 'You can generate between 1 and 50 vouchers at a time.' });
    }

    if (!package_id || !UUID_RE.test(String(package_id))) {
      return res.status(400).json({ success: false, error: 'Please choose a package.' });
    }

    const pkgCheck = await db.query(
      'SELECT id FROM packages WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      [package_id, req.tenantId]
    );
    if (pkgCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Package not found' });

    // Hourly limit (150 per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countRes = await db.query(
      'SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND created_at >= $2',
      [req.tenantId, oneHourAgo]
    );
    const remainingAllowance = 150 - parseInt(countRes.rows[0].count, 10);

    if (remainingAllowance <= 0) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum limit per hour. Please wait before generating more.' });
    }
    if (count > remainingAllowance) count = remainingAllowance;

    // Insert in batches; a duplicate code is skipped and retried
    const created = [];
    for (let attempt = 0; attempt < 5 && created.length < count; attempt++) {
      const need = count - created.length;
      const batch = new Set();
      while (batch.size < need) batch.add(generateCode());

      const { rows } = await db.query(
        `INSERT INTO vouchers (tenant_id, package_id, code, status, created_by)
         SELECT $1::uuid, $2::uuid, c, 'unused', $3::uuid FROM unnest($4::text[]) AS c
         ON CONFLICT (tenant_id, code) DO NOTHING
         RETURNING code`,
        [req.tenantId, package_id, req.tenantUser.id, [...batch]]
      );
      rows.forEach(r => created.push(r.code));
    }

    if (created.length === 0) {
      return res.status(500).json({ success: false, error: 'Could not generate unique codes, please try again.' });
    }

    return res.status(201).json({ success: true, message: `Generated ${created.length} vouchers`, data: created });
  } catch (error) {
    console.error('Generate vouchers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate vouchers' });
  }
};

const listVouchers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
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

    // Filter by status (only known values; anything else is ignored)
    const status = String(req.query.status || '');
    if (VOUCHER_STATUSES.includes(status)) {
      params.push(status);
      query += ` AND v.status = $${params.length}`;
    }

    // Search by code: letters and digits only, so the text is safe inside LIKE
    const search = String(req.query.search || '').trim().toUpperCase();
    if (search) {
      if (!/^[A-Z0-9]{1,32}$/.test(search)) {
        return res.status(400).json({ success: false, error: 'Search with letters and numbers only.' });
      }
      params.push(`%${search}%`);
      query += ` AND upper(v.code) LIKE $${params.length}`;
    }

    const countRes = await db.query(`SELECT COUNT(*) FROM (${query}) AS sub`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    query += ` ORDER BY v.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);

    const formattedData = rows.map(r => ({
      ...r,
      // expires_at stays the exact moment (with time zone), so a countdown is right on any device.
      // expires_at_eat is the same moment written as Tanzania time, for display.
      expires_at_eat: r.expires_at ? formatDateTimeEAT(r.expires_at) : null,
      packages: {
        name: r.package_name,
        router_name: r.router_name
      }
    }));

    return res.status(200).json({
      success: true,
      data: formattedData,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('List vouchers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list vouchers' });
  }
};

const revokeVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(String(id))) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }

    const vRes = await db.query(
      `SELECT v.id, v.code, v.status, p.router_id
       FROM vouchers v
       LEFT JOIN packages p ON p.id = v.package_id
       WHERE v.id = $1 AND v.tenant_id = $2`,
      [id, req.tenantId]
    );
    if (vRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    const v = vRes.rows[0];

    if (v.status === 'cancelled') {
      return res.status(200).json({ success: true, message: 'Voucher already revoked' });
    }

    // Cancel first, so the customer cannot redeem it again while we talk to the router
    const previousStatus = v.status;
    await db.query("UPDATE vouchers SET status = 'cancelled' WHERE id = $1", [v.id]);

    // Only an active voucher has a user on the router
    if (previousStatus === 'active' && v.router_id) {
      const rRes = await db.query(
        'SELECT * FROM routers WHERE id = $1 AND tenant_id = $2',
        [v.router_id, req.tenantId]
      );
      if (rRes.rows[0]) {
        let result;
        try {
          result = await getRouter(rRes.rows[0]).removeVoucher(v.code);
        } catch (err) {
          console.error('Revoke voucher: router could not be used:', err.message);
          result = { ok: false };
        }
        if (!result || !result.ok) {
          // Undo, so the tenant can try again when the router is reachable
          await db.query(
            "UPDATE vouchers SET status = $1 WHERE id = $2 AND status = 'cancelled'",
            [previousStatus, v.id]
          );
          return res.status(503).json({
            success: false,
            error: 'The router could not be reached, so the customer could not be disconnected. The voucher was NOT revoked. Please try again when the router is online.'
          });
        }
      }
    }

    await db.query(
      "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'revoked' WHERE voucher_id = $1 AND ended_at IS NULL",
      [v.id]
    );

    return res.status(200).json({ success: true, message: 'Voucher revoked' });
  } catch (error) {
    console.error('Revoke voucher error:', error);
    return res.status(500).json({ success: false, error: 'Failed to revoke voucher' });
  }
};

module.exports = { generateVouchers, listVouchers, revokeVoucher };