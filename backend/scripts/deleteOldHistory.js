// ============================================================
// Oswagolink - Nightly history clean-up
// Runs once: deletes history older than KEEP_DAYS, then exits.
// Keeps the tables small, so pages and backups stay fast at 500 businesses.
//
// Deleted: ended sessions, and expired or cancelled vouchers.
// Never deleted: unused or active vouchers (still for sale / in use),
// payments (money records), and the admin audit logs.
// ============================================================
const db = require('../config/db');

const KEEP_DAYS = 30; // 1 month of history
const BATCH = 5000;   // small steps: each one is short, so customers never wait behind it

// Repeats one DELETE until nothing older is left
const deleteInBatches = async (sql) => {
  let total = 0;
  for (;;) {
    const { rowCount } = await db.query(sql, [KEEP_DAYS, BATCH]);
    total += rowCount;
    if (rowCount < BATCH) return total;
  }
};

const run = async () => {
  // Sessions first: a voucher's sessions are usually gone before the voucher itself
  const sessions = await deleteInBatches(
    `DELETE FROM sessions WHERE id IN (
       SELECT id FROM sessions
       WHERE ended_at < NOW() - make_interval(days => $1::int)
       LIMIT $2)`
  );

  // A voucher's last moment is the latest of: made, first used, ended.
  // One a customer is still connected with is left alone.
  const vouchers = await deleteInBatches(
    `DELETE FROM vouchers WHERE id IN (
       SELECT v.id FROM vouchers v
       WHERE v.status IN ('expired', 'cancelled')
         AND GREATEST(v.created_at, v.used_at, v.expires_at) < NOW() - make_interval(days => $1::int)
         AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.voucher_id = v.id AND s.ended_at IS NULL)
       LIMIT $2)`
  );

  console.log(`[History] Deleted history older than ${KEEP_DAYS} days: sessions=${sessions} vouchers=${vouchers}`);
};

run()
  .catch((err) => {
    console.error('[History] Clean-up failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await db.pool.end(); } catch (e) { /* ignore */ }
    process.exit(process.exitCode || 0);
  });
