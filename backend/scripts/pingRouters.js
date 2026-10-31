// ============================================================
// OSWAGOTech WiFi - Background Router Pinger
// Runs once: checks every router, updates its status, then exits.
// ============================================================
const db = require('../config/db');
const env = require('../config/env');
const MikroTikRouter = require('../services/routers/MikroTikRouter');

// Sized so that even 500 silent routers fit in one run:
// 500 / 25 at a time x 8 seconds = 160 seconds, below the 4.5 minute limit set in server.js
const CONCURRENCY = 25;           // routers checked at the same time
const CHECK_TIMEOUT_MS = 8000;    // give up on one router after 8 seconds
const OFFLINE_AFTER_MINUTES = 8;  // show "offline" only after this long without an answer

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);

const checkOne = async (r) => {
  try {
    // Not set up yet: nothing to check
    if (!r.ip_address || r.ip_address === '0.0.0.0') return 'skipped';

    const adapter = new MikroTikRouter(r);
    const status = await withTimeout(adapter.checkStatus(), CHECK_TIMEOUT_MS);

    if (status && status.online) {
      await db.query(
        "UPDATE routers SET status = 'online', last_seen_at = NOW() WHERE id = $1",
        [r.id]
      );
      return 'online';
    }
  } catch (err) {
    console.error(`[Pinger] Router ${r.id} check failed:`, err.message);
  }

  // No answer: mark offline only if it has been silent for a while
  await db.query(
    `UPDATE routers SET status = 'offline'
     WHERE id = $1
       AND (last_seen_at IS NULL OR last_seen_at < NOW() - make_interval(mins => $2::int))`,
    [r.id, OFFLINE_AFTER_MINUTES]
  );
  return 'no-answer';
};

const run = async () => {
  if (env.ROUTER_MODE !== 'real') {
    console.log('[Pinger] Skipped (router mode is not real).');
    return;
  }

  console.log('[Pinger] Checking router statuses...');
  const { rows: routers } = await db.query(
    // Random order: if a run is ever cut short, a different set of routers misses out each time
    'SELECT id, ip_address, api_port, api_username, api_password_encrypted FROM routers ORDER BY random()'
  );

  const counts = { online: 0, 'no-answer': 0, skipped: 0 };
  let next = 0;

  const worker = async () => {
    while (next < routers.length) {
      const r = routers[next++];
      const result = await checkOne(r);
      counts[result] = (counts[result] || 0) + 1;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, routers.length) }, worker)
  );

  console.log(
    `[Pinger] Finished checking routers. online=${counts.online} no-answer=${counts['no-answer']} skipped=${counts.skipped}`
  );
};

run()
  .catch((err) => {
    console.error('[Pinger] Fatal error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await db.pool.end(); } catch (e) { /* ignore */ }
    process.exit(process.exitCode || 0);
  });