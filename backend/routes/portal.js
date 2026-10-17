const express = require('express');
const router = express.Router();
const { getPortalInfo, redeemVoucher } = require('../controllers/portalController');

router.get('/info/:router_token', getPortalInfo);
router.post('/redeem', redeemVoucher);

module.exports = router;