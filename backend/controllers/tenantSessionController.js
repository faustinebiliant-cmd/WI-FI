const db = require('../config/db');
const { isValidUUID } = require('../utils/validators');
const { disconnectSession: disconnectOne } = require('../services/disconnectSession');
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
      // Convert UTC from database to EAT string for the frontend
      started_at_eat: formatDateTimeEAT(s.started_at),
      vouchers: { code: s.voucher_code },
      routers: { name: s.router_name }
    }));

    return res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error('List active sessions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch active sessions' });
  }
};

const disconnectSession = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid session ID' });

    const outcome = await disconnectOne(id, req.tenantId, 'Disconnected by Tenant Admin');
    if (outcome === 'not_found') return res.status(404).json({ success: false, error: 'Session not found' });
    if (outcome === 'router_unreachable') {
      return res.status(503).json({ success: false, error: 'The router could not be reached, so the customer was NOT disconnected. Please try again when the router is online.' });
    }

    return res.status(200).json({ success: true, message: 'Customer disconnected' });
  } catch (error) {
    console.error('Disconnect session error:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
};

module.exports = { getActiveSessions, disconnectSession };