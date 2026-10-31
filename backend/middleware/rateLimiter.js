const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const devMax = (n) => (env.IS_DEV ? n * 10 : n);

const limitMessage = (error) => ({
  success: false,
  error
});

// Logins: only failed attempts count, so staff sharing one address are not locked out
const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: devMax(5),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many login attempts. Please try again in 15 minutes.')
});

const tenantLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: devMax(5),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many login attempts. Please try again in 10 minutes.')
});

// Voucher codes: only bad codes count (hotel guests share one address).
// A "router not reachable" answer (503) is not the guest's fault, so it does not count.
// (The requestWasSuccessful option needs express-rate-limit version 7 or newer.)
const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: devMax(30),
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode < 400 || res.statusCode === 503,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many invalid attempts. Please wait 10 minutes and try again.')
});

const tenantGlobalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: devMax(100),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many requests. Please slow down.')
});

module.exports = {
  platformLoginLimiter,
  tenantLoginLimiter,
  redeemLimiter,
  tenantGlobalLimiter
};