const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const devMax = (n) => (env.IS_DEV ? n * 10 : n);

const limitMessage = (error) => ({
  success: false,
  error
});

const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: devMax(5),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many login attempts. Please try again in 15 minutes.')
});

const tenantLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: devMax(5),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many login attempts. Please try again in 10 minutes.')
});

// FIXED: Only counts failed attempts, and raised limit for shared hotel IPs
const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: devMax(30), // Raised from 10 to 30 (hotel guests share 1 IP)
  skipSuccessfulRequests: true, // Only count bad codes, not successful ones
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