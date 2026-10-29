const db = require('../config/db');
const { getRouter } = require('./routers/routerFactory');

let running = false;

const cleanExpiredSessions = async () => {
  if (running) return;
  running = true;
  try {
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
        } else {
          console.log(`[Cleaner] Router ${router.name} is OFFLINE. Wiping ghost sessions.`);
        }
      } catch (err) {
        console.log(`[Cleaner] Router ${router.name} unreachable. Wiping ghost sessions.`);
      }

      const routerMacs = new Set(
        activeOnRouter.map(u => String(u.mac || '').toUpperCase().trim())
      );

      const { rows: dbSessions } = await db.query(`
        SELECT id, mac_address FROM sessions
        WHERE router_id = $1 AND ended_at IS NULL
      `, [router.id]);

      for (const session of dbSessions) {
        const dbMac = String(session.mac_address || '').toUpperCase().trim();
        
        // If the router is offline, OR the MAC is not on the router, close it.
        if (!routerIsOnline || !routerMacs.has(dbMac)) {
          const reason = !routerIsOnline ? 'Router Offline' : 'Left Network';
          await db.query(
            "UPDATE sessions SET ended_at = NOW(), disconnect_reason = $1 WHERE id = $2",
            [reason, session.id]
          );
          console.log(`[Cleaner] Closed session for ${dbMac} (${reason})`);
        }
      }
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