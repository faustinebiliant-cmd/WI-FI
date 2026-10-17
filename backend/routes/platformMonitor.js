const express = require('express');
const router = express.Router();

const authPlatform = require('../middleware/authPlatform');
const { listAllRouters } = require('../controllers/platformRouterController');
const { listAllSessions, forceDisconnect } = require('../controllers/platformSessionController');
const { listAuditLogs } = require('../controllers/platformAuditLogController');

router.use(authPlatform);

// Routers
router.get('/routers', listAllRouters);

// Sessions
router.get('/sessions', listAllSessions);
router.post('/sessions/:id/disconnect', forceDisconnect);

// Audit Logs
router.get('/audit-logs', listAuditLogs);

module.exports = router;