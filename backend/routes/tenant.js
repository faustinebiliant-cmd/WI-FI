const express = require('express');
const router = express.Router();
const authTenant = require('../middleware/authTenant');
const { tenantLoginLimiter, tenantAccountLoginLimiter, tenantGlobalLimiter } = require('../middleware/rateLimiter');

const { login, changePassword, endImpersonationSelf, exchangeImpersonationCode, logoutAllDevices } = require('../controllers/authTenantController');
const { listPackages, createPackage, deletePackage } = require('../controllers/tenantPackageController');
const { listRouters, createRouter, newSetupToken, deleteRouter, getTplinkSetup } = require('../controllers/tenantRouterController');
const { generateVouchers, listVouchers, revokeVoucher } = require('../controllers/tenantVoucherController');
const { getActiveSessions, disconnectSession } = require('../controllers/tenantSessionController');
const { getDashboardStats } = require('../controllers/tenantDashboardController');
const { updateProfile, getProfile } = require('../controllers/tenantProfileController');

router.post('/auth/login', tenantLoginLimiter, tenantAccountLoginLimiter, login);
// Before authTenant: the code itself is the proof (one use, 60 seconds)
router.post('/auth/impersonation/exchange', tenantLoginLimiter, exchangeImpersonationCode);

router.use(authTenant);
router.use(tenantGlobalLimiter);

router.get('/dashboard', getDashboardStats);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/auth/end-impersonation', endImpersonationSelf);
router.post('/auth/change-password', changePassword);
router.post('/auth/logout-all', logoutAllDevices);

router.get('/packages', listPackages);
router.post('/packages', createPackage);
router.delete('/packages/:id', deletePackage);

router.get('/routers', listRouters);
router.post('/routers', createRouter);
router.post('/routers/:id/setup-token', newSetupToken);
router.get('/routers/:id/tplink-setup', getTplinkSetup);
router.delete('/routers/:id', deleteRouter);

router.post('/vouchers/generate', generateVouchers);
router.get('/vouchers', listVouchers);
router.patch('/vouchers/:id/revoke', revokeVoucher);

router.get('/sessions/active', getActiveSessions);
router.post('/sessions/:id/disconnect', disconnectSession);

module.exports = router;