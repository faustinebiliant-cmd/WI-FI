const express = require('express');
const router = express.Router();
const rateLimitModule = require('express-rate-limit');
const rateLimit = rateLimitModule.rateLimit || rateLimitModule;
const { redeemLimiter } = require('../middleware/rateLimiter');

const { getPortalInfo, redeemVoucher } = require('../controllers/portalController');
const { initiatePayment } = require('../controllers/portalPaymentController');

// Generous on purpose: all guests of one hotel share one public address
const payLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many payment requests. Please wait a few minutes and try again.' }
});

router.get('/info/:router_token', getPortalInfo);
router.post('/redeem', redeemLimiter, redeemVoucher);
router.post('/pay', payLimiter, initiatePayment);

module.exports = router;