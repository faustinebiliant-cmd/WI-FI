// ============================================================
// OSWAGOTech WiFi - Rate Limiter
// ============================================================
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const devMax = (n) => (env.IS_DEV ? n * 10 : n);

const limitMessage = (error) => ({
  success: false,
  error
});

// ------------------------------------------------------------
// Platform Login Limiter (Strict)
// ------------------------------------------------------------
const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: devMax(5), // 5 attempts in prod, 50 in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many login attempts. Please try again in 15 minutes.')
});

// ------------------------------------------------------------
// Tenant Login Limiter (Strict - 10 Minutes)
// ------------------------------------------------------------
const tenantLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: devMax(5), // 5 attempts in prod, 50 in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many login attempts. Please try again in 10 minutes.')
});

// ------------------------------------------------------------
// Voucher Redemption Limiter (Protects against brute-force - 10 Minutes)
// ------------------------------------------------------------
const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: devMax(5), // 5 attempts in prod, 100 in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many attempts. Please wait 5 minutes and try again.')
});

module.exports = {
  platformLoginLimiter,
  tenantLoginLimiter,
  redeemLimiter
};