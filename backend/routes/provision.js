const express = require('express');
const router = express.Router();
const rateLimitModule = require('express-rate-limit');
const rateLimit = rateLimitModule.rateLimit || rateLimitModule;
const { getBootstrapScript, getLoginPage, registerRouterKey } = require('../controllers/provisionController');

// These links carry secrets: never let a proxy or browser keep a copy
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// All requests: 60 per 15 minutes per address
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.'
});

// Only failed requests (wrong or used token): 10 per 15 minutes per address
const failureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many failed attempts. Please try again later.'
});

router.use(generalLimiter);
router.use(failureLimiter);

// The router will call these URLs
router.get('/bootstrap/:token', getBootstrapScript);
router.get('/login/:token', getLoginPage);
router.get('/register/:token', registerRouterKey);

module.exports = router;