const db = require('../config/db');
const { formatDateTimeEAT } = require('../utils/tz');

const listAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const countRes = await db.query('SELECT COUNT(*) FROM platform_audit_logs');
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await db.query(
      'SELECT * FROM platform_audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

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
    return res.status(500).json({ success: false, error: 'Failed to list audit logs' });
  }
};

module.exports = { listAuditLogs };