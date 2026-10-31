// ============================================================
// Oswagolink - Platform Auth Routes
// ============================================================
const express = require('express');
const router = express.Router();

const { platformLoginLimiter } = require('../middleware/rateLimiter');
const authPlatform = require('../middleware/authPlatform');
const { login, getMe } = require('../controllers/authPlatformController');

// Public
router.post('/login', platformLoginLimiter, login);

// Protected
router.get('/me', authPlatform, getMe);

module.exports = router;