// ============================================================
// Oswagolink - Disconnect one customer
// Used by the business panel and the admin panel.
//
// Disconnect = the customer is kicked off AND their voucher ends (owner's decision,
// 5 November 2026): typing the same code again says "This voucher has expired".
// - Voucher still running: the router forgets the voucher completely (MikroTik: its
//   user and remembered devices; TP-Link: every phone let in with it), then the voucher
//   is marked expired and all its sessions are closed.
// - No running voucher (already ended): only the device is kicked off.
// Nothing is marked in the database unless the router really did it.
// ============================================================
const db = require('../config/db');
const { getRouter, ROUTER_ADAPTER_COLUMNS } = require('./routers/routerFactory');

// tenantId: only this business's sessions (business panel); null = any session (admin).
// Returns 'ok', 'not_found' or 'router_unreachable'.
const disconnectSession = async (sessionId, tenantId, reason) => {
  const { rows } = await db.query(
    `SELECT s.mac_address, s.voucher_id, v.code AS voucher_code, v.status AS voucher_status,
            ${ROUTER_ADAPTER_COLUMNS}
     FROM sessions s
     JOIN routers r ON r.id = s.router_id
     LEFT JOIN vouchers v ON v.id = s.voucher_id
     WHERE s.id = $1 AND ($2::uuid IS NULL OR s.tenant_id = $2::uuid)`,
    [sessionId, tenantId]
  );
  const session = rows[0];
  if (!session) return 'not_found';

  const voucherRunning = Boolean(session.voucher_id && session.voucher_status === 'active' && session.voucher_code);

  let result;
  try {
    const adapter = getRouter(session);
    result = voucherRunning
      ? await adapter.removeVoucher(session.voucher_code)
      : await adapter.disconnectUser(session.mac_address);
  } catch (err) {
    console.error('Disconnect: router could not be used:', err.message);
    result = null;
  }
  if (!result || !result.ok) return 'router_unreachable';

  if (voucherRunning) {
    // The voucher ends now (both or neither: no ended voucher keeps an open session)
    await db.transaction(async (client) => {
      await client.query(
        "UPDATE vouchers SET status = 'expired', expires_at = LEAST(expires_at, NOW()) WHERE id = $1 AND status = 'active'",
        [session.voucher_id]
      );
      await client.query(
        'UPDATE sessions SET ended_at = NOW(), disconnect_reason = $2 WHERE voucher_id = $1 AND ended_at IS NULL',
        [session.voucher_id, reason]
      );
    });
    return 'ok';
  }

  // ended_at IS NULL: the cleaner may have closed it a moment ago; keep its reason
  await db.query(
    'UPDATE sessions SET ended_at = NOW(), disconnect_reason = $2 WHERE id = $1 AND ended_at IS NULL',
    [sessionId, reason]
  );
  return 'ok';
};

module.exports = { disconnectSession };
