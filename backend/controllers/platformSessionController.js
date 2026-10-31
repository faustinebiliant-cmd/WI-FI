const db = require('../config/db');
const { getRouter } = require('../services/routers/routerFactory');
const { formatDateTimeEAT } = require('../utils/tz');

const listAllSessions = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*, t.business_name as tenant_name, r.name as router_name
      FROM sessions s
      JOIN tenants t ON s.tenant_id = t.id
      JOIN routers r ON s.router_id = r.id
      WHERE s.ended_at IS NULL
      ORDER BY s.started_at DESC
    `);

    const enriched = rows.map((s) => ({
      ...s,
      started_at_eat: formatDateTimeEAT(s.started_at),
      tenants: { business_name: s.tenant_name },
      routers: { name: s.router_name }
    }));

    return res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
};

const forceDisconnect = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT s.*, r.* FROM sessions s JOIN routers r ON s.router_id = r.id WHERE s.id = $1', [id]);
    const session = rows[0];
    
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    // Only mark the session ended if the router really kicked the guest off
    let result;
    try {
      result = await getRouter(session).disconnectUser(session.mac_address);
    } catch (err) {
      result = { ok: false };
    }
    if (!result || !result.ok) {
      return res.status(503).json({ success: false, error: 'The router could not be reached, so the guest was NOT disconnected.' });
    }

    await db.query(
      `UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Force disconnected by Platform Admin' WHERE id = $1`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'Guest disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
};

module.exports = { listAllSessions, forceDisconnect };