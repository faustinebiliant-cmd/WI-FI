// ============================================================
// OSWAGOTech WiFi - Platform Audit Log Controller
// ============================================================
const supabase = require('../config/db');
const { getTodayRangeEAT, formatDateTimeEAT } = require('../utils/tz');

// GET /api/platform/audit-logs?page=1&limit=50&today=true
const listAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('platform_audit_logs')
      .select('*', { count: 'exact' });

    if (req.query.today === 'true') {
      const { start, end } = getTodayRangeEAT();
      query = query
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Attach an EAT-formatted display string to each row.
    // Frontend can render log.created_at_eat directly instead
    // of converting in the browser (browser TZ may differ).
    const enriched = (data || []).map((row) => ({
      ...row,
      created_at_eat: formatDateTimeEAT(row.created_at),
    }));

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
      filter: req.query.today === 'true' ? { today: true } : null,
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list audit logs' });
  }
};

module.exports = { listAuditLogs };