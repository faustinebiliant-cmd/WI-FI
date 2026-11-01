// ============================================================
// Oswagolink - Tenant Dashboard Controller
// ============================================================
const db = require('../config/db');
const { getTodayRangeEAT, formatDateEAT } = require('../utils/tz');

const getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // All five numbers in one trip to the database.
    // "Used today" uses EAT day boundaries, converted to UTC; a voucher used
    // today may already have expired: it still counts.
    const today = getTodayRangeEAT();
    const { rows } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM sessions WHERE tenant_id = $1 AND ended_at IS NULL) AS active_customers,
        (SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1) AS total_vouchers,
        (SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND status = 'unused') AS unused_vouchers,
        (SELECT COUNT(*) FROM routers WHERE tenant_id = $1) AS total_routers,
        (SELECT COUNT(*) FROM vouchers
         WHERE tenant_id = $1 AND status IN ('active', 'expired') AND used_at >= $2 AND used_at <= $3) AS used_today
    `, [tenantId, today.start.toISOString(), today.end.toISOString()]);
    const stats = rows[0];

    return res.status(200).json({
      success: true,
      data: {
        activeCustomers: parseInt(stats.active_customers, 10),
        totalVouchers: parseInt(stats.total_vouchers, 10),
        unusedVouchers: parseInt(stats.unused_vouchers, 10),
        totalRouters: parseInt(stats.total_routers, 10),
        vouchersUsedToday: parseInt(stats.used_today, 10),
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