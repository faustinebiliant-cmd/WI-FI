const express = require('express');
const router = express.Router();
const { redeemPerAddressLimiter, redeemPerRouterLimiter, payLimiter } = require('../middleware/rateLimiter');

const { getPortalInfo, redeemVoucher, getOmadaPortalInfo, redeemOmadaVoucher } = require('../controllers/portalController');
const { initiatePayment } = require('../controllers/portalPaymentController');

router.get('/info/:router_token', getPortalInfo);
router.post('/redeem', redeemPerAddressLimiter, redeemPerRouterLimiter, redeemVoucher);

// TP-Link (Omada) routers: the access point's link carries the site instead of a router token
router.get('/omada/info', getOmadaPortalInfo);
router.post('/omada/redeem', redeemPerAddressLimiter, redeemPerRouterLimiter, redeemOmadaVoucher);
router.post('/pay', payLimiter, initiatePayment);

module.exports = router;