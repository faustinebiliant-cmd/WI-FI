const db = require('../config/db');
const { getRouter } = require('./routers/routerFactory');

const cleanExpiredSessions = async () => {
  try {
    // Find all active sessions where the voucher's expiry time is in the past
    const { rows } = await db.query(`
      SELECT s.id as session_id, s.mac_address, s.voucher_id, s.router_id, r.* 
      FROM sessions s
      JOIN vouchers v ON s.voucher_id = v.id
      JOIN routers r ON s.router_id = r.id
      WHERE s.ended_at IS NULL 
      AND v.expires_at < NOW()
    `);

    if (rows.length === 0) return; // Nothing to do

    console.log(`[Cleaner] Found ${rows.length} expired sessions. Kicking users...`);

    for (const session of rows) {
      try {
        // 1. Tell the Router to kick the user
        const adapter = getRouter(session);
        await adapter.disconnectUser(session.mac_address);

        // 2. Mark the session as ended
        await db.query(
          "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Time Expired' WHERE id = $1",
          [session.session_id]
        );

        // 3. Mark the voucher as expired
        await db.query(
          "UPDATE vouchers SET status = 'expired' WHERE id = $1",
          [session.voucher_id]
        );

        console.log(`[Cleaner] Kicked MAC ${session.mac_address}`);
      } catch (err) {
        console.error(`[Cleaner] Failed to kick MAC ${session.mac_address}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[Cleaner] Database error:', error);
  }
};

// Run this function every 60 seconds (1 minute)
const startSessionCleaner = () => {
  setInterval(cleanExpiredSessions, 60 * 1000);
  console.log('[Cleaner] Session expiration checker started.');
};

module.exports = { startSessionCleaner };