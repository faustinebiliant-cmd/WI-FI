const db = require('../config/db');
const { getRouter } = require('../services/routers/routerFactory');
const { isValidMACAddress, isValidIPAddress, isValidVoucherCode } = require('../utils/validators');

// GET /api/portal/info/:router_token
const getPortalInfo = async (req, res) => {
  try {
    const { router_token } = req.params;

    const routerRes = await db.query(`
      SELECT r.*, t.business_name, t.logo_url 
      FROM routers r JOIN tenants t ON r.tenant_id = t.id 
      WHERE r.router_token = $1
    `, [router_token]);

    if (routerRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }

    const router = routerRes.rows[0];

    const packagesRes = await db.query(
      'SELECT id, name, price_tzs, duration_minutes, speed_down_kbps FROM packages WHERE tenant_id = $1 AND router_id = $2 AND is_active = true',
      [router.tenant_id, router.id]
    );

    return res.status(200).json({
      success: true,
      data: {
        business_name: router.business_name,
        logo_url: router.logo_url,
        packages: packagesRes.rows
      }
    });
  } catch (error) {
    console.error('Portal info error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load portal info' });
  }
};

// POST /api/portal/redeem
const redeemVoucher = async (req, res) => {
  try {
    const { router_token, code, mac_address, ip_address } = req.body;

    if (!router_token || !code || !mac_address) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!isValidMACAddress(mac_address)) {
      return res.status(400).json({ success: false, error: 'Invalid device MAC address' });
    }
    if (ip_address && !isValidIPAddress(ip_address)) {
      return res.status(400).json({ success: false, error: 'Invalid device IP address' });
    }

    const cleanCode = String(code).toUpperCase().trim();
    if (!isValidVoucherCode(cleanCode)) {
      return res.status(400).json({ success: false, error: 'Invalid voucher format' });
    }

    const routerRes = await db.query('SELECT * FROM routers WHERE router_token = $1', [router_token]);
    const router = routerRes.rows[0];
    if (!router) return res.status(404).json({ success: false, error: 'Router not found' });

    if (router.status === 'offline') {
      return res.status(400).json({ success: false, error: 'Router is currently offline. Please contact the management.' });
    }

    let voucher;
    let resumed = false;

    // 1. First use: claim a fresh voucher (only one request can win this)
    const claimRes = await db.query(`
      UPDATE vouchers 
      SET status = 'active', used_at = NOW(), expires_at = NOW() + (SELECT duration_minutes FROM packages WHERE id = vouchers.package_id) * INTERVAL '1 minute'
      WHERE tenant_id = $1 AND code = $2 AND status = 'unused'
      AND package_id IN (SELECT id FROM packages WHERE router_id = $3)
      RETURNING id, package_id, expires_at
    `, [router.tenant_id, cleanCode, router.id]);

    if (claimRes.rows.length > 0) {
      voucher = claimRes.rows[0];
    } else {
      // 2. Not fresh: a running voucher coming back (power cut, reconnect)
      const existingRes = await db.query(
        `SELECT id, package_id, status, expires_at FROM vouchers
         WHERE tenant_id = $1 AND code = $2
         AND package_id IN (SELECT id FROM packages WHERE router_id = $3)`,
        [router.tenant_id, cleanCode, router.id]
      );
      const existing = existingRes.rows[0];

      if (!existing) {
        const anyRes = await db.query('SELECT 1 FROM vouchers WHERE tenant_id = $1 AND code = $2', [router.tenant_id, cleanCode]);
        if (anyRes.rows.length > 0) {
          return res.status(400).json({ success: false, error: 'This voucher is not valid for this router.' });
        }
        return res.status(404).json({ success: false, error: 'Invalid voucher code' });
      }
      if (existing.status === 'cancelled') {
        return res.status(400).json({ success: false, error: 'This voucher has been cancelled.' });
      }
      if (existing.status !== 'active' || new Date(existing.expires_at) <= new Date()) {
        return res.status(400).json({ success: false, error: 'This voucher has expired.' });
      }
      voucher = existing;
      resumed = true;
    }

    const pkgRes = await db.query(
      'SELECT duration_minutes, speed_down_kbps, speed_up_kbps FROM packages WHERE id = $1',
      [voucher.package_id]
    );
    const pkg = pkgRes.rows[0];

    // Minutes left on the voucher's own clock (the full duration on first use)
    const remainingMinutes = Math.max(1, Math.ceil((new Date(voucher.expires_at) - Date.now()) / 60000));

    const adapter = getRouter(router);
    const routerResult = await adapter.createVoucher(cleanCode, remainingMinutes, pkg.speed_down_kbps, pkg.speed_up_kbps);

    if (!routerResult.ok) {
      if (!resumed) {
        await db.query("UPDATE vouchers SET status = 'unused', used_at = NULL, expires_at = NULL WHERE id = $1", [voucher.id]);
      }
      return res.status(500).json({ success: false, error: 'Router failed to authorize connection' });
    }

    // Close any old open session of this voucher, then record the new one
    await db.query(
      "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'new login' WHERE voucher_id = $1 AND ended_at IS NULL",
      [voucher.id]
    );
    await db.query(
      `INSERT INTO sessions (tenant_id, router_id, voucher_id, mac_address, ip_address, started_at) 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [router.tenant_id, router.id, voucher.id, mac_address, ip_address || null]
    );

    return res.status(200).json({
      success: true,
      message: resumed ? 'Welcome back, reconnecting' : 'Connected successfully',
      data: {
        resumed,
        duration_minutes: pkg.duration_minutes,
        speed_down_mbps: pkg.speed_down_kbps / 1024,
        expires_at: voucher.expires_at
      }
    });
  } catch (error) {
    console.error('Redeem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process voucher' });
  }
};

module.exports = { getPortalInfo, redeemVoucher };