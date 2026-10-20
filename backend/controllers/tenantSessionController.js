const db = require('../config/db');
const { isValidUUID } = require('../utils/validators');
const { getRouter } = require('../services/routers/routerFactory');
const { formatDateTimeEAT } = require('../utils/tz');

const getActiveSessions = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*, v.code as voucher_code, r.name as router_name
      FROM sessions s
      LEFT JOIN vouchers v ON s.voucher_id = v.id
      LEFT JOIN routers r ON s.router_id = r.id
      WHERE s.tenant_id = $1 AND s.ended_at IS NULL
      ORDER BY s.started_at DESC
    `, [req.tenantId]);

    const enriched = rows.map((s) => ({
      ...s,
      started_at_eat: formatDateTimeEAT(s.started_at),
      vouchers: { code: s.voucher_code },
      routers: { name: s.router_name }
    }));

    return res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch active sessions' });
  }
};

const disconnectSession = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid session ID' });

    const { rows } = await db.query(`
      SELECT s.*, r.* FROM sessions s
      JOIN routers r ON s.router_id = r.id
      WHERE s.id = $1 AND s.tenant_id = $2
    `, [id, req.tenantId]);
    
    const session = rows[0];
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const adapter = getRouter(session);
    await adapter.disconnectUser(session.mac_address);

    await db.query(
      `UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Disconnected by Tenant Admin' WHERE id = $1`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'Guest disconnected' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
};

module.exports = { getActiveSessions, disconnectSession };