const db = require('../config/db');
const { getRouter } = require('../services/routers/routerFactory');
const { isValidMACAddress, isValidIPAddress, isValidVoucherCode } = require('../utils/validators');

// GET /api/portal/info/:router_token
const getPortalInfo = async (req, res) => {
  try {
    const { router_token } = req.params;
    
    // Fetch router and tenant details
    const routerRes = await db.query(`
      SELECT r.*, t.business_name, t.logo_url 
      FROM routers r JOIN tenants t ON r.tenant_id = t.id 
      WHERE r.router_token = $1
    `, [router_token]);

    if (routerRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }

    const router = routerRes.rows[0];

    // Fetch active packages for this tenant
    const packagesRes = await db.query(
      'SELECT id, name, price_tzs, duration_minutes, speed_down_kbps FROM packages WHERE tenant_id = $1 AND is_active = true',
      [router.tenant_id]
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

    // SECURITY VALIDATIONS
    if (!isValidMACAddress(mac_address)) {
      return res.status(400).json({ success: false, error: 'Invalid device MAC address' });
    }

    if (ip_address && !isValidIPAddress(ip_address)) {
      return res.status(400).json({ success: false, error: 'Invalid device IP address' });
    }

    const cleanCode = code.toUpperCase().trim();
    if (!isValidVoucherCode(cleanCode)) {
      return res.status(400).json({ success: false, error: 'Invalid voucher format' });
    }

    // Verify router exists
    const routerRes = await db.query('SELECT * FROM routers WHERE router_token = $1', [router_token]);
    const router = routerRes.rows[0];
    if (!router) return res.status(404).json({ success: false, error: 'Router not found' });

    // Find the voucher
    const voucherRes = await db.query(`
      SELECT v.*, p.duration_minutes, p.speed_down_kbps 
      FROM vouchers v JOIN packages p ON v.package_id = p.id 
      WHERE v.tenant_id = $1 AND v.code = $2
    `, [router.tenant_id, cleanCode]);
    
    const voucher = voucherRes.rows[0];
    if (!voucher) return res.status(404).json({ success: false, error: 'Invalid voucher code' });
    if (voucher.status !== 'unused') return res.status(400).json({ success: false, error: 'Voucher has already been used or expired' });

    // Tell Router to authorize
    const adapter = getRouter(router);
    const routerResult = await adapter.createVoucher(voucher.code, voucher.duration_minutes, voucher.speed_down_kbps);

    if (!routerResult.ok) return res.status(500).json({ success: false, error: 'Router failed to authorize connection' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + voucher.duration_minutes * 60000);

    // Update voucher and create session
    await db.query("UPDATE vouchers SET status = 'active', used_at = NOW() WHERE id = $1", [voucher.id]);
    
    await db.query(
      `INSERT INTO sessions (tenant_id, router_id, voucher_id, mac_address, ip_address, started_at) 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [router.tenant_id, router.id, voucher.id, mac_address, ip_address || null]
    );

    return res.status(200).json({
      success: true,
      message: 'Connected successfully',
      data: {
        duration_minutes: voucher.duration_minutes,
        speed_down_mbps: voucher.speed_down_kbps / 1024,
        expires_at: expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Redeem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process voucher' });
  }
};

module.exports = { getPortalInfo, redeemVoucher };