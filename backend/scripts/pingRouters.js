// ============================================================
// OSWAGOTech WiFi - Background Router Pinger (Raw PostgreSQL)
// ============================================================
const db = require('../config/db');
const { getRouter } = require('../services/routers/routerFactory');

const pingAllRouters = async () => {
  console.log('[Pinger] Checking router statuses...');
  
  try {
    // 1. Get all routers using Raw SQL
    const { rows: routers } = await db.query('SELECT * FROM routers');

    for (const r of routers) {
      try {
        const adapter = getRouter(r);
        
        // If we are in dev mode, MockRouter doesn't have checkStatus.
        // So we only ping if we are in "real" mode.
        if (typeof adapter.checkStatus === 'function') {
          const status = await adapter.checkStatus();
          
          if (status.online) {
            await db.query(
              'UPDATE routers SET status = $1, last_seen_at = NOW() WHERE id = $2',
              ['online', r.id]
            );
          } else {
            await db.query(
              'UPDATE routers SET status = $1 WHERE id = $2',
              ['offline', r.id]
            );
          }
        }
      } catch (err) {
        console.error(`[Pinger] Failed to ping router ${r.name}:`, err.message);
      }
    }
    console.log('[Pinger] Finished checking routers.');
  } catch (err) {
    console.error('[Pinger] Fatal error:', err.message);
  }
};

// Run immediately when the script is executed
pingAllRouters();