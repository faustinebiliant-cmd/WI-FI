// ============================================================
// OSWAGOTech WiFi - Database Connection (Raw PostgreSQL)
// ============================================================
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false // Local server connection, no SSL needed
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