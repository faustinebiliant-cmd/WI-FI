// ============================================================
// OSWAGOTech WiFi - Tenant Dashboard Controller
// ============================================================
const supabase = require('../config/supabase');
const { getTodayRangeEAT, formatDateEAT } = require('../utils/tz');

const getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 1. Active sessions (guests online right now)
    const { count: activeSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('ended_at', null);

    // 2. Total vouchers generated (lifetime)
    const { count: totalVouchers } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    // 3. Unused vouchers
    const { count: unusedVouchers } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'unused');

    // 4. Total routers
    const { count: totalRouters } = await supabase
      .from('routers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    // 5. Vouchers USED TODAY (EAT day boundaries, converted to UTC)
    const today = getTodayRangeEAT();
    const { count: vouchersUsedToday } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .gte('used_at', today.start.toISOString())
      .lte('used_at', today.end.toISOString());

    return res.status(200).json({
      success: true,
      data: {
        // Lifetime / current-state stats
        activeGuests: activeSessions || 0,
        totalVouchers: totalVouchers || 0,
        unusedVouchers: unusedVouchers || 0,
        totalRouters: totalRouters || 0,

        // EAT-aware stats
        vouchersUsedToday: vouchersUsedToday || 0,
        todayEAT: formatDateEAT(new Date()), // e.g. "2025-11-20"
        timezone: 'Africa/Dar_es_Salaam',
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

module.exports = { getDashboardStats };