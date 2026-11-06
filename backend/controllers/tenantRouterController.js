// ============================================================
// Oswagolink - Tenant Router Controller
// ============================================================
const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');
const { isValidName, nameRuleMessage, isValidUUID, normalizeMac } = require('../utils/validators');
const { encrypt } = require('../utils/encryption');
const { removeWireGuardPeer } = require('../services/wireguard');
const { getRouter, isRouterReady } = require('../services/routers/routerFactory');

const MAX_ROUTERS_PER_TENANT = 10;
// A setup link (provision token) works this long, then a new one must be made.
// Short on purpose: a link copied or photographed by someone else soon stops working.
const SETUP_LINK_MINUTES = 30;

// Only what the page needs. Tokens and passwords are never sent to the browser.
const listRouters = async (req, res) => {
  try {
    // TP-Link routers also show their access points and whether Oswagolink has set up
    // their controller site yet (the site ID itself is not needed in the business panel)
    const { rows } = await db.query(
      `SELECT r.id, r.name, r.location_label, r.ip_address, r.status, r.last_seen_at, r.created_at,
              r.device_type,
              (r.provisioned_at IS NOT NULL) AS provisioned,
              (r.omada_site_id IS NOT NULL) AS site_ready,
              COALESCE(
                (SELECT json_agg(a.mac ORDER BY a.created_at) FROM omada_aps a WHERE a.router_id = r.id),
                '[]'::json
              ) AS ap_macs,
              COALESCE(
                (SELECT json_agg(json_build_object('mac', a.mac, 'status', a.status, 'status_at', a.status_at) ORDER BY a.created_at)
                 FROM omada_aps a WHERE a.router_id = r.id),
                '[]'::json
              ) AS aps
       FROM routers r
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC`,
      [req.tenantId]
    );
    // package_speeds: can this router's packages have their own speed?
    // (MikroTik always; TP-Link only when the Open API key is set up on the server)
    const data = rows.map((r) => ({ ...r, package_speeds: r.device_type !== 'omada' || env.OMADA_OPENAPI_ENABLED }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List routers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list routers' });
  }
};

const createRouter = async (req, res) => {
  try {
    // Only the name and the location come from the browser.
    // Tokens, address and password are created here, on the server.
    const rawName = (req.body && req.body.name) || '';
    const rawLocation = (req.body && req.body.location_label) || '';
    if (!isValidName(rawName, 1, 40)) {
      return res.status(400).json({ success: false, error: nameRuleMessage('Router name', 1, 40) });
    }
    if (!isValidName(rawLocation, 0, 60)) {
      return res.status(400).json({ success: false, error: nameRuleMessage('Location', 0, 60) });
    }
    const name = rawName.trim();
    const location = rawLocation.trim();

    // MikroTik (default, as before) or TP-Link only
    const deviceType = (req.body && req.body.device_type) || 'mikrotik';
    if (deviceType !== 'mikrotik' && deviceType !== 'omada') {
      return res.status(400).json({ success: false, error: 'Router type must be MikroTik or TP-Link.' });
    }
    if (deviceType === 'omada') {
      // await: so an error inside is caught by this function's error handling
      return await createOmadaRouter(req, res, name, location);
    }

    const provisionToken = crypto.randomBytes(24).toString('hex'); // 48 characters, secret
    const routerToken = crypto.randomBytes(16).toString('hex');    // used in the customer portal link
    const apiPassword = crypto.randomBytes(16).toString('hex');    // one password per router

    const encryptedPassword = encrypt(apiPassword);
    if (!encryptedPassword) {
      return res.status(500).json({ success: false, error: 'Encryption failed' });
    }

    // Count and add under one lock per business, so two quick clicks cannot pass the limit
    const created = await db.transaction(async (client) => {
      await db.lockTenant(client, 'routers', req.tenantId);
      const countRes = await client.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [req.tenantId]);
      if (parseInt(countRes.rows[0].count, 10) >= MAX_ROUTERS_PER_TENANT) return null;

      const { rows } = await client.query(
        `INSERT INTO routers
           (tenant_id, name, location_label, ip_address, api_port, api_username,
            api_password_encrypted, router_token, status, provision_token, provision_token_expires_at)
         VALUES ($1, $2, $3, '0.0.0.0', 8728, 'wifiapi', $4, $5, 'offline', $6,
                 NOW() + make_interval(mins => $7::int))
         RETURNING id, name, location_label, ip_address, status, provision_token`,
        [req.tenantId, name, location || null, encryptedPassword, routerToken, provisionToken, SETUP_LINK_MINUTES]
      );
      return rows[0];
    });
    if (!created) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum number of routers.' });
    }

    // The setup token goes to the browser only here and in newSetupToken
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Create router error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create router' });
  }
};

// A TP-Link-only router: the business types the MAC of its TP-Link access point (EAP)
// from the sticker. No setup commands, no tunnel, no password: Oswagolink then creates
// its site in the controller (admin panel) and adopts the access point.
const createOmadaRouter = async (req, res, name, location) => {
  const apMac = normalizeMac(String((req.body && req.body.ap_mac) || ''));
  if (!apMac) {
    return res.status(400).json({ success: false, error: 'Access point MAC: 12 letters/numbers from the sticker, for example D4-D6-DF-A5-F8-D2.' });
  }
  const routerToken = crypto.randomBytes(16).toString('hex');

  try {
    const created = await db.transaction(async (client) => {
      await db.lockTenant(client, 'routers', req.tenantId);
      const countRes = await client.query('SELECT COUNT(*) FROM routers WHERE tenant_id = $1', [req.tenantId]);
      if (parseInt(countRes.rows[0].count, 10) >= MAX_ROUTERS_PER_TENANT) return { limit: true };

      // An access point belongs to one router only (also across businesses)
      const taken = await client.query('SELECT 1 FROM omada_aps WHERE mac = $1', [apMac]);
      if (taken.rows.length > 0) return { taken: true };

      const { rows } = await client.query(
        `INSERT INTO routers (tenant_id, name, location_label, ip_address, router_token, status, device_type)
         VALUES ($1, $2, $3, NULL, $4, 'offline', 'omada')
         RETURNING id, name, location_label, status, device_type`,
        [req.tenantId, name, location || null, routerToken]
      );
      await client.query('INSERT INTO omada_aps (router_id, mac) VALUES ($1, $2)', [rows[0].id, apMac]);
      return {
        router: {
          ...rows[0],
          ap_macs: [apMac],
          aps: [{ mac: apMac, status: null, status_at: null }],
          site_ready: false,
          package_speeds: env.OMADA_OPENAPI_ENABLED
        }
      };
    });
    if (created.limit) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum number of routers.' });
    }
    if (created.taken) {
      return res.status(409).json({ success: false, error: 'This access point is already registered. Check the MAC on the sticker, or contact Oswagolink support.' });
    }
    return res.status(201).json({ success: true, data: created.router });
  } catch (error) {
    // Two businesses typing the same MAC at the same moment: the database refuses the second
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: 'This access point is already registered. Check the MAC on the sticker, or contact Oswagolink support.' });
    }
    throw error;
  }
};

// POST /api/tenant/routers/:id/setup-token
// "Show setup commands again": a NEW setup link, only for a router that is not
// set up yet. The old link stops working at once.
const newSetupToken = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(String(id))) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }

    const provisionToken = crypto.randomBytes(24).toString('hex');
    const { rows } = await db.query(
      `UPDATE routers
       SET provision_token = $1, provision_token_expires_at = NOW() + make_interval(mins => $2::int)
       WHERE id = $3 AND tenant_id = $4 AND provisioned_at IS NULL AND device_type = 'mikrotik'
       RETURNING id, provision_token`,
      [provisionToken, SETUP_LINK_MINUTES, id, req.tenantId]
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
    if (!isValidUUID(String(id))) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    // 1. Find the router and get its public key
    const checkRes = await db.query(
      'SELECT id, tenant_id, public_key, provisioned_at, device_type, omada_site_id FROM routers WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found or unauthorized' });
    }

    const router = checkRes.rows[0];

    // TP-Link: no tunnel. Phones still let in are cut off first, so nobody keeps internet
    // from vouchers that are about to disappear. If the controller cannot be reached,
    // nothing is deleted.
    if (router.device_type === 'omada') {
      if (isRouterReady(router)) {
        const { rows: open } = await db.query(
          'SELECT DISTINCT mac_address FROM sessions WHERE router_id = $1 AND ended_at IS NULL',
          [router.id]
        );
        let adapter;
        try {
          adapter = getRouter(router);
        } catch (err) {
          adapter = null;
        }
        for (const s of open) {
          const cut = adapter ? await adapter.disconnectUser(s.mac_address) : null;
          if (!cut || !cut.ok) {
            return res.status(503).json({
              success: false,
              error: 'The TP-Link controller could not be reached, so customers still online could not be disconnected. The router was NOT deleted. Please try again in a minute.'
            });
          }
        }
      }
      await db.query('DELETE FROM routers WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
      return res.status(200).json({ success: true, message: 'Router and all associated data deleted successfully' });
    }

    // 2. Remove its WireGuard peer from the VPS FIRST. Its tunnel address is
    //    reused by the next new router, so if the old peer stayed, two routers
    //    would share one address. If removal fails, nothing is deleted.
    if (router.public_key) {
      const removed = await removeWireGuardPeer(router.public_key);
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