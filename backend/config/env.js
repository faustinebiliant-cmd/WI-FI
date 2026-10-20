// ============================================================
// OSWAGOTech WiFi - Environment
// ------------------------------------------------------------
// The one place process.env is read and validated.
//
// server.js, scripts/*, and any controller that needs config
// import from this file. Nothing downstream reads process.env
// directly.
//
// If any check below fails, the process exits with a clear
// message. A misconfigured server must not start.
// ============================================================

require('dotenv').config();

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const fail = (message) => {
  console.error('FATAL: ' + message);
  process.exit(1);
};

const trimmed = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

// ------------------------------------------------------------
// Required string, minimum length
// ------------------------------------------------------------
const requireString = (name, minLength = 1) => {
  const value = trimmed(process.env[name]);
  if (!value) {
    fail(`${name} is missing.`);
  }
  if (value.length < minLength) {
    fail(`${name} must be at least ${minLength} characters.`);
  }
  return value;
};

// ------------------------------------------------------------
// NODE_ENV
// ------------------------------------------------------------
const NODE_ENV = trimmed(process.env.NODE_ENV);
if (!NODE_ENV) {
  fail('NODE_ENV is missing. Set it to "development" or "production".');
}

const IS_DEV = NODE_ENV !== 'production';
const IS_PROD = NODE_ENV === 'production';

// ------------------------------------------------------------
// PORT (optional, defaults to 5001)
// ------------------------------------------------------------
const rawPort = trimmed(process.env.PORT);
const PORT = rawPort ? Number(rawPort) : 5001;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  fail('PORT must be an integer between 1 and 65535.');
}

// ------------------------------------------------------------
// Raw PostgreSQL Credentials (Replaces Supabase)
// ------------------------------------------------------------
const DB_HOST = requireString('DB_HOST');
const DB_PORT = trimmed(process.env.DB_PORT) || '5432';
const DB_USER = requireString('DB_USER');
const DB_PASSWORD = requireString('DB_PASSWORD');
const DB_NAME = requireString('DB_NAME');

// ------------------------------------------------------------
// JWT_SECRET and ADMIN_JWT_SECRET
// ------------------------------------------------------------
const JWT_SECRET = requireString('JWT_SECRET', 32);
const ADMIN_JWT_SECRET = requireString('ADMIN_JWT_SECRET', 32);

if (JWT_SECRET === ADMIN_JWT_SECRET) {
  fail(
    'JWT_SECRET and ADMIN_JWT_SECRET must be different. ' +
    'A tenant token could otherwise be used as a platform token.'
  );
}

// ------------------------------------------------------------
// JWT_EXPIRES_IN (optional, defaults to "1d")
// ------------------------------------------------------------
const JWT_EXPIRES_IN = trimmed(process.env.JWT_EXPIRES_IN) || '1d';

// ------------------------------------------------------------
// ALLOWED_ORIGINS
// ------------------------------------------------------------
const rawOrigins = trimmed(process.env.ALLOWED_ORIGINS);
if (!rawOrigins) {
  fail('ALLOWED_ORIGINS is missing. Set it to a comma-separated list of origins.');
}

const ALLOWED_ORIGINS = rawOrigins
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

if (ALLOWED_ORIGINS.length === 0) {
  fail('ALLOWED_ORIGINS parsed to an empty list. Check for stray commas.');
}

// ------------------------------------------------------------
// ROUTER_MODE
// ------------------------------------------------------------
const ROUTER_MODE = requireString('ROUTER_MODE');
if (ROUTER_MODE !== 'mock' && ROUTER_MODE !== 'real') {
  fail('ROUTER_MODE must be "mock" or "real".');
}

// ------------------------------------------------------------
// ROUTER_ENCRYPTION_KEY (must be exactly 32 chars for AES-256)
// ------------------------------------------------------------
const ROUTER_ENCRYPTION_KEY = requireString('ROUTER_ENCRYPTION_KEY', 32);
if (ROUTER_ENCRYPTION_KEY.length !== 32) {
  fail('ROUTER_ENCRYPTION_KEY must be exactly 32 characters long.');
}

// ------------------------------------------------------------
// Frozen export. Nothing downstream reads process.env.
// ------------------------------------------------------------
const env = Object.freeze({
  NODE_ENV,
  IS_DEV,
  IS_PROD,
  PORT,

  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,

  JWT_SECRET,
  ADMIN_JWT_SECRET,
  JWT_EXPIRES_IN,

  ALLOWED_ORIGINS,

  ROUTER_MODE,
  ROUTER_ENCRYPTION_KEY
});

module.exports = env;