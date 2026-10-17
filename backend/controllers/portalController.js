// ============================================================
// OSWAGOTech WiFi - Portal Controller
// ============================================================
const supabase = require('../config/supabase');
const { getRouter } = require('../services/routers/routerFactory');
const { isValidMACAddress, isValidIPAddress, isValidVoucherCode } = require('../utils/validators');

// GET /api/portal/info/:router_token
const getPortalInfo = async (req, res) => {
  try {
    const { router_token } = req.params;
    const { data: router } = await supabase
      .from('routers')
      .select('*, tenants(business_name, logo_url)')
      .eq('router_token', router_token)
      .single();

    if (!router) return res.status(404).json({ success: false, error: 'Router not found' });

    return res.status(200).json({
      success: true,
      data: {
        business_name: router.tenants.business_name,
        logo_url: router.tenants.logo_url
      }
    });
  } catch (error) {
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

    // Security Validations
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

    // 1. Get the router
    const { data: router } = await supabase.from('routers').select('*').eq('router_token', router_token).single();
    if (!router) return res.status(404).json({ success: false, error: 'Router not found' });

    // 2. Find the voucher
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*, packages(*)')
      .eq('tenant_id', router.tenant_id)
      .eq('code', cleanCode)
      .maybeSingle();

    if (!voucher) {
      return res.status(404).json({ success: false, error: 'Invalid voucher code' });
    }

    if (voucher.status !== 'unused') {
      return res.status(400).json({ success: false, error: 'Voucher has already been used or expired' });
    }

    // 3. Tell the Router Adapter to authorize the MAC address
    const adapter = getRouter(router);
    const routerResult = await adapter.createVoucher(
      voucher.code,
      voucher.packages.duration_minutes,
      voucher.packages.speed_down_kbps
    );

    if (!routerResult.ok) {
      return res.status(500).json({ success: false, error: 'Router failed to authorize connection' });
    }

    // 4. Update the voucher and create the session
    const now = new Date();
    const expiresAt = new Date(now.getTime() + voucher.packages.duration_minutes * 60000);

    await supabase.from('vouchers').update({ status: 'active', used_at: now }).eq('id', voucher.id);

    await supabase.from('sessions').insert({
      tenant_id: router.tenant_id,
      router_id: router.id,
      voucher_id: voucher.id,
      mac_address: mac_address,
      ip_address: ip_address || null,
      started_at: now
    });

    return res.status(200).json({
      success: true,
      message: 'Connected successfully',
      data: {
        duration_minutes: voucher.packages.duration_minutes,
        speed_down_mbps: voucher.packages.speed_down_kbps / 1024,
        expires_at: expiresAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Redeem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process voucher' });
  }
};

module.exports = { getPortalInfo, redeemVoucher };