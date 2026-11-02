// ============================================================
// Oswagolink - Platform Auth Routes
// ============================================================
const express = require('express');
const router = express.Router();

const { platformLoginLimiter } = require('../middleware/rateLimiter');
const { login } = require('../controllers/authPlatformController');

router.post('/login', platformLoginLimiter, login);

module.exports = router;