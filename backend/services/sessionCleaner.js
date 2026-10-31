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
// a customer could keep using a voucher long after it should have ended.
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

const SYNC_CONCURRENCY = 10;
// A router that cannot be asked this many minutes in a row counts as offline.
// One failed check is often a short internet hiccup while customers are still online.
const OFFLINE_AFTER_FAILED_CHECKS = 3;
const failedChecks = new Map(); // router id -> failed checks in a row

// Compares the open sessions of one router with the customers the router really has online
const syncRouterSessions = async (router) => {
  let activeOnRouter = null; // null = we could not ask the router
  try {
    const adapter = getRouter(router);
    const status = await adapter.checkStatus();
    if (status && status.online) {
      activeOnRouter = await adapter.getActiveUsers();
    }
  } catch (err) {
    activeOnRouter = null;
  }

  let routerOffline = false;
  if (activeOnRouter === null) {
    const fails = (failedChecks.get(router.id) || 0) + 1;
    failedChecks.set(router.id, fails);
    if (fails < OFFLINE_AFTER_FAILED_CHECKS) return; // wait and ask again next minute
    if (fails === OFFLINE_AFTER_FAILED_CHECKS) {
      console.log(`[Cleaner] Router ${router.name} did not answer ${fails} times in a row. Closing its sessions.`);
    }
    routerOffline = true;
  } else {
    failedChecks.delete(router.id);
  }

  const routerMacs = new Set(
    (activeOnRouter || []).map((u) => String(u.mac || '').toUpperCase().trim())
  );

  const { rows: dbSessions } = await db.query(`
    SELECT id, mac_address FROM sessions
    WHERE router_id = $1 AND ended_at IS NULL
  `, [router.id]);

  const stillOpenMacs = new Set();
  for (const session of dbSessions) {
    const dbMac = String(session.mac_address || '').toUpperCase().trim();

    // Router offline for several minutes, OR the router answered and this device is not online
    if (routerOffline || !routerMacs.has(dbMac)) {
      const reason = routerOffline ? 'Router Offline' : 'Left Network';
      await db.query(
        "UPDATE sessions SET ended_at = NOW(), disconnect_reason = $1 WHERE id = $2",
        [reason, session.id]
      );
      console.log(`[Cleaner] Closed session for ${dbMac} (${reason})`);
    } else {
      stillOpenMacs.add(dbMac);
    }
  }

  if (routerOffline) return;

  // A returning customer can be logged in by the router itself (it remembers the device),
  // without passing the portal. Record a session for every device the router has online
  // with a valid voucher of this router, so the dashboards count them.
  for (const user of activeOnRouter) {
    const mac = String(user.mac || '').toUpperCase().trim();
    const code = String(user.voucherCode || '').trim();
    if (!mac || !code || stillOpenMacs.has(mac)) continue;

    const { rows: vouchers } = await db.query(`
      SELECT v.id FROM vouchers v
      JOIN packages p ON p.id = v.package_id
      WHERE v.tenant_id = $1 AND v.code = $2 AND p.router_id = $3
        AND v.status = 'active' AND v.expires_at > NOW()
    `, [router.tenant_id, code, router.id]);
    if (vouchers.length === 0) continue; // not one of our valid vouchers (for example a router test user)

    await db.query(
      `INSERT INTO sessions (tenant_id, router_id, voucher_id, mac_address, ip_address, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [router.tenant_id, router.id, vouchers[0].id, mac, user.ip || null]
    );
    stillOpenMacs.add(mac);
    console.log(`[Cleaner] Recorded returning customer session for voucher ${vouchers[0].id}`);
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
    // In mock mode there are no real customers to compare with.
    if (env.ROUTER_MODE !== 'real') return;

    // Routers with open sessions, or with vouchers still in use: a returning customer
    // the router logged in by itself may be the only one on that router
    const { rows: routers } = await db.query(`
      SELECT r.* FROM routers r
      WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.router_id = r.id AND s.ended_at IS NULL)
         OR EXISTS (
           SELECT 1 FROM vouchers v JOIN packages p ON p.id = v.package_id
           WHERE p.router_id = r.id AND v.status = 'active' AND v.expires_at > NOW()
         )
    `);

    // Several routers at the same time, so hundreds of routers still fit in one round
    let next = 0;
    const worker = async () => {
      while (next < routers.length) {
        const router = routers[next++];
        try {
          await syncRouterSessions(router);
        } catch (err) {
          console.error(`[Cleaner] Session sync failed for router ${router.id}:`, err.message);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, routers.length) }, worker));
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