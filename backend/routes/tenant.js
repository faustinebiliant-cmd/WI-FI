// ============================================================
// OSWAGOTech WiFi - Tenant Routes
// ============================================================
const express = require('express');
const router = express.Router();
const authTenant = require('../middleware/authTenant');

const { login, endImpersonationSelf } = require('../controllers/authTenantController');
const { listPackages, createPackage, deletePackage } = require('../controllers/tenantPackageController');
const { listRouters, createRouter } = require('../controllers/tenantRouterController');
const { generateVouchers, listVouchers, revokeVoucher } = require('../controllers/tenantVoucherController');
const { getActiveSessions, disconnectSession } = require('../controllers/tenantSessionController');

// --- Public Routes ---
router.post('/auth/login', login);

// --- Protected Routes (Require Auth) ---
router.use(authTenant);

// Auth Helpers
router.post('/auth/end-impersonation', endImpersonationSelf);

// Packages
router.get('/packages', listPackages);
router.post('/packages', createPackage);
router.delete('/packages/:id', deletePackage);

// Routers
router.get('/routers', listRouters);
router.post('/routers', createRouter);

// Vouchers
router.post('/vouchers/generate', generateVouchers);
router.get('/vouchers', listVouchers);
router.patch('/vouchers/:id/revoke', revokeVoucher);

// Sessions
router.get('/sessions/active', getActiveSessions);
router.post('/sessions/:id/disconnect', disconnectSession);

module.exports = router;