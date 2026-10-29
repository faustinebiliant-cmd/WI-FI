const db = require('../config/db');
const { getRouter } = require('./routers/routerFactory');

let running = false;

const cleanExpiredSessions = async () => {
  if (running) return;
  running = true;
  try {
    // ---------------------------------------------------------
    // STEP 1: Get the live list of MACs directly from the router
    // ---------------------------------------------------------
    const { rows: routers } = await db.query(`
      SELECT DISTINCT r.*
      FROM sessions s
      JOIN routers r ON s.router_id = r.id
      WHERE s.ended_at IS NULL
    `);

    for (const router of routers) {
      let activeOnRouter = [];
      let routerIsOnline = false;

      try {
        const adapter = getRouter(router);
        const status = await adapter.checkStatus();
        
        if (status && status.online) {
          routerIsOnline = true;
          activeOnRouter = await adapter.getActiveUsers();
          console.log(`[Cleaner] Router ${router.name} reports ${activeOnRouter.length} active devices.`);
        } else {
          console.log(`[Cleaner] Router ${router.name} is OFFLINE. Kicking everyone.`);
        }
      } catch (err) {
        console.log(`[Cleaner] Router ${router.name} unreachable. Kicking everyone.`);
      }

      // Clean the MACs from the router so they match perfectly (UPPERCASE, no spaces)
      const routerMacs = new Set(
        activeOnRouter.map(u => String(u.mac || '').toUpperCase().trim())
      );

      // Get ALL open sessions for this router
      const { rows: dbSessions } = await db.query(`
        SELECT id, mac_address FROM sessions
        WHERE router_id = $1 AND ended_at IS NULL
      `, [router.id]);

      console.log(`[Cleaner] Database thinks ${dbSessions.length} devices are online for ${router.name}.`);

      for (const session of dbSessions) {
        const dbMac = String(session.mac_address || '').toUpperCase().trim();
        
        // If the router is offline OR the MAC is not actively on the router, close it.
        if (!routerIsOnline || !routerMacs.has(dbMac)) {
          const reason = !routerIsOnline ? 'Router Offline' : 'Left Network';
          await db.query(
            "UPDATE sessions SET ended_at = NOW(), disconnect_reason = $1 WHERE id = $2",
            [reason, session.id]
          );
          console.log(`[Cleaner] Closed ghost session: ${dbMac} (${reason})`);
        }
      }
    }

    // ---------------------------------------------------------
    // STEP 2: Expire vouchers whose time is up
    // ---------------------------------------------------------
    const { rows: expired } = await db.query(`
      SELECT v.id, v.package_id, p.router_id
      FROM vouchers v
      JOIN packages p ON p.id = v.package_id
      WHERE v.status = 'active' AND v.expires_at < NOW()
      ORDER BY v.expires_at ASC
      LIMIT 100
    `);

    for (const v of expired) {
      await db.query("UPDATE vouchers SET status = 'expired' WHERE id = $1 AND status = 'active'", [v.id]);
      await db.query(
        "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Time Expired' WHERE voucher_id = $1 AND ended_at IS NULL",
        [v.id]
      );
    }
  } catch (error) {
    console.error('[Cleaner] Database error:', error);
  } finally {
    running = false;
  }
};

const startSessionCleaner = () => {
  cleanExpiredSessions();
  setInterval(cleanExpiredSessions, 60 * 1000);
  console.log('[Cleaner] Session sync and expiration checker started.');
};

module.exports = { startSessionCleaner };