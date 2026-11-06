// ============================================================
// Oswagolink - Tenant Router Controller
// ============================================================
const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');
const { isValidName, nameRuleMessage, isValidUUID, normalizeMac, isValidSsidName } = require('../utils/validators');
const { encrypt, decrypt } = require('../utils/encryption');
const omadaSites = require('../services/routers/omadaSites');
const { removeWireGuardPeer } = require('../services/wireguard');
const { getRouter, isRouterReady } = require('../services/routers/routerFactory');

const MAX_ROUTERS_PER_TENANT = 10;
// A setup link (provision token) works this long, then a new one must be made.
// Short on purpose: a link copied or photographed by someone else soon stops working.
const SETUP_LINK_MINUTES = 30;
// TP-Link business WiFi speed per phone, in whole Mbps (packages can be slower, never faster)
const MIN_WIFI_MBPS = 1;
const MAX_WIFI_MBPS = 50;

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
              r.omada_site_auto AS site_auto, r.omada_wifi_name AS wifi_name, r.omada_speed_kbps AS wifi_speed_kbps,
              COALESCE(
                (SELECT json_agg(json_build_object('mac', a.mac, 'status', a.status, 'status_at', a.status_at,
                                                   'adopted', a.adopted_at IS NOT NULL, 'adopt_error', a.adopt_error) ORDER BY a.created_at)
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
    // tplink_auto: Oswagolink creates TP-Link sites and adopts access points itself
    return res.status(200).json({ success: true, data, tplink_auto: env.OMADA_OPENAPI_ENABLED });
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
// from the sticker. No setup commands, no tunnel.
// With the Open API key (automation), Oswagolink at once creates the business's site in the
// controller (WiFi name, business speed, portal) and later adopts the access point with that
// MAC by itself. Without the key, the admin creates the site by hand (admin panel), as before.
const createOmadaRouter = async (req, res, name, location) => {
  const apMac = normalizeMac(String((req.body && req.body.ap_mac) || ''));
  if (!apMac) {
    return res.status(400).json({ success: false, error: 'Access point MAC: 12 letters/numbers from the sticker, for example D4-D6-DF-A5-F8-D2.' });
  }
  let wifiName = null;
  let speedKbps = null;
  if (env.OMADA_OPENAPI_ENABLED) {
    // Printable letters, numbers, spaces and simple symbols; no spaces at the start or end
    wifiName = String((req.body && req.body.wifi_name) || '').trim();
    if (!isValidSsidName(wifiName) || !/^[\x20-\x7e]+$/.test(wifiName)) {
      return res.status(400).json({ success: false, error: 'WiFi name: 1 to 32 letters, numbers, spaces or simple symbols (no emoji).' });
    }
    const mbps = Number(req.body && req.body.wifi_speed_mbps);
    if (!Number.isInteger(mbps) || mbps < MIN_WIFI_MBPS || mbps > MAX_WIFI_MBPS) {
      return res.status(400).json({ success: false, error: `WiFi speed per phone: a whole number of Mbps from ${MIN_WIFI_MBPS} to ${MAX_WIFI_MBPS}.` });
    }
    speedKbps = mbps * 1024;
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
    if (!env.OMADA_OPENAPI_ENABLED) {
      return res.status(201).json({ success: true, data: created.router });
    }
    return await prepareOmadaSite(req, res, created.router, wifiName, speedKbps);
  } catch (error) {
    // Two businesses typing the same MAC at the same moment: the database refuses the second
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: 'This access point is already registered. Check the MAC on the sticker, or contact Oswagolink support.' });
    }
    throw error;
  }
};

// The new TP-Link router is saved; now its controller site is made. If that fails, the router
// is deleted again, so the business can simply try again (nothing half-made is left).
const prepareOmadaSite = async (req, res, router, wifiName, speedKbps) => {
  const removeRouter = () => db.query('DELETE FROM routers WHERE id = $1 AND tenant_id = $2', [router.id, req.tenantId]);
  let site = null;
  try {
    const { rows } = await db.query('SELECT business_name FROM tenants WHERE id = $1', [req.tenantId]);
    const business = String((rows[0] && rows[0].business_name) || 'Business');
    // Site name: business and router name (for the admin), plus the router's first 8
    // characters, so two sites never get the same name
    const label = `${business} - ${router.name}`.replace(/[^\w .,'&()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 54) +
      ` ${router.id.slice(0, 8)}`;
    site = await omadaSites.createBusinessSite({ label, wifiName, speedKbps });
  } catch (err) {
    console.error(`[Omada] Could not create the site for a new TP-Link router of business ${req.tenantId} (step ${err.stage || '?'}): ${err.message}`);
    await removeRouter();
    return res.status(502).json({
      success: false,
      error: 'The TP-Link controller could not prepare your WiFi just now, so nothing was saved. Please try again in a minute. If it keeps failing, contact Oswagolink support.'
    });
  }
  const devEnc = encrypt(site.devicePassword);
  const setupEnc = encrypt(site.setupPassword);
  try {
    if (!devEnc || !setupEnc) throw new Error('encryption failed');
    await db.query(
      `UPDATE routers SET omada_site_id = $1, omada_site_auto = true, omada_wifi_name = $2, omada_speed_kbps = $3,
              omada_device_password_encrypted = $4, omada_setup_password_encrypted = $5
       WHERE id = $6 AND tenant_id = $7`,
      [site.siteId, wifiName, speedKbps, devEnc, setupEnc, router.id, req.tenantId]
    );
  } catch (err) {
    console.error(`[Omada] Could not save the new site ${site.siteId}: ${err.message}`);
    try {
      await omadaSites.deleteBusinessSite(site.siteId, []);
    } catch (cleanupErr) {
      console.error(`[Omada] The unsaved site ${site.siteId} must be deleted by hand: ${cleanupErr.message}`);
    }
    await removeRouter();
    return res.status(500).json({ success: false, error: 'Failed to create router' });
  }
  console.log(`[Omada] Site ${site.siteId} created for TP-Link router ${router.id}`);
  return res.status(201).json({
    success: true,
    data: {
      ...router,
      site_ready: true,
      site_auto: true,
      wifi_name: wifiName,
      wifi_speed_kbps: speedKbps,
      aps: router.aps.map((a) => ({ ...a, adopted: false, adopt_error: null }))
    }
  });
};

// GET /api/tenant/routers/:id/tplink-setup
// What the technician needs to connect a new TP-Link access point: the Inform URL and the
// one-time setup login. The setup login is shown only to this business, and only while an
// access point is still waiting; once adopted, the access point gets the site's own login.
const getTplinkSetup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(String(id))) return res.status(404).json({ success: false, error: 'Router not found' });
    const { rows } = await db.query(
      `SELECT r.id, r.omada_setup_password_encrypted,
              COALESCE((SELECT json_agg(json_build_object('mac', a.mac, 'adopted', a.adopted_at IS NOT NULL,
                                                          'adopt_error', a.adopt_error) ORDER BY a.created_at)
                        FROM omada_aps a WHERE a.router_id = r.id), '[]'::json) AS aps
       FROM routers r
       WHERE r.id = $1 AND r.tenant_id = $2 AND r.device_type = 'omada' AND r.omada_site_auto = true`,
      [id, req.tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Router not found' });
    const router = rows[0];
    const waiting = router.aps.some((a) => !a.adopted);
    const password = waiting && router.omada_setup_password_encrypted ? decrypt(router.omada_setup_password_encrypted) : null;
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      data: {
        inform_url: omadaSites.informUrl(),
        setup_username: waiting ? omadaSites.SETUP_USER : null,
        setup_password: password || null,
        aps: router.aps
      }
    });
  } catch (error) {
    console.error('TP-Link setup error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load the setup details' });
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
      'SELECT id, tenant_id, public_key, provisioned_at, device_type, omada_site_id, omada_site_auto FROM routers WHERE id = $1 AND tenant_id = $2',
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
      // A site Oswagolink created goes too: its access points are forgotten (they return to
      // factory settings) and the site is deleted. Sites made by hand are never touched.
      if (router.omada_site_auto && router.omada_site_id) {
        if (!env.OMADA_OPENAPI_ENABLED) {
          return res.status(503).json({ success: false, error: 'This TP-Link router cannot be deleted right now. Please contact Oswagolink support.' });
        }
        const { rows: aps } = await db.query('SELECT mac FROM omada_aps WHERE router_id = $1', [router.id]);
        try {
          await omadaSites.deleteBusinessSite(router.omada_site_id, aps.map((a) => a.mac));
          console.log(`[Omada] Site ${router.omada_site_id} of deleted TP-Link router ${router.id} removed from the controller`);
        } catch (err) {
          console.error(`[Omada] Could not remove site ${router.omada_site_id} from the controller: ${err.message}`);
          return res.status(503).json({
            success: false,
            error: 'The TP-Link controller could not remove this router\'s WiFi just now, so the router was NOT deleted. Please try again in a minute.'
          });
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

module.exports = { listRouters, createRouter, newSetupToken, deleteRouter, getTplinkSetup };