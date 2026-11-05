const db = require('../config/db');
const { getRouter, isRouterReady, ROUTER_ADAPTER_COLUMNS } = require('../services/routers/routerFactory');
const {
  isValidMACAddress, isValidIPAddress, isValidVoucherCode, isValidRouterToken,
  normalizeMac, isValidOmadaSiteId, isValidSsidName, isValidRadioId
} = require('../utils/validators');
const { TENANT_BLOCKED_SQL, PORTAL_BLOCKED_ERROR } = require('../middleware/subscriptionGuard');

const NOT_REACHABLE = 'The WiFi system is not reachable right now. Please try again in a moment.';

// One answer for every code that does not work here (wrong shape, unknown, or another router's)
const INVALID_CODE = { success: false, error: 'Invalid voucher code. Please check the code and try again.' };

// What the portal should tell this device on this router:
//   { active_until, speed_mbps }  its voucher still runs (show the time left)
//   { ended_at }                  its voucher ended in the last 24 hours ("your time is over")
//   null                          nothing known (first visit, no MAC, or older than 24 hours)
const DEVICE_ENDED_WINDOW_HOURS = 24;
const getDeviceState = async (routerId, mac) => {
  const deviceMac = String(mac || '').trim().toUpperCase().replace(/-/g, ':');
  if (!isValidMACAddress(deviceMac) || deviceMac === '00:00:00:00:00:00') return null;

  const active = await db.query(
    `SELECT v.expires_at, p.speed_down_kbps
     FROM sessions s
     JOIN vouchers v ON v.id = s.voucher_id
     JOIN packages p ON p.id = v.package_id
     WHERE s.router_id = $1 AND s.mac_address = $2 AND v.status = 'active' AND v.expires_at > NOW()
     ORDER BY v.expires_at DESC LIMIT 1`,
    [routerId, deviceMac]
  );
  if (active.rows.length > 0) {
    return { active_until: active.rows[0].expires_at, speed_mbps: active.rows[0].speed_down_kbps / 1024 };
  }

  const ended = await db.query(
    `SELECT v.expires_at
     FROM sessions s
     JOIN vouchers v ON v.id = s.voucher_id
     WHERE s.router_id = $1 AND s.mac_address = $2 AND v.status = 'expired'
       AND v.expires_at <= NOW() AND v.expires_at > NOW() - make_interval(hours => $3)
     ORDER BY v.expires_at DESC LIMIT 1`,
    [routerId, deviceMac, DEVICE_ENDED_WINDOW_HOURS]
  );
  if (ended.rows.length > 0) return { ended_at: ended.rows[0].expires_at };
  return null;
};

// GET /api/portal/info/:router_token   (optional ?mac=AA:BB:... for the device state)
const getPortalInfo = async (req, res) => {
  try {
    const { router_token } = req.params;
    if (!isValidRouterToken(String(router_token))) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }

    const routerRes = await db.query(`
      SELECT r.id, r.tenant_id, t.business_name, t.logo_url, ${TENANT_BLOCKED_SQL} AS tenant_blocked
      FROM routers r JOIN tenants t ON r.tenant_id = t.id
      WHERE r.router_token = $1
    `, [router_token]);

    if (routerRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }

    const router = routerRes.rows[0];
    if (router.tenant_blocked) return res.status(403).json(PORTAL_BLOCKED_ERROR);

    // Prices and this phone's voucher state at the same time, not one after the other
    const [packagesRes, device] = await Promise.all([
      db.query(
        'SELECT id, name, price_tzs, duration_minutes, speed_down_kbps FROM packages WHERE tenant_id = $1 AND router_id = $2 AND is_active = true',
        [router.tenant_id, router.id]
      ),
      getDeviceState(router.id, req.query.mac)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        business_name: router.business_name,
        logo_url: router.logo_url,
        packages: packagesRes.rows,
        device
      }
    });
  } catch (error) {
    console.error('Portal info error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load portal info' });
  }
};

// ------------------------------------------------------------
// The voucher rules, shared by MikroTik and TP-Link routers:
// claim a fresh voucher (or resume a running one), let the phone in for the time left
// (grant), give a fresh voucher back if that fails, then record the session.
// Returns { status, body } for the answer to the customer.
//   grant(remainingMinutes, pkg, voucher) -> { ok } : MikroTik creates a voucher user,
//   TP-Link asks the controller to let this phone in.
// ------------------------------------------------------------
const startVoucher = async ({ router, cleanCode, deviceMac, ipAddress, grant }) => {
  let voucher;
  let resumed = false;

  // 1. First use: claim a fresh voucher (only one request can win this)
  const claimRes = await db.query(`
    UPDATE vouchers
    SET status = 'active', used_at = NOW(), expires_at = NOW() + (SELECT duration_minutes FROM packages WHERE id = vouchers.package_id) * INTERVAL '1 minute'
    WHERE tenant_id = $1 AND code = $2 AND status = 'unused'
    AND package_id IN (SELECT id FROM packages WHERE router_id = $3)
    RETURNING id, package_id, expires_at
  `, [router.tenant_id, cleanCode, router.id]);

  if (claimRes.rows.length > 0) {
    voucher = claimRes.rows[0];
  } else {
    // 2. Not fresh: a running voucher coming back (power cut, reconnect)
    const existingRes = await db.query(
      `SELECT id, package_id, status, expires_at FROM vouchers
       WHERE tenant_id = $1 AND code = $2
       AND package_id IN (SELECT id FROM packages WHERE router_id = $3)`,
      [router.tenant_id, cleanCode, router.id]
    );
    const existing = existingRes.rows[0];

    // Unknown code, or a code of another router: same answer
    if (!existing) {
      return { status: 404, body: INVALID_CODE };
    }
    if (existing.status === 'cancelled') {
      return { status: 400, body: { success: false, error: 'This voucher has been cancelled.' } };
    }
    if (existing.status !== 'active' || !existing.expires_at || new Date(existing.expires_at) <= new Date()) {
      return { status: 400, body: { success: false, error: 'This voucher has expired.' } };
    }
    voucher = existing;
    resumed = true;
  }

  const pkgRes = await db.query(
    'SELECT duration_minutes, speed_down_kbps, speed_up_kbps FROM packages WHERE id = $1',
    [voucher.package_id]
  );
  const pkg = pkgRes.rows[0];

  // Minutes left on the voucher's own clock (the full duration on first use)
  const remainingMinutes = Math.max(1, Math.ceil((new Date(voucher.expires_at) - Date.now()) / 60000));

  const routerResult = await grant(remainingMinutes, pkg, voucher);

  if (!routerResult || !routerResult.ok) {
    // A fresh voucher goes back to unused, so the customer does not lose it
    if (!resumed) {
      await db.query("UPDATE vouchers SET status = 'unused', used_at = NULL, expires_at = NULL WHERE id = $1", [voucher.id]);
    }
    return { status: 503, body: { success: false, error: NOT_REACHABLE } };
  }

  // Close any old open session of this voucher, then record the new one: both or neither.
  // DO NOTHING: the same phone pressing Connect twice at once records one session.
  await db.transaction(async (client) => {
    await client.query(
      "UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'new login' WHERE voucher_id = $1 AND ended_at IS NULL",
      [voucher.id]
    );
    await client.query(
      `INSERT INTO sessions (tenant_id, router_id, voucher_id, mac_address, ip_address, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [router.tenant_id, router.id, voucher.id, deviceMac, ipAddress || null]
    );
  });

  return {
    status: 200,
    body: {
      success: true,
      message: resumed ? 'Welcome back, reconnecting' : 'Connected successfully',
      data: {
        resumed,
        // The code as the router knows it (k7mp-4rqx typed -> K7MP4RQX): the portal logs in with this
        code: cleanCode,
        duration_minutes: pkg.duration_minutes,
        // Minutes left on the server's clock: a returning customer sees the time left,
        // not the full package time, and a phone with a wrong clock cannot change it
        remaining_minutes: remainingMinutes,
        speed_down_mbps: pkg.speed_down_kbps / 1024,
        expires_at: voucher.expires_at
      }
    }
  };
};

// POST /api/portal/redeem
const redeemVoucher = async (req, res) => {
  try {
    const { router_token, code, mac_address, ip_address } = req.body || {};

    if (typeof router_token !== 'string' || typeof code !== 'string' || typeof mac_address !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!isValidRouterToken(router_token)) {
      return res.status(404).json({ success: false, error: 'Router not found' });
    }
    // One written form (AA:BB:CC:DD:EE:FF) so the router can find the device again later.
    // All zeros means the router did not tell us which device this is: refuse it.
    const deviceMac = mac_address.trim().toUpperCase().replace(/-/g, ':');
    if (!isValidMACAddress(deviceMac) || deviceMac === '00:00:00:00:00:00') {
      return res.status(400).json({ success: false, error: 'Your device could not be identified. Please connect to this WiFi network and open the login page again.' });
    }
    if (ip_address && !isValidIPAddress(ip_address)) {
      return res.status(400).json({ success: false, error: 'Invalid device IP address' });
    }

    // Small letters, spaces and dashes are fine (k7mp-4rqx -> K7MP4RQX).
    // A code of the wrong shape gets exactly the same answer as an unknown code, so a
    // stranger learns nothing about what a real code looks like.
    const cleanCode = code.toUpperCase().replace(/[\s-]/g, '');
    if (!isValidVoucherCode(cleanCode)) {
      return res.status(404).json(INVALID_CODE);
    }

    const routerRes = await db.query(
      `SELECT ${ROUTER_ADAPTER_COLUMNS}, ${TENANT_BLOCKED_SQL} AS tenant_blocked
       FROM routers r JOIN tenants t ON t.id = r.tenant_id
       WHERE r.router_token = $1`,
      [router_token]
    );
    const router = routerRes.rows[0];
    if (!router) return res.status(404).json({ success: false, error: 'Router not found' });
    if (router.tenant_blocked) return res.status(403).json(PORTAL_BLOCKED_ERROR);
    // TP-Link routers use their own portal links (/omada/redeem), never this one
    if (router.device_type === 'omada') return res.status(404).json({ success: false, error: 'Router not found' });

    // Router not set up yet
    if (!isRouterReady(router)) {
      return res.status(503).json({ success: false, error: 'This WiFi is not ready yet. Please contact the management.' });
    }

    // Create the router connection BEFORE touching the voucher
    let adapter;
    try {
      adapter = getRouter(router);
    } catch (err) {
      console.error('Router adapter error:', err.message);
      return res.status(503).json({ success: false, error: NOT_REACHABLE });
    }

    const result = await startVoucher({
      router,
      cleanCode,
      deviceMac,
      ipAddress: ip_address,
      // MikroTik: a voucher user with the time left and the package speed
      grant: (remainingMinutes, pkg) =>
        adapter.createVoucher(cleanCode, remainingMinutes, pkg.speed_down_kbps, pkg.speed_up_kbps)
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Redeem error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process voucher' });
  }
};

// ============================================================
// TP-Link (Omada) routers
// The access point sends the phone (through the controller's portal entrance) to
//   /portal/?clientMac=..&apMac=..&ssidName=..&radioId=..&site=..&redirectUrl=..
// The site tells us which router (business) it is; the access point must be one of
// that router's registered access points.
// ============================================================
const NOT_REGISTERED = { success: false, error: 'This WiFi is not registered with Oswagolink. Please contact the management.' };

// The TP-Link router for this site, only if this access point belongs to it
const findOmadaRouter = async (site, apMac) => {
  const { rows } = await db.query(
    `SELECT ${ROUTER_ADAPTER_COLUMNS}, t.business_name, t.logo_url, ${TENANT_BLOCKED_SQL} AS tenant_blocked
     FROM routers r
     JOIN tenants t ON t.id = r.tenant_id
     JOIN omada_aps a ON a.router_id = r.id
     WHERE r.device_type = 'omada' AND r.omada_site_id = $1 AND a.mac = $2`,
    [site, apMac]
  );
  return rows[0] || null;
};

// GET /api/portal/omada/info?site=..&ap=..&mac=..
const getOmadaPortalInfo = async (req, res) => {
  try {
    const site = String(req.query.site || '');
    const apMac = normalizeMac(String(req.query.ap || ''));
    if (!isValidOmadaSiteId(site) || !apMac) return res.status(404).json(NOT_REGISTERED);

    const router = await findOmadaRouter(site, apMac);
    if (!router) return res.status(404).json(NOT_REGISTERED);
    if (router.tenant_blocked) return res.status(403).json(PORTAL_BLOCKED_ERROR);

    const [packagesRes, device] = await Promise.all([
      db.query(
        'SELECT id, name, price_tzs, duration_minutes, speed_down_kbps FROM packages WHERE tenant_id = $1 AND router_id = $2 AND is_active = true',
        [router.tenant_id, router.id]
      ),
      getDeviceState(router.id, req.query.mac)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        business_name: router.business_name,
        logo_url: router.logo_url,
        packages: packagesRes.rows,
        device
      }
    });
  } catch (error) {
    console.error('Portal info (TP-Link) error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load portal info' });
  }
};

// POST /api/portal/omada/redeem
// { site, ap_mac, client_mac, ssid_name, radio_id, code }
const redeemOmadaVoucher = async (req, res) => {
  try {
    const { site, ap_mac, client_mac, ssid_name, radio_id, code } = req.body || {};
    if (typeof site !== 'string' || typeof ap_mac !== 'string' || typeof client_mac !== 'string' ||
        typeof ssid_name !== 'string' || typeof code !== 'string' ||
        (typeof radio_id !== 'number' && typeof radio_id !== 'string')) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const apMac = normalizeMac(ap_mac);
    if (!isValidOmadaSiteId(site) || !apMac) return res.status(404).json(NOT_REGISTERED);
    const deviceMac = normalizeMac(client_mac);
    if (!deviceMac) {
      return res.status(400).json({ success: false, error: 'Your device could not be identified. Please connect to this WiFi network and open the login page again.' });
    }
    if (!isValidSsidName(ssid_name) || !isValidRadioId(radio_id)) {
      return res.status(400).json({ success: false, error: 'Your device could not be identified. Please connect to this WiFi network and open the login page again.' });
    }

    // Same rule as MikroTik: a wrong-shape code gets the same answer as an unknown code
    const cleanCode = code.toUpperCase().replace(/[\s-]/g, '');
    if (!isValidVoucherCode(cleanCode)) {
      return res.status(404).json(INVALID_CODE);
    }

    const router = await findOmadaRouter(site, apMac);
    if (!router) return res.status(404).json(NOT_REGISTERED);
    if (router.tenant_blocked) return res.status(403).json(PORTAL_BLOCKED_ERROR);

    let adapter;
    try {
      adapter = getRouter(router);
    } catch (err) {
      console.error('Router adapter error (TP-Link):', err.message);
      return res.status(503).json({ success: false, error: NOT_REACHABLE });
    }

    const result = await startVoucher({
      router,
      cleanCode,
      deviceMac,
      ipAddress: null, // the controller reports the business's public address, not the phone's
      // (the package speed is not used: one speed per business, set on its controller site)
      grant: async (remainingMinutes, _pkg, voucher) => {
        // One phone per voucher: a phone that used this voucher before is cut off first
        // (otherwise one payment could keep two phones online)
        const { rows: others } = await db.query(
          'SELECT DISTINCT mac_address FROM sessions WHERE voucher_id = $1 AND ended_at IS NULL AND mac_address <> $2',
          [voucher.id, deviceMac]
        );
        for (const other of others) {
          const cut = await adapter.disconnectUser(other.mac_address);
          if (!cut || !cut.ok) return { ok: false };
        }
        return adapter.authorizeClient({
          clientMac: deviceMac,
          apMac,
          ssidName: ssid_name,
          radioId: Number(radio_id),
          minutes: remainingMinutes
        });
      }
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Redeem (TP-Link) error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process voucher' });
  }
};

module.exports = { getPortalInfo, redeemVoucher, getOmadaPortalInfo, redeemOmadaVoucher };