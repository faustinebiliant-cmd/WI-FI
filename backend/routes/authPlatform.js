// ============================================================
// Oswagolink - Platform Auth Routes
// ============================================================
const express = require('express');
const router = express.Router();

const { platformLoginLimiter, platformAccountLoginLimiter } = require('../middleware/rateLimiter');
const { login } = require('../controllers/authPlatformController');

router.post('/login', platformLoginLimiter, platformAccountLoginLimiter, login);

module.exports = router;