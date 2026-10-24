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

const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: devMax(10),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many attempts. Please wait 10 minutes and try again.')
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