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

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Export query to act as a direct bridge to Postgres
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};