const db = require('../config/db');
const env = require('../config/env');
const { getRouter } = require('./routers/routerFactory');
const MikroTikRouter = require('./routers/MikroTikRouter');

let running = false;

const EXPIRE_BATCH = 200;

// Takes a voucher's user off its router. In mock mode there is no router to talk to.
const removeFromRouter = async (router, code) => {
  if (env.ROUTER_MODE !== 'real') return { ok: true };
  try {
    return await new MikroTikRouter(router).removeVoucher(code);
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

// Vouchers past their end time (database clock): take them off the router,
// then mark them expired. The router counts only online time, so without this
// a guest could keep using a voucher long after it should have ended.
// If the router cannot be reached, the voucher stays active and is tried again
// next minute. Routers already known to be offline are skipped until they return.
const expireVouchers = async () => {
  const { rows } = await db.query(`
    SELECT v.id, v.code, p.router_id,
           r.ip_address, r.api_port, r.api_username, r.api_password_encrypted
    FROM vouchers v
    LEFT JOIN packages p ON p.id = v.package_id
    LEFT JOIN routers r ON r.id = p.router_id
    WHERE v.status = 'active' AND v.expires_at <= NOW()
      AND ($2::boolean OR r.id IS NULL OR r.status = 'online')
    ORDER BY v.expires_at
    LIMIT $1
  `, [EXPIRE_BATCH, env.ROUTER_MODE !== 'real']);

  const failedRouters = new Set();

  for (const v of rows) {
    const hasRouter = v.router_id && v.ip_address && v.ip_address !== '0.0.0.0';
    if (hasRouter) {
      if (failedRouters.has(v.router_id)) continue;
      const result = await removeFromRouter(v, v.code);
      if (!result || !result.ok) {
        failedRouters.add(v.router_id);
        continue;
      }
    }

    await db.query("UPDATE vouchers SET status = 'expired' WHERE id = $1 AND status = 'active'", [v.id]);
    await db.query(
      "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Voucher expired' WHERE voucher_id = $1 AND ended_at IS NULL",
      [v.id]
    );
    // The code is also the router password, so only the id is logged
    console.log(`[Cleaner] Voucher ${v.id} expired`);
  }
};

const cleanExpiredSessions = async () => {
  if (running) return;
  running = true;
  try {
    try {
      await expireVouchers();
    } catch (error) {
      console.error('[Cleaner] Voucher expiry error:', error.message);
    }

    // Comparing sessions with the router only makes sense with real routers.
    // In mock mode there are no real guests to compare with.
    if (env.ROUTER_MODE !== 'real') return;

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