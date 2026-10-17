// ============================================================
// OSWAGOTech WiFi - Platform Tenant Routes
// ============================================================
const express = require('express');
const router = express.Router();

const authPlatform = require('../middleware/authPlatform');
const {
  createTenant,
  listTenants,
  getTenant,
  toggleTenantStatus,
  impersonateTenant
} = require('../controllers/platformTenantController');

router.use(authPlatform);

router.get('/', listTenants);
router.post('/', createTenant);
router.get('/:id', getTenant);
router.patch('/:id/status', toggleTenantStatus);
router.post('/:id/impersonate', impersonateTenant);

module.exports = router;