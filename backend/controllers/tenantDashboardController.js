const db = require('../config/supabase');
const { getTodayRangeEAT, formatDateEAT } = require('../utils/tz');

const getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const activeSessions = await db.query('SELECT COUNT(*) FROM sessions WHERE tenant_id = $1 AND ended_at IS NULL', [tenantId]);
    const totalVouchers = await db.query('SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1', [tenantId]);
    const unusedVouchers = await db.query("SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND status = 'unused'", [tenantId]);
    const totalRouters = await db.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [tenantId]);

    const today = getTodayRangeEAT();
    const vouchersUsedToday = await db.query(
      "SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND status = 'active' AND used_at >= $2 AND used_at <= $3",
      [tenantId, today.start.toISOString(), today.end.toISOString()]
    );

    return res.status(200).json({
      success: true,
      data: {
        activeGuests: parseInt(activeSessions.rows[0].count),
        totalVouchers: parseInt(totalVouchers.rows[0].count),
        unusedVouchers: parseInt(unusedVouchers.rows[0].count),
        totalRouters: parseInt(totalRouters.rows[0].count),
        vouchersUsedToday: parseInt(vouchersUsedToday.rows[0].count),
        todayEAT: formatDateEAT(new Date()),
        timezone: 'Africa/Dar_es_Salaam',
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

module.exports = { getDashboardStats };