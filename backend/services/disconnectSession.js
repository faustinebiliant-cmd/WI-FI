// ============================================================
// Oswagolink - Disconnect one customer
// Used by the business panel and the admin panel. The session is
// marked ended only when the router really kicked the device off.
// ============================================================
const db = require('../config/db');
const { getRouter, ROUTER_ADAPTER_COLUMNS } = require('./routers/routerFactory');

// tenantId: only this business's sessions (business panel); null = any session (admin).
// Returns 'ok', 'not_found' or 'router_unreachable'.
const disconnectSession = async (sessionId, tenantId, reason) => {
  const { rows } = await db.query(
    `SELECT s.mac_address, ${ROUTER_ADAPTER_COLUMNS}
     FROM sessions s
     JOIN routers r ON r.id = s.router_id
     WHERE s.id = $1 AND ($2::uuid IS NULL OR s.tenant_id = $2::uuid)`,
    [sessionId, tenantId]
  );
  const session = rows[0];
  if (!session) return 'not_found';

  let result;
  try {
    result = await getRouter(session).disconnectUser(session.mac_address);
  } catch (err) {
    console.error('Disconnect: router could not be used:', err.message);
    result = null;
  }
  if (!result || !result.ok) return 'router_unreachable';

  // ended_at IS NULL: the cleaner may have closed it a moment ago; keep its reason
  await db.query(
    'UPDATE sessions SET ended_at = NOW(), disconnect_reason = $2 WHERE id = $1 AND ended_at IS NULL',
    [sessionId, reason]
  );
  return 'ok';
};

module.exports = { disconnectSession };
