const express = require('express');
const router = express.Router();
const authTenant = require('../middleware/authTenant');
const { tenantLoginLimiter, tenantGlobalLimiter } = require('../middleware/rateLimiter');

const { login, changePassword, endImpersonationSelf } = require('../controllers/authTenantController');
const { listPackages, createPackage, deletePackage } = require('../controllers/tenantPackageController');
const { listRouters, createRouter, deleteRouter } = require('../controllers/tenantRouterController');
const { generateVouchers, listVouchers, revokeVoucher } = require('../controllers/tenantVoucherController');
const { getActiveSessions, disconnectSession } = require('../controllers/tenantSessionController');
const { getDashboardStats } = require('../controllers/tenantDashboardController');
const { updateProfile, getProfile } = require('../controllers/tenantProfileController');

router.post('/auth/login', tenantLoginLimiter, login);

router.use(authTenant);
router.use(tenantGlobalLimiter);

router.get('/dashboard', getDashboardStats);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/auth/end-impersonation', endImpersonationSelf);
router.post('/auth/change-password', changePassword);

router.get('/packages', listPackages);
router.post('/packages', createPackage);
router.delete('/packages/:id', deletePackage);

router.get('/routers', listRouters);
router.post('/routers', createRouter);
router.delete('/routers/:id', deleteRouter); // NEW ROUTE

router.post('/vouchers/generate', generateVouchers);
router.get('/vouchers', listVouchers);
router.patch('/vouchers/:id/revoke', revokeVoucher);

router.get('/sessions/active', getActiveSessions);
router.post('/sessions/:id/disconnect', disconnectSession);

module.exports = router;