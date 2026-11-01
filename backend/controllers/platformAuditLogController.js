const db = require('../config/db');
const { formatDateTimeEAT } = require('../utils/tz');

const listAuditLogs = async (req, res) => {
  try {
    // Page size 1 to 200, so one request can never ask for the whole log
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const [countRes, { rows }] = await Promise.all([
      db.query('SELECT COUNT(*) FROM platform_audit_logs'),
      db.query(
        'SELECT * FROM platform_audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      )
    ]);
    const total = parseInt(countRes.rows[0].count, 10);

    const enriched = rows.map((row) => ({
      ...row,
      created_at_eat: formatDateTimeEAT(row.created_at),
    }));

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list audit logs' });
  }
};

module.exports = { listAuditLogs };