const express = require('express');
const router = express.Router();
const { provisionLimiter, provisionFailureLimiter } = require('../middleware/rateLimiter');
const { getBootstrapScript, getLoginPage, registerRouterKey } = require('../controllers/provisionController');

// These links carry secrets: never let a proxy or browser keep a copy
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.use(provisionLimiter);
router.use(provisionFailureLimiter);

// The router will call these URLs
router.get('/bootstrap/:token', getBootstrapScript);
router.get('/login/:token', getLoginPage);
router.get('/register/:token', registerRouterKey);

module.exports = router;