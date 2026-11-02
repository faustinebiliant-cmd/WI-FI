// ============================================================
// Oswagolink - Database Connection (Raw PostgreSQL)
// ============================================================
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: false, // Local server connection, no SSL needed
  // Up to 20 queries at the same time. The backend, the router pinger and the
  // nightly history clean-up each have their own pool: at most 60 together,
  // below PostgreSQL's 100.
  max: 20,
  idleTimeoutMillis: 30000,
  // All connections busy: wait at most 5 seconds instead of forever
  connectionTimeoutMillis: 5000,
  // One stuck query is stopped after 10 seconds, so it cannot hold up everything
  statement_timeout: 10000,
  // A transaction left open (a bug) is closed after 15 seconds, releasing its locks
  idle_in_transaction_session_timeout: 15000
});

pool.on('connect', () => {
  if (env.IS_DEV) console.log('PostgreSQL connected');
});

// The pool drops the broken connection and opens a new one by itself,
// so a short database hiccup must not stop the whole server
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// All or nothing: runs work(client) inside one transaction. If anything in it
// fails (or the server stops halfway), none of its changes are kept.
// Only database work belongs inside: never wait for a router in here.
const transaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// Inside a transaction: one request at a time per business for this purpose
// (for example "routers"), so two quick clicks cannot both pass a limit check.
// The lock ends by itself when the transaction ends.
const lockTenant = (client, purpose, tenantId) =>
  client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${purpose}:${tenantId}`]);

// Export query to act as a direct bridge to Postgres
module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction,
  lockTenant,
  pool
};