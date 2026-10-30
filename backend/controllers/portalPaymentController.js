const crypto = require('crypto');
const db = require('../config/db');
const { isValidPhone } = require('../utils/validators');

// POST /api/portal/pay
const initiatePayment = async (req, res) => {
  try {
    const { router_token, package_id, phone_number } = req.body;

    if (!router_token || !package_id || !phone_number) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // 1. Validate the phone number format (Tanzania: 07XXXXXXXX or +255...)
    if (!isValidPhone(phone_number)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // 2. Prevent spamming the same phone number
    // We check if this phone number has requested more than 3 payments in the last 10 minutes.
    const recentAttempts = await db.query(
      `SELECT COUNT(*) FROM payments 
       WHERE guest_phone = $1 
       AND created_at > NOW() - INTERVAL '10 minutes'`,
      [phone_number]
    );

    if (parseInt(recentAttempts.rows[0].count) >= 3) {
      return res.status(429).json({ 
        success: false, 
        error: 'Too many payment requests for this phone number. Please wait 10 minutes.' 
      });
    }

    // 3. Find the package to verify it exists
    const pkgRes = await db.query('SELECT price_tzs FROM packages WHERE id = $1', [package_id]);
    const pkg = pkgRes.rows[0];
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    // --- MOCK LOGIC ---
    // In the future, this is where we will call the AzamPay API.
    console.log(`[MOCK PAYMENT] Simulating payment for ${phone_number} on package ${package_id}`);

    // We log the attempt in the database so the rate limiter works
    await db.query(
      `INSERT INTO payments (tenant_id, package_id, amount_tzs, guest_phone, status, gateway_reference) 
       VALUES ((SELECT tenant_id FROM packages WHERE id = $1), $1, $2, $3, 'mock', $4)`,
      [package_id, pkg.price_tzs, phone_number, crypto.randomUUID()]
    );

    // We simulate a short delay to make it feel real
    await new Promise(resolve => setTimeout(resolve, 1500));

    return res.status(200).json({
      success: true,
      message: 'Mock payment successful. Please check your phone.',
      data: { 
        transaction_id: crypto.randomUUID(),
        status: 'success'
      }
    });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate payment' });
  }
};

module.exports = { initiatePayment };