const express = require('express');
const router = express.Router();
const { redeemPerAddressLimiter, redeemPerRouterLimiter, payLimiter } = require('../middleware/rateLimiter');

const { getPortalInfo, redeemVoucher } = require('../controllers/portalController');
const { initiatePayment } = require('../controllers/portalPaymentController');

router.get('/info/:router_token', getPortalInfo);
router.post('/redeem', redeemPerAddressLimiter, redeemPerRouterLimiter, redeemVoucher);
router.post('/pay', payLimiter, initiatePayment);

module.exports = router;