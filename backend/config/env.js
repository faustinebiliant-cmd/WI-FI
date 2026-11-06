// ============================================================
// Oswagolink - Environment
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
// PostgreSQL connection (the database on this VPS)
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
// ADMIN_HOST (optional, e.g. "admin.oswagolink.co.tz")
// When set, the admin API answers only on this address, where Nginx
// checks the device passes. Empty = no restriction (development).
// ------------------------------------------------------------
const ADMIN_HOST = (trimmed(process.env.ADMIN_HOST) || '').toLowerCase();
if (ADMIN_HOST && !/^[a-z0-9.-]{1,253}$/.test(ADMIN_HOST)) {
  fail('ADMIN_HOST must be a plain host name such as admin.oswagolink.co.tz (no https://, no slash).');
}
if (IS_PROD && !ADMIN_HOST) {
  console.warn('WARNING: ADMIN_HOST is empty: the admin API answers on every address, not only on the admin site. Set ADMIN_HOST=admin.oswagolink.co.tz in .env.');
}

// ------------------------------------------------------------
// TP-Link Omada controller (optional: all five or none)
// The controller runs on this VPS (Docker box "omada"). The backend talks to it
// only inside the VPS, and only after checking its certificate fingerprint.
//   OMADA_CONTROLLER_ID       32 hexadecimal characters (https://127.0.0.1:8043/api/info)
//   OMADA_OPERATOR_USER       the hotspot operator (role Hotspot Admin)
//   OMADA_OPERATOR_PASSWORD   its password (secret)
//   OMADA_CERT_SHA256         the controller's certificate fingerprint (64 hex, colons allowed)
//   OMADA_PORT                optional, default 8043
// Without them, TP-Link routers are switched off; MikroTik routers are not affected.
// ------------------------------------------------------------
const OMADA_NAMES = ['OMADA_CONTROLLER_ID', 'OMADA_OPERATOR_USER', 'OMADA_OPERATOR_PASSWORD', 'OMADA_CERT_SHA256'];
const omadaSet = OMADA_NAMES.filter((name) => trimmed(process.env[name]));
if (omadaSet.length > 0 && omadaSet.length < OMADA_NAMES.length) {
  fail(`TP-Link settings are incomplete: set all of ${OMADA_NAMES.join(', ')} (or none of them).`);
}
const OMADA_ENABLED = omadaSet.length === OMADA_NAMES.length;
const OMADA_CONTROLLER_ID = (trimmed(process.env.OMADA_CONTROLLER_ID) || '').toLowerCase();
const OMADA_OPERATOR_USER = trimmed(process.env.OMADA_OPERATOR_USER);
// The password is used exactly as written (no trimming of inner characters)
const OMADA_OPERATOR_PASSWORD = typeof process.env.OMADA_OPERATOR_PASSWORD === 'string'
  ? process.env.OMADA_OPERATOR_PASSWORD.trim()
  : '';
const OMADA_CERT_SHA256 = (trimmed(process.env.OMADA_CERT_SHA256) || '').replace(/:/g, '').toLowerCase();
const rawOmadaPort = trimmed(process.env.OMADA_PORT);
const OMADA_PORT = rawOmadaPort ? Number(rawOmadaPort) : 8043;
if (OMADA_ENABLED) {
  if (!/^[0-9a-f]{32}$/.test(OMADA_CONTROLLER_ID)) {
    fail('OMADA_CONTROLLER_ID must be the 32 hexadecimal characters shown as omadacId at https://127.0.0.1:8043/api/info');
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(OMADA_OPERATOR_USER)) {
    fail('OMADA_OPERATOR_USER must be 1 to 64 letters, numbers, dots, dashes or underscores.');
  }
  if (OMADA_OPERATOR_PASSWORD.length < 8 || OMADA_OPERATOR_PASSWORD.length > 64) {
    fail('OMADA_OPERATOR_PASSWORD must be 8 to 64 characters.');
  }
  if (!/^[0-9a-f]{64}$/.test(OMADA_CERT_SHA256)) {
    fail('OMADA_CERT_SHA256 must be the controller certificate SHA-256 fingerprint (64 hexadecimal characters).');
  }
  if (!Number.isInteger(OMADA_PORT) || OMADA_PORT < 1 || OMADA_PORT > 65535) {
    fail('OMADA_PORT must be an integer between 1 and 65535.');
  }
}

// ------------------------------------------------------------
// TP-Link Open API key (optional: both or none; needs the five OMADA_* above)
// Created in the controller: Global > Settings > Platform Integration > Open API,
// mode Client, role Admin, all sites. Used for automation (sites, adopt, speeds).
//   OMADA_OPENAPI_CLIENT_ID       32 hexadecimal characters
//   OMADA_OPENAPI_CLIENT_SECRET   its secret
// ------------------------------------------------------------
const OMADA_OPENAPI_CLIENT_ID = (trimmed(process.env.OMADA_OPENAPI_CLIENT_ID) || '').toLowerCase();
const OMADA_OPENAPI_CLIENT_SECRET = trimmed(process.env.OMADA_OPENAPI_CLIENT_SECRET);
if (Boolean(OMADA_OPENAPI_CLIENT_ID) !== Boolean(OMADA_OPENAPI_CLIENT_SECRET)) {
  fail('TP-Link Open API settings are incomplete: set both OMADA_OPENAPI_CLIENT_ID and OMADA_OPENAPI_CLIENT_SECRET (or neither).');
}
const OMADA_OPENAPI_ENABLED = Boolean(OMADA_OPENAPI_CLIENT_ID);
if (OMADA_OPENAPI_ENABLED) {
  if (!OMADA_ENABLED) {
    fail('OMADA_OPENAPI_* needs the other TP-Link settings (OMADA_CONTROLLER_ID, OMADA_OPERATOR_USER, OMADA_OPERATOR_PASSWORD, OMADA_CERT_SHA256).');
  }
  if (!/^[0-9a-f]{32}$/.test(OMADA_OPENAPI_CLIENT_ID)) {
    fail('OMADA_OPENAPI_CLIENT_ID must be the 32 hexadecimal characters shown as Client ID in the controller.');
  }
  if (!/^[A-Za-z0-9]{16,128}$/.test(OMADA_OPENAPI_CLIENT_SECRET)) {
    fail('OMADA_OPENAPI_CLIENT_SECRET must be the Client Secret shown in the controller (letters and numbers only).');
  }
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
  ADMIN_HOST,

  ROUTER_MODE,
  ROUTER_ENCRYPTION_KEY,

  OMADA_ENABLED,
  OMADA_CONTROLLER_ID,
  OMADA_OPERATOR_USER,
  OMADA_OPERATOR_PASSWORD,
  OMADA_CERT_SHA256,
  OMADA_PORT,

  OMADA_OPENAPI_ENABLED,
  OMADA_OPENAPI_CLIENT_ID,
  OMADA_OPENAPI_CLIENT_SECRET
});

module.exports = env;