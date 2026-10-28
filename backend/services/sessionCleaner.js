const db = require('../config/db');
const { getRouter } = require('./routers/routerFactory');

let running = false;

const cleanExpiredSessions = async () => {
  if (running) return; // never run two cleanups at the same time
  running = true;
  try {
    // ---------------------------------------------------------
    // STEP 1: Sync with the router (find ghost sessions)
    // ---------------------------------------------------------
    const { rows: routers } = await db.query(`
      SELECT DISTINCT r.*
      FROM sessions s
      JOIN routers r ON s.router_id = r.id
      WHERE s.ended_at IS NULL
    `);

    for (const router of routers) {
      let activeOnRouter;
      try {
        const adapter = getRouter(router);
        const status = await adapter.checkStatus();
        if (!status || !status.online) {
          continue;
        }
        activeOnRouter = await adapter.getActiveUsers();
      } catch (err) {
        continue; // Skip if router is offline/unreachable
      }

      // Clean the MACs from the router so they match perfectly (UPPERCASE)
      const routerMacs = new Set(
        activeOnRouter.map(u => String(u.mac || '').toUpperCase().trim())
      );

      // Get ALL open sessions for this router
      const { rows: dbSessions } = await db.query(`
        SELECT id, mac_address FROM sessions
        WHERE router_id = $1 AND ended_at IS NULL
      `, [router.id]);

      for (const session of dbSessions) {
        const dbMac = String(session.mac_address || '').toUpperCase().trim();
        
        // If the database thinks it's online, but the router doesn't have it
        if (!routerMacs.has(dbMac)) {
          await db.query(
            "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Left Network' WHERE id = $1",
            [session.id]
          );
          console.log(`[Cleaner] Marked ghost session as ended: ${session.mac_address}`);
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

    if (expired.length > 0) {
      console.log(`[Cleaner] Found ${expired.length} expired vouchers.`);
    }

    const failedRouters = new Set();

    for (const v of expired) {
      try {
        if (failedRouters.has(v.router_id)) continue;

        const routerRes = await db.query('SELECT * FROM routers WHERE id = $1', [v.router_id]);
        const router = routerRes.rows[0];

        if (router) {
          const codeRes = await db.query('SELECT code FROM vouchers WHERE id = $1', [v.id]);
          const result = await getRouter(router).removeVoucher(codeRes.rows[0].code);
          if (!result || !result.ok) {
            failedRouters.add(v.router_id);
            console.error(`[Cleaner] Router ${router.name} could not remove expired voucher ${v.id}. Will retry.`);
            continue; 
          }
        }

        await db.query("UPDATE vouchers SET status = 'expired' WHERE id = $1 AND status = 'active'", [v.id]);
        await db.query(
          "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Time Expired' WHERE voucher_id = $1 AND ended_at IS NULL",
          [v.id]
        );
      } catch (err) {
        console.error(`[Cleaner] Failed to expire voucher ${v.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[Cleaner] Database error:', error);
  } finally {
    running = false;
  }
};

// Run once at startup, then every 60 seconds
const startSessionCleaner = () => {
  cleanExpiredSessions();
  setInterval(cleanExpiredSessions, 60 * 1000);
  console.log('[Cleaner] Session sync and expiration checker started.');
};

module.exports = { startSessionCleaner };