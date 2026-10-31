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

// Voucher codes: only bad codes count (all customers of one business often share one address).
// A "router not reachable" answer (503) is not the customer's fault, so it does not count.
// (The requestWasSuccessful option needs express-rate-limit version 7 or newer.)
const redeemFailureOptions = {
  windowMs: 10 * 60 * 1000,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode < 400 || res.statusCode === 503,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many invalid attempts. Please wait 10 minutes and try again.')
};

// Mobile networks often put many different businesses behind ONE public address.
// Counting per address AND router means wrong codes typed at one business do not
// lock out the customers of another business on the same mobile network.
const ROUTER_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const redeemPerRouterLimiter = rateLimit({
  ...redeemFailureOptions,
  max: devMax(30),
  keyGenerator: (req) => {
    const token = req.body && req.body.router_token;
    return `${req.ip}|${typeof token === 'string' && ROUTER_TOKEN_RE.test(token) ? token : 'invalid'}`;
  }
});

// Backstop per address over all routers, so nobody can guess codes without limit
// by switching between routers
const redeemPerAddressLimiter = rateLimit({
  ...redeemFailureOptions,
  max: devMax(300)
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
  redeemPerAddressLimiter,
  redeemPerRouterLimiter,
  tenantGlobalLimiter
};