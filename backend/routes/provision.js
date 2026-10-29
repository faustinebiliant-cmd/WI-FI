const express = require('express');
const router = express.Router();
const { getBootstrapScript, registerRouterKey } = require('../controllers/provisionController');

// The router will call these URLs
router.get('/bootstrap/:token', getBootstrapScript);
router.get('/register/:token', registerRouterKey);

module.exports = router;