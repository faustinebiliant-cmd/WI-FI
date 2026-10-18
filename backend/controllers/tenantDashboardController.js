// ============================================================
// OSWAGOTech WiFi - Tenant Dashboard Controller
// ============================================================
const supabase = require('../config/supabase');
const { getTodayRangeEAT } = require('../utils/tz'); // We will build this util next

const getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 1. Get active sessions count (guests online right now)
    const { count: activeSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('ended_at', null);

    // 2. Get total vouchers generated
    const { count: totalVouchers } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    // 3. Get unused vouchers
    const { count: unusedVouchers } = await supabase
      .from('vouchers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'unused');

    // 4. Get total routers
    const { count: totalRouters } = await supabase
      .from('routers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    return res.status(200).json({
      success: true,
      data: {
        activeGuests: activeSessions || 0,
        totalVouchers: totalVouchers || 0,
        unusedVouchers: unusedVouchers || 0,
        totalRouters: totalRouters || 0
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

module.exports = { getDashboardStats };