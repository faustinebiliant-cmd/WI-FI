// ============================================================
// Oswagolink - TP-Link sites, made and removed automatically (automation V2-2, V2-3, V2-4)
//
// One TP-Link business router = one site in our Omada controller. With the Open API key,
// Oswagolink makes the whole site itself, in this order:
//   1. the site (Tanzania, Africa/Nairobi, General) with its own access point login
//      (device account: "eap-admin" + a strong random password, kept encrypted)
//   2. the WiFi name: open, guest network (phones cannot reach the business's own network),
//      2.4 + 5 GHz
//   3. a hidden safety limit per phone on that WiFi (20 Mbps, the highest package speed);
//      each phone gets its own package speed when its voucher is used
//   4. the portal: External Portal  https://<OMADA_PUBLIC_HOST>/portal/
//   5. before paying, phones may reach only the VPS (<OMADA_PUBLIC_IP>/32)
//   6. our hotspot operator (OMADA_OPERATOR_USER) gets the new site, so phones can be let in
// If any step fails, the half-made site is deleted again and the caller gets the error.
//
// All commands are from TP-Link's own Open API document (docs/tplink-openapi/).
// Nothing secret is ever logged: not the passwords, not the operator's password.
// ============================================================
const crypto = require('crypto');
const env = require('../../config/env');
const db = require('../../config/db');
const openApi = require('./omadaOpenApi');
const omadaClient = require('./omadaClient');
const { normalizeMac } = require('../../utils/validators');

const { call, OmadaError } = openApi;

// The same values as the site made by hand on 5 November 2026 (read with the test tool)
const SITE_REGION = 'Tanzania';
const SITE_TIMEZONE = 'Africa/Nairobi';
const SITE_SCENARIO = 'General';
const DEVICE_USER = 'eap-admin';
const SETUP_USER = 'oswsetup';
const PORTAL_NAME = 'Oswagolink';
// The longest a phone can stay let in by the portal itself; the real time is the voucher's,
// sent with every approval (a year is longer than any package)
const PORTAL_TIMEOUT_DAYS = 400;

const dashed = (mac) => String(mac).toUpperCase().replace(/:/g, '-');
const listOf = (r) => (Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : []);

// ------------------------------------------------------------
// Passwords
// ------------------------------------------------------------
// TP-Link's rule for the device account: 10-64 characters with uppercase, lowercase, number
// and symbol, never the same character twice in a row. Rotating sets guarantee both.
const strongPassword = () => {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#$%&*@^'];
  const out = [];
  for (let i = 0; i < 24; i++) out.push(sets[i % 4][crypto.randomInt(sets[i % 4].length)]);
  return out.join('');
};

// The one-time setup login the technician types on a new access point. The access point
// demands uppercase, lowercase, number AND symbol, never the same character twice in a row
// (seen on the EAP's own setup page, 6 Nov 2026). No look-alike characters, and only symbols
// that are easy to find on a phone keyboard.
const setupPassword = () => {
  const sets = ['ABCDEFGHJKMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '@#*!'];
  const out = [];
  for (let i = 0; i < 12; i++) out.push(sets[i % 4][crypto.randomInt(sets[i % 4].length)]);
  return out.join('');
};

// What the technician types on the access point (System > Controller Settings).
// Not secret: it only says where our controller is.
const informUrl = () => `${env.OMADA_PUBLIC_HOST}?dPort=29810&mPort=29814&omadacId=${env.OMADA_CONTROLLER_ID}`;

// ------------------------------------------------------------
// Sites
// ------------------------------------------------------------
const listSites = async () => listOf(await call('GET', 'v1/{id}/sites?page=1&pageSize=1000'));

const siteExists = async (siteId) => (await listSites()).some((s) => s && s.siteId === siteId);

// The hotspot operator's sites. Oswagolink lets phones in with this operator, so every
// TP-Link business site must be in its list. One change at a time (read, add, write back).
let operatorQueue = Promise.resolve();
const changeOperatorSites = (siteId, add) => {
  const job = operatorQueue.then(async () => {
    // The operator list is read through a site the operator already has
    const { rows } = await db.query("SELECT omada_site_id FROM routers WHERE device_type = 'omada' AND omada_site_id IS NOT NULL LIMIT 20");
    const through = [siteId, ...rows.map((r) => r.omada_site_id).filter((s) => s !== siteId)];
    let op = null;
    let opSite = null;
    for (const s of through) {
      try {
        const list = listOf(await call('GET', `v1/{id}/sites/${s}/hotspot/operators?page=1&pageSize=100`));
        op = list.find((o) => o && o.name === env.OMADA_OPERATOR_USER) || null;
      } catch (err) {
        op = null;
      }
      if (op) {
        opSite = s;
        break;
      }
    }
    if (!op || !op.id) throw new OmadaError(`hotspot operator "${env.OMADA_OPERATOR_USER}" not found in the controller`, 'operator_missing');
    const current = Array.isArray(op.selectedSites) ? op.selectedSites.filter((s) => typeof s === 'string') : [];
    const wanted = add ? [...new Set([...current, siteId])] : current.filter((s) => s !== siteId);
    if (wanted.length === current.length && wanted.every((s) => current.includes(s))) return false;
    if (wanted.length === 0) return false; // TP-Link needs at least one site; leave it
    const body = {
      name: op.name,
      password: env.OMADA_OPERATOR_PASSWORD, // required by TP-Link with every change; never logged
      operatorRoleType: Number.isInteger(op.operatorRoleType) ? op.operatorRoleType : 0,
      selectedSites: wanted
    };
    if (typeof op.note === 'string' && op.note.length > 0) body.note = op.note;
    await call('PATCH', `v1/{id}/sites/${opSite}/hotspot/operators/${op.id}`, body);
    omadaClient.resetSession(); // the next approval logs in again, with the new site list
    return true;
  });
  operatorQueue = job.catch(() => {});
  return job;
};

// Make a complete business site. label: the site name (1-64), wifiName: 1-32 characters,
// speedKbps: whole Mbps in kbps (for example 2048). Returns { siteId, devicePassword, setupPassword }.
const createBusinessSite = async ({ label, wifiName, speedKbps }) => {
  const devicePassword = strongPassword();
  let siteId = null;
  let stage = 'site';
  try {
    const created = await call('POST', 'v1/{id}/sites', {
      name: label,
      type: 0,
      region: SITE_REGION,
      timeZone: SITE_TIMEZONE,
      scenario: SITE_SCENARIO,
      deviceAccountSetting: { username: DEVICE_USER, password: devicePassword },
      supportES: false,
      supportL2: false
    });
    siteId = (created && (created.siteId || created.id)) || null;
    if (!siteId) {
      const found = (await listSites()).find((s) => s && s.name === label);
      siteId = found ? found.siteId : null;
    }
    if (typeof siteId !== 'string' || !/^[0-9a-f]{24}$/.test(siteId)) {
      siteId = null;
      throw new OmadaError('the controller did not return the new site ID', 'refused');
    }

    stage = 'wifi';
    const ssid = await call('POST', `v2/{id}/sites/${siteId}/wireless-network/ssids`, {
      name: wifiName,
      deviceType: 1,          // access points
      ssidEnable: true,       // WiFi switched on (the controller refuses without these two,
      chooseDevices: 0,       // found with wifi-probe 6 Nov 2026): on all access points of the site
      band: 3,                // 2.4 GHz + 5 GHz
      guestNetEnable: true,   // phones cannot reach the business's own network
      security: 0,            // open: the portal decides who gets in
      broadcast: true,
      vlanEnable: false,
      mloEnable: false,
      pmfMode: 3,             // not used on an open WiFi
      enable11r: false,
      hidePwd: false
    });
    let ssidId = ssid && ssid.id;
    if (!ssidId) {
      const list = listOf(await call('GET', `v2/{id}/sites/${siteId}/wireless-network/ssids?page=1&pageSize=100`));
      const found = list.find((w) => w && w.name === wifiName);
      ssidId = found && (found.id || found.ssidId);
    }
    if (!ssidId) throw new OmadaError('the controller did not return the new WiFi ID', 'refused');

    stage = 'speed';
    const mbps = Math.round(Number(speedKbps) / 1024);
    await call('PATCH', `v1/{id}/sites/${siteId}/wireless-network/ssids/${ssidId}/rate-limit`, {
      clientRateLimit: {
        customSetting: {
          downLimitEnable: true, downLimit: mbps, downLimitType: 1,
          upLimitEnable: true, upLimit: mbps, upLimitType: 1
        }
      }
    });

    stage = 'portal';
    await call('POST', `v1/{id}/sites/${siteId}/portal`, {
      name: PORTAL_NAME,
      enable: true,
      ssidList: [ssidId],
      authType: 4, // External Portal Server
      authTimeout: { customTimeout: PORTAL_TIMEOUT_DAYS, customTimeoutUnit: 3 },
      httpsRedirectEnable: true,
      landingPage: 1,
      externalPortal: { hostType: 2, serverUrlScheme: 'https', serverUrl: `${env.OMADA_PUBLIC_HOST}/portal/` }
    });

    stage = 'pre-login';
    await call('PATCH', `v1/{id}/sites/${siteId}/setting/access-control`, {
      preAuthAccessEnable: true,
      preAuthAccessPolicies: [{ type: 1, ip: env.OMADA_PUBLIC_IP, subnetMask: 32, description: 'Oswagolink portal' }],
      freeAuthClientEnable: false
    });

    stage = 'operator';
    await changeOperatorSites(siteId, true);

    return { siteId, devicePassword, setupPassword: setupPassword() };
  } catch (err) {
    if (siteId) {
      try {
        await call('DELETE', `v1/{id}/sites/${siteId}`);
      } catch (cleanupErr) {
        console.error(`[Omada] A half-made site ${siteId} could not be deleted again: ${cleanupErr.message}`);
      }
    }
    err.stage = stage;
    throw err;
  }
};

// Remove a site Oswagolink made: forget its access points (they reset to factory settings),
// delete it, then take it off the operator. A site that is already gone counts as removed.
const deleteBusinessSite = async (siteId, apMacs = []) => {
  if (!(await siteExists(siteId))) return { removed: false, alreadyGone: true };
  const inSite = new Set(listOf(await call('GET', `v1/{id}/sites/${siteId}/devices?page=1&pageSize=200`))
    .map((d) => normalizeMac(String((d && d.mac) || ''))).filter(Boolean));
  for (const mac of apMacs) {
    const m = normalizeMac(String(mac || ''));
    if (m && inSite.has(m)) await call('POST', `v1/{id}/sites/${siteId}/devices/${dashed(m)}/forget`);
  }
  try {
    await call('DELETE', `v1/{id}/sites/${siteId}`);
  } catch (err) {
    if (await siteExists(siteId)) throw err;
  }
  // Only AFTER the site is gone: while it exists, the operator must keep it (phones are let
  // in through it). Not a reason to fail: the site is already deleted.
  try {
    await changeOperatorSites(siteId, false);
  } catch (err) {
    console.error(`[Omada] Could not take deleted site ${siteId} off the operator: ${err.message}`);
  }
  return { removed: true };
};

// ------------------------------------------------------------
// Adopting (V2-3)
// ------------------------------------------------------------
// Access points waiting to be adopted, as seen from a site: [{ mac: 'AA:BB:..', model }]
const listPending = async (siteId) =>
  listOf(await call('GET', `v1/{id}/sites/${siteId}/grid/devices/pending?page=1&pageSize=100`))
    .map((d) => ({ mac: normalizeMac(String((d && d.mac) || '')), model: String((d && (d.model || d.modelName)) || '').slice(0, 40) }))
    .filter((d) => d.mac);

const ADOPT_ERRORS = { '-39003': 'wrong_login', '-39002': 'no_answer' };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Adopt one access point into a site. login: { username, password } or null (factory login).
// Returns 'adopted', 'wrong_login', 'no_answer' or 'failed'.
const adopt = async (siteId, mac, login, { tries = 10, everyMs = 4000 } = {}) => {
  const path = `v1/{id}/sites/${siteId}/devices/${dashed(mac)}`;
  try {
    await call('POST', `${path}/start-adopt`, login ? { username: login.username, password: login.password } : {});
  } catch (err) {
    if (err.omadaCode === -39003) return 'wrong_login';
    throw err;
  }
  for (let i = 0; i < tries; i++) {
    await wait(everyMs);
    let result = null;
    try {
      result = await call('GET', `${path}/adopt-result`);
    } catch (err) {
      result = null;
    }
    const code = result && Number(result.adoptErrorCode);
    if (code === 0) return 'adopted';
    if (ADOPT_ERRORS[String(code)]) return ADOPT_ERRORS[String(code)];
    if (code === -39004) return 'failed';
    // Still busy: is it in the site already?
    const devices = listOf(await call('GET', `v1/{id}/sites/${siteId}/devices?page=1&pageSize=200`));
    if (devices.some((d) => d && normalizeMac(String(d.mac || '')) === mac && d.status !== 2)) return 'adopted';
  }
  return 'no_answer';
};

module.exports = {
  createBusinessSite,
  deleteBusinessSite,
  changeOperatorSites,
  listSites,
  listPending,
  adopt,
  informUrl,
  SETUP_USER,
  _test: { strongPassword, setupPassword }
};
