const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { isValidRouterToken, isValidOmadaSiteId } = require('../utils/validators');

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
const redeemPerRouterLimiter = rateLimit({
  ...redeemFailureOptions,
  max: devMax(30),
  keyGenerator: (req) => {
    const token = req.body && req.body.router_token;
    if (isValidRouterToken(token)) return `${req.ip}|${token}`;
    // TP-Link routers are known by their controller site
    const site = req.body && req.body.site;
    if (isValidOmadaSiteId(site)) return `${req.ip}|omada:${site}`;
    return `${req.ip}|invalid`;
  }
});

// Backstop per address over all routers, so nobody can guess codes without limit
// by switching between routers
const redeemPerAddressLimiter = rateLimit({
  ...redeemFailureOptions,
  max: devMax(300)
});

// Per ACCOUNT, whatever the internet address: someone guessing one owner's password from
// many addresses (a botnet) still gets only 10 wrong tries per hour. The owner can log in
// again after the hour, or at once from another account; the same email typed in capitals
// or with spaces counts as the same account.
const loginAccountKey = (prefix) => (req) => {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim().slice(0, 50) : '';
  return `${prefix}:${email}`;
};
const accountLimiterOptions = {
  windowMs: 60 * 60 * 1000,
  max: devMax(10),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many wrong passwords for this account. Please try again in 1 hour.')
};
const tenantAccountLoginLimiter = rateLimit({ ...accountLimiterOptions, keyGenerator: loginAccountKey('tenant') });
const platformAccountLoginLimiter = rateLimit({ ...accountLimiterOptions, keyGenerator: loginAccountKey('admin') });

const tenantGlobalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: devMax(100),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many requests. Please slow down.')
});

// Mobile payment requests: generous on purpose, all customers of one business
// often share one public address
const payLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many payment requests. Please wait a few minutes and try again.')
});

// Router setup links (they carry secrets): all requests, 60 per 15 minutes per address
const provisionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.'
});

// Router setup links: only failed requests (wrong or used token), 10 per 15 minutes per address
const provisionFailureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many failed attempts. Please try again later.'
});

module.exports = {
  platformLoginLimiter,
  tenantLoginLimiter,
  tenantAccountLoginLimiter,
  platformAccountLoginLimiter,
  redeemPerAddressLimiter,
  redeemPerRouterLimiter,
  tenantGlobalLimiter,
  payLimiter,
  provisionLimiter,
  provisionFailureLimiter
};