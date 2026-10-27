const db = require('../config/db');
const { getRouter } = require('./routers/routerFactory');

const cleanExpiredSessions = async () => {
  try {
    // ---------------------------------------------------------
    // STEP 1: Sync with the Router (Find Ghost Sessions)
    // ---------------------------------------------------------
    // Get all routers that have active sessions in the database
    const { rows: routers } = await db.query(`
      SELECT DISTINCT r.* 
      FROM sessions s
      JOIN routers r ON s.router_id = r.id
      WHERE s.ended_at IS NULL
    `);

    for (const router of routers) {
      // Ask the router who is actually online right now
      let activeOnRouter = [];
      try {
        const adapter = getRouter(router);
        activeOnRouter = await adapter.getActiveUsers();
      } catch (err) {
        console.error(`[Cleaner] Could not reach router ${router.name}. Skipping ghost check for this router.`);
        continue; // Move to the next router if this one is offline
      }

      // Create a list of MAC addresses that the router says are online
      const routerMacs = activeOnRouter.map(u => u.mac.toUpperCase());

      // Get all database sessions for this router that think they are active
      const { rows: dbSessions } = await db.query(`
        SELECT id, mac_address FROM sessions
        WHERE router_id = $1 AND ended_at IS NULL
      `, [router.id]);

      // Compare the two lists
      for (const session of dbSessions) {
        const dbMac = session.mac_address.toUpperCase();
        
        // If the database thinks they are online, but the router says they are gone
        if (!routerMacs.includes(dbMac)) {
          await db.query(
            "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Left Network' WHERE id = $1",
            [session.id]
          );
          console.log(`[Cleaner] Marked ghost session as ended: ${session.mac_address}`);
        }
      }
    }

    // ---------------------------------------------------------
    // STEP 2: Expire Vouchers (Kick users whose time is up)
    // ---------------------------------------------------------
    const { rows: expiredSessions } = await db.query(`
      SELECT s.id as session_id, s.mac_address, s.voucher_id, s.router_id, r.* 
      FROM sessions s
      JOIN vouchers v ON s.voucher_id = v.id
      JOIN routers r ON s.router_id = r.id
      WHERE s.ended_at IS NULL 
      AND v.expires_at < NOW()
    `);

    if (expiredSessions.length > 0) {
      console.log(`[Cleaner] Found ${expiredSessions.length} expired sessions. Kicking users...`);
    }

    for (const session of expiredSessions) {
      let kickSuccess = false;
      let disconnectReason = 'Time Expired';

      try {
        const adapter = getRouter(session);
        const result = await adapter.disconnectUser(session.mac_address);
        if (result && result.ok) {
          kickSuccess = true;
        }
      } catch (err) {
        console.error(`[Cleaner] Failed to kick MAC ${session.mac_address}:`, err.message);
        disconnectReason = 'Expired (router unreachable)';
      }

      try {
        await db.query(
          "UPDATE sessions SET ended_at = NOW(), disconnect_reason = $1 WHERE id = $2",
          [disconnectReason, session.session_id]
        );
        await db.query(
          "UPDATE vouchers SET status = 'expired' WHERE id = $1",
          [session.voucher_id]
        );
      } catch (dbErr) {
        console.error(`[Cleaner] Database update failed for session ${session.session_id}:`, dbErr.message);
      }
    }

  } catch (error) {
    console.error('[Cleaner] Database error:', error);
  }
};

// Run this function every 60 seconds (1 minute)
const startSessionCleaner = () => {
  setInterval(cleanExpiredSessions, 60 * 1000);
  console.log('[Cleaner] Session sync and expiration checker started.');
};

module.exports = { startSessionCleaner };