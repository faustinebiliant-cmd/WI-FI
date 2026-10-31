const crypto = require('crypto');
const db = require('../config/db');

// Switched off until the real gateway (AzamPay) is connected. The mock below
// answered "payment successful" without giving the guest any WiFi.
const PAYMENTS_ENABLED = false;

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tanzanian mobile numbers, written any usual way, become 255XXXXXXXXX
const normalizePhone = (value) => {
  let digits = String(value || '').replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('0') && digits.length === 10) digits = '255' + digits.slice(1);
  if (!/^255[67]\d{8}$/.test(digits)) return null;
  return digits;
};

// Checks the limit and saves the payment as one step, one request per phone number at a time
const recordPayment = async ({ tenantId, routerId, packageId, amount, phone }) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);

    const recent = await client.query(
      `SELECT COUNT(*) FROM payments
       WHERE guest_phone = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [phone]
    );
    if (parseInt(recent.rows[0].count, 10) >= 3) {
      await client.query('ROLLBACK');
      return { limited: true };
    }

    const reference = crypto.randomUUID();
    const inserted = await client.query(
      `INSERT INTO payments (tenant_id, router_id, package_id, amount_tzs, guest_phone, status, gateway_reference)
       VALUES ($1, $2, $3, $4, $5, 'mock', $6)
       RETURNING id`,
      [tenantId, routerId, packageId, amount, phone, reference]
    );
    await client.query('COMMIT');
    return { limited: false, id: inserted.rows[0].id, reference };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/portal/pay
const initiatePayment = async (req, res) => {
  if (!PAYMENTS_ENABLED) {
    return res.status(503).json({
      success: false,
      error: 'Mobile payment is not available yet. Please buy a voucher at the reception.'
    });
  }
  try {
    const { router_token, package_id, phone_number } = req.body || {};

    if (typeof router_token !== 'string' || typeof package_id !== 'string' || typeof phone_number !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!TOKEN_RE.test(router_token)) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }
    if (!UUID_RE.test(package_id)) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    const phone = normalizePhone(phone_number);
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // The package must belong to this router and be on sale
    const routerRes = await db.query('SELECT id, tenant_id FROM routers WHERE router_token = $1', [router_token]);
    const router = routerRes.rows[0];
    if (!router) return res.status(404).json({ success: false, error: 'Router not found' });

    const pkgRes = await db.query(
      `SELECT id, price_tzs FROM packages
       WHERE id = $1 AND router_id = $2 AND tenant_id = $3 AND is_active = true`,
      [package_id, router.id, router.tenant_id]
    );
    const pkg = pkgRes.rows[0];
    if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });

    const payment = await recordPayment({
      tenantId: router.tenant_id,
      routerId: router.id,
      packageId: pkg.id,
      amount: pkg.price_tzs, // the price always comes from the database, never from the browser
      phone
    });

    if (payment.limited) {
      return res.status(429).json({
        success: false,
        error: 'Too many payment requests for this phone number. Please wait 10 minutes.'
      });
    }

    // --- MOCK LOGIC ---
    // In the future, this is where we will call the AzamPay API.
    console.log(`[MOCK PAYMENT] simulated payment ${payment.id}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return res.status(200).json({
      success: true,
      message: 'Mock payment successful. Please check your phone.',
      data: {
        transaction_id: payment.reference,
        status: 'success'
      }
    });
  } catch (error) {
    console.error('Payment error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to initiate payment' });
  }
};

module.exports = { initiatePayment };