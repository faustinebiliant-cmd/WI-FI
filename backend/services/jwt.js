// ============================================================
// OSWAGOTech WiFi - JWT Service
// ============================================================
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// ------------------------------------------------------------
// Platform Admin Tokens
// ------------------------------------------------------------
const signAdminToken = (payload) => {
  return jwt.sign(payload, env.ADMIN_JWT_SECRET, {
    expiresIn: '12h' // Admins can stay logged in a bit longer
  });
};

const verifyAdminToken = (token) => {
  return jwt.verify(token, env.ADMIN_JWT_SECRET);
};

// ------------------------------------------------------------
// Tenant Tokens (We will use this later)
// ------------------------------------------------------------
const signTenantToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });
};

const verifyTenantToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

module.exports = {
  signAdminToken,
  verifyAdminToken,
  signTenantToken,
  verifyTenantToken
};