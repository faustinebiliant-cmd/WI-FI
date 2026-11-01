// ============================================================
// Oswagolink - Database Connection (Raw PostgreSQL)
// ============================================================
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false, // Local server connection, no SSL needed
  // Up to 20 queries at the same time (the backend and the router pinger each
  // have their own pool: 40 together, well below PostgreSQL's 100)
  max: 20,
  idleTimeoutMillis: 30000,
  // All connections busy: wait at most 5 seconds instead of forever
  connectionTimeoutMillis: 5000,
  // One stuck query is stopped after 10 seconds, so it cannot hold up everything
  statement_timeout: 10000
});

pool.on('connect', () => {
  if (env.IS_DEV) console.log('PostgreSQL connected');
});

// The pool drops the broken connection and opens a new one by itself,
// so a short database hiccup must not stop the whole server
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// Export query to act as a direct bridge to Postgres
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};