const db = require('../config/db');
const env = require('../config/env');
const { getRouter, isRouterReady } = require('./routers/routerFactory');
const { isValidMACAddress, isValidIPAddress } = require('../utils/validators');

let running = false;  // router round (every minute)
let expiring = false; // voucher expiry (every 15 seconds)

const EXPIRE_BATCH = 200;
const SYNC_CONCURRENCY = 25;       // routers handled at the same time
const EXPIRE_EVERY_MS = 15 * 1000; // a voucher ends at most about 15 seconds late
const SYNC_EVERY_MS = 60 * 1000;
const SLOW_ROUND_MS = 45 * 1000;   // a round this long means the minute is getting full

// Runs work(item) for every item, at most `limit` at the same time
const runAtSameTime = async (items, limit, work) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await work(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

// Takes a voucher's user off its router (in mock mode the mock router answers ok)
const removeFromRouter = async (router, code) => {
  try {
    return await getRouter(router).removeVoucher(code);
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

// Vouchers past their end time (database clock): take them off the router,
// then mark them expired. The router counts only online time, so without this
// a customer could keep using a voucher long after it should have ended.
// If the router cannot be reached, the voucher stays active and is tried again
// on the next check. Routers already known to be offline are skipped until they return.
const expireVouchers = async () => {
  const { rows } = await db.query(`
    SELECT v.id, v.code, p.router_id,
           r.id AS r_id, r.tenant_id, r.device_type, r.omada_site_id,
           r.ip_address, r.api_port, r.api_username, r.api_password_encrypted
    FROM vouchers v
    LEFT JOIN packages p ON p.id = v.package_id
    LEFT JOIN routers r ON r.id = p.router_id
    WHERE v.status = 'active' AND v.expires_at <= NOW()
      AND ($2::boolean OR r.id IS NULL OR r.status = 'online')
    ORDER BY v.expires_at
    LIMIT $1
  `, [EXPIRE_BATCH, env.ROUTER_MODE !== 'real']);

  // Grouped by router: several routers are handled at the same time (a busy
  // evening must not make customers wait in one long line for their removal),
  // and the vouchers of one router one after the other.
  const byRouter = new Map();
  for (const v of rows) {
    // The adapter needs the router's own id (v.id is the voucher's id)
    const router = { ...v, id: v.r_id };
    const hasRouter = Boolean(v.router_id) && isRouterReady(router);
    const key = hasRouter ? v.router_id : `none:${v.id}`;
    if (!byRouter.has(key)) byRouter.set(key, []);
    byRouter.get(key).push({ ...v, router, hasRouter });
  }

  const expireGroup = async (vouchers) => {
    for (const v of vouchers) {
      if (v.hasRouter) {
        const result = await removeFromRouter(v.router, v.code);
        // Router not reachable: its other vouchers wait for the next check too
        if (!result || !result.ok) return;
      }

      // Both or neither: an expired voucher never keeps an open session
      await db.transaction(async (client) => {
        await client.query("UPDATE vouchers SET status = 'expired' WHERE id = $1 AND status = 'active'", [v.id]);
        await client.query(
          "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Voucher expired' WHERE voucher_id = $1 AND ended_at IS NULL",
          [v.id]
        );
      });
      // The code is also the router password, so only the id is logged
      console.log(`[Cleaner] Voucher ${v.id} expired`);
    }
  };

  await runAtSameTime([...byRouter.values()], SYNC_CONCURRENCY, async (group) => {
    try {
      await expireGroup(group);
    } catch (err) {
      console.error('[Cleaner] Voucher expiry failed for one router:', err.message);
    }
  });
};

// A router that cannot be asked this many minutes in a row counts as offline.
// One failed check is often a short internet hiccup while customers are still online.
const OFFLINE_AFTER_FAILED_CHECKS = 3;
const failedChecks = new Map(); // router id -> failed checks in a row

// Compares the open sessions of one router with the customers the router really has online
const syncRouterSessions = async (router) => {
  // One question, one login: the list of online customers. An answer (even an
  // empty list) also proves the router is online; null = we could not ask it.
  let activeOnRouter = null;
  try {
    activeOnRouter = await getRouter(router).getActiveUsers();
  } catch (err) {
    activeOnRouter = null;
  }
  if (activeOnRouter !== null) {
    // A tampered router could send anything: keep only real device addresses, so rubbish
    // never reaches the database or the logs. An IP that is not a real address is dropped.
    activeOnRouter = (Array.isArray(activeOnRouter) ? activeOnRouter : [])
      .map((u) => ({
        mac: typeof u?.mac === 'string' ? u.mac.trim().toUpperCase().replace(/-/g, ':') : '',
        ip: typeof u?.ip === 'string' && isValidIPAddress(u.ip.trim()) ? u.ip.trim() : null,
        voucherCode: typeof u?.voucherCode === 'string' && u.voucherCode.length <= 32 ? u.voucherCode : ''
      }))
      .filter((u) => isValidMACAddress(u.mac));
    // The router answered: the 5-minute pinger does not need to ask it again
    await db.query("UPDATE routers SET status = 'online', last_seen_at = NOW() WHERE id = $1", [router.id]);
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
      // ended_at IS NULL: the voucher expiry (its own timer) may have closed it a moment ago
      await db.query(
        "UPDATE sessions SET ended_at = NOW(), disconnect_reason = $1 WHERE id = $2 AND ended_at IS NULL",
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

    // DO NOTHING: the portal may have recorded this same device a moment ago
    // (only one open session per voucher and device, see idx_sessions_one_open)
    const inserted = await db.query(
      `INSERT INTO sessions (tenant_id, router_id, voucher_id, mac_address, ip_address, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [router.tenant_id, router.id, vouchers[0].id, mac, user.ip || null]
    );
    stillOpenMacs.add(mac);
    if (inserted.rowCount > 0) {
      console.log(`[Cleaner] Recorded returning customer session for voucher ${vouchers[0].id}`);
    }
  }
};

const cleanExpiredSessions = async () => {
  if (running) return;
  running = true;
  const startedAt = Date.now();
  try {
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
    await runAtSameTime(routers, SYNC_CONCURRENCY, async (router) => {
      try {
        await syncRouterSessions(router);
      } catch (err) {
        console.error(`[Cleaner] Session sync failed for router ${router.id}:`, err.message);
      }
    });

    const tookMs = Date.now() - startedAt;
    if (tookMs > SLOW_ROUND_MS) {
      console.warn(`[Cleaner] Slow round: ${routers.length} routers took ${Math.round(tookMs / 1000)} s (limit 60 s)`);
    }
  } catch (error) {
    console.error('[Cleaner] Database error:', error);
  } finally {
    running = false;
  }
};

// Voucher expiry has its own, faster timer: it must not wait behind the router round
const runVoucherExpiry = async () => {
  if (expiring) return;
  expiring = true;
  try {
    await expireVouchers();
  } catch (error) {
    console.error('[Cleaner] Voucher expiry error:', error.message);
  } finally {
    expiring = false;
  }
};

// Returns a function that stops both timers (used when the server shuts down)
const startSessionCleaner = () => {
  runVoucherExpiry();
  const expiryTimer = setInterval(runVoucherExpiry, EXPIRE_EVERY_MS);
  cleanExpiredSessions();
  const syncTimer = setInterval(cleanExpiredSessions, SYNC_EVERY_MS);
  console.log('[Cleaner] Session sync and expiration checker started.');
  return () => {
    clearInterval(expiryTimer);
    clearInterval(syncTimer);
  };
};

module.exports = { startSessionCleaner };