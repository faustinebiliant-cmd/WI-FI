const express = require('express');
const router = express.Router();

const { getPortalInfo, redeemVoucher } = require('../controllers/portalController');
const { initiatePayment } = require('../controllers/portalPaymentController');

router.get('/info/:router_token', getPortalInfo);
router.post('/redeem', redeemVoucher);

router.post('/pay', initiatePayment);

module.exports = router;