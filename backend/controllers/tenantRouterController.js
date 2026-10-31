// ============================================================
// Oswagolink - Tenant Router Controller
// ============================================================
const crypto = require('crypto');
const { execFile } = require('child_process');
const db = require('../config/db');
const { isSafeText } = require('../utils/validators');
const { encrypt } = require('../utils/encryption');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBKEY_RE = /^[A-Za-z0-9+/]{43}=$/;
const MAX_ROUTERS_PER_TENANT = 10;
// A setup link (provision token) works this long, then a new one must be made
const SETUP_LINK_HOURS = 12;

// Removes the router's WireGuard peer on the VPS through the root-owned helper.
// Same lock as enrollment, so two changes to wg0.conf never run at the same time.
// No shell is used. Resolves true only if the helper reported success.
const removeWireGuardPeer = (publicKey) => new Promise((resolve) => {
  execFile(
    'flock',
    ['-w', '10', '/var/lock/wg-enroll.lock', 'sudo', '-n', '/usr/local/sbin/wifi-wireguard-remove-peer', publicKey],
    { timeout: 30000 },
    (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to remove WireGuard peer:', (stderr && stderr.trim()) || err.message);
        return resolve(false);
      }
      resolve(true);
    }
  );
});

// Only what the page needs. Tokens and passwords are never sent to the browser.
const listRouters = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, location_label, ip_address, status, last_seen_at, created_at,
              (provisioned_at IS NOT NULL) AS provisioned
       FROM routers
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.tenantId]
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('List routers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list routers' });
  }
};

const createRouter = async (req, res) => {
  try {
    // Only the name and the location come from the browser.
    // Tokens, address and password are created here, on the server.
    const name = String((req.body && req.body.name) || '').trim();
    const location = String((req.body && req.body.location_label) || '').trim();

    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Please enter a router name (up to 100 characters).' });
    }
    if (!isSafeText(name)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in the router name.' });
    }
    if (location && (location.length > 100 || !isSafeText(location))) {
      return res.status(400).json({ success: false, error: 'Invalid location.' });
    }

    const countRes = await db.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [req.tenantId]);
    if (parseInt(countRes.rows[0].count, 10) >= MAX_ROUTERS_PER_TENANT) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum number of routers.' });
    }

    const provisionToken = crypto.randomBytes(24).toString('hex'); // 48 characters, secret
    const routerToken = crypto.randomBytes(16).toString('hex');    // used in the customer portal link
    const apiPassword = crypto.randomBytes(16).toString('hex');    // one password per router

    const encryptedPassword = encrypt(apiPassword);
    if (!encryptedPassword) {
      return res.status(500).json({ success: false, error: 'Encryption failed' });
    }

    const { rows } = await db.query(
      `INSERT INTO routers
         (tenant_id, name, location_label, ip_address, api_port, api_username,
          api_password_encrypted, router_token, status, provision_token, provision_token_expires_at)
       VALUES ($1, $2, $3, '0.0.0.0', 8728, 'wifiapi', $4, $5, 'offline', $6,
               NOW() + make_interval(hours => $7::int))
       RETURNING id, name, location_label, ip_address, status, provision_token`,
      [req.tenantId, name, location || null, encryptedPassword, routerToken, provisionToken, SETUP_LINK_HOURS]
    );

    // The setup token goes to the browser only here and in newSetupToken
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create router' });
  }
};

// POST /api/tenant/routers/:id/setup-token
// "Show setup commands again": a NEW setup link, only for a router that is not
// set up yet. The old link stops working at once.
const newSetupToken = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(String(id))) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }

    const provisionToken = crypto.randomBytes(24).toString('hex');
    const { rows } = await db.query(
      `UPDATE routers
       SET provision_token = $1, provision_token_expires_at = NOW() + make_interval(hours => $2::int)
       WHERE id = $3 AND tenant_id = $4 AND provisioned_at IS NULL
       RETURNING id, provision_token`,
      [provisionToken, SETUP_LINK_HOURS, id, req.tenantId]
    );
    if (rows.length === 0) {
      return res.status(409).json({ success: false, error: 'This router is already set up, or it was not found.' });
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('New setup token error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create new setup commands' });
  }
};

const deleteRouter = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(String(id))) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    // 1. Find the router and get its public key
    const checkRes = await db.query(
      'SELECT id, public_key, provisioned_at FROM routers WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    const router = checkRes.rows[0];

    // 2. Remove its WireGuard peer from the VPS FIRST. Its tunnel address is
    //    reused by the next new router, so if the old peer stayed, two routers
    //    would share one address. If removal fails, nothing is deleted.
    if (router.public_key) {
      const removed = PUBKEY_RE.test(router.public_key) && await removeWireGuardPeer(router.public_key);
      if (!removed) {
        return res.status(503).json({
          success: false,
          error: 'The router\'s VPN tunnel could not be removed from the server, so the router was NOT deleted. Please try again in a minute. If it keeps failing, contact Oswagolink support.'
        });
      }
    } else if (router.provisioned_at) {
      // Set up by an older version that did not save the key: the peer cannot be found automatically
      return res.status(409).json({
        success: false,
        error: 'This router was set up with an older version. Oswagolink support must remove its VPN tunnel before it can be deleted. Please contact support.'
      });
    }

    // 3. Delete the router from the database (its packages, vouchers and sessions go with it)
    await db.query('DELETE FROM routers WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);

    return res.status(200).json({ success: true, message: 'Router and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete router' });
  }
};

module.exports = { listRouters, createRouter, newSetupToken, deleteRouter };