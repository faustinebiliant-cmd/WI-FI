// ============================================================
// Oswagolink - Tenant Dashboard Controller
// ============================================================
const db = require('../config/db');
const { getTodayRangeEAT, formatDateEAT } = require('../utils/tz');

const getDashboardStats = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // 1. Active sessions (customers online right now)
    const activeSessions = await db.query('SELECT COUNT(*) FROM sessions WHERE tenant_id = $1 AND ended_at IS NULL', [tenantId]);
    
    // 2. Total vouchers generated
    const totalVouchers = await db.query('SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1', [tenantId]);
    
    // 3. Unused vouchers
    const unusedVouchers = await db.query("SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND status = 'unused'", [tenantId]);
    
    // 4. Total routers
    const totalRouters = await db.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [tenantId]);

    // 5. Vouchers USED TODAY (EAT day boundaries, converted to UTC)
    const today = getTodayRangeEAT();
    const vouchersUsedToday = await db.query(
      // A voucher used today may already have expired: it still counts
      "SELECT COUNT(*) FROM vouchers WHERE tenant_id = $1 AND status IN ('active', 'expired') AND used_at >= $2 AND used_at <= $3",
      [tenantId, today.start.toISOString(), today.end.toISOString()]
    );

    return res.status(200).json({
      success: true,
      data: {
        activeCustomers: parseInt(activeSessions.rows[0].count),
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