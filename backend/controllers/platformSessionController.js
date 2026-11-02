const db = require('../config/db');
const { disconnectSession } = require('../services/disconnectSession');
const { formatDateTimeEAT } = require('../utils/tz');
const { isValidUUID } = require('../utils/validators');

// With 500 businesses thousands of customers can be online: the page shows the newest ones
const SESSIONS_SHOWN = 200;

const listAllSessions = async (req, res) => {
  try {
    const [{ rows }, countRes] = await Promise.all([
      db.query(`
        SELECT s.id, s.mac_address, s.started_at, t.business_name as tenant_name, r.name as router_name
        FROM sessions s
        JOIN tenants t ON s.tenant_id = t.id
        JOIN routers r ON s.router_id = r.id
        WHERE s.ended_at IS NULL
        ORDER BY s.started_at DESC
        LIMIT $1
      `, [SESSIONS_SHOWN]),
      db.query('SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL')
    ]);

    const enriched = rows.map((s) => ({
      ...s,
      started_at_eat: formatDateTimeEAT(s.started_at),
      tenants: { business_name: s.tenant_name },
      routers: { name: s.router_name }
    }));

    return res.status(200).json({ success: true, data: enriched, total: parseInt(countRes.rows[0].count, 10) });
  } catch (error) {
    console.error('List all sessions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
};

const forceDisconnect = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid session ID' });
    const outcome = await disconnectSession(id, null, 'Force disconnected by Platform Admin');
    if (outcome === 'not_found') return res.status(404).json({ success: false, error: 'Session not found' });
    if (outcome === 'router_unreachable') {
      return res.status(503).json({ success: false, error: 'The router could not be reached, so the customer was NOT disconnected.' });
    }

    return res.status(200).json({ success: true, message: 'Customer disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
};

module.exports = { listAllSessions, forceDisconnect };