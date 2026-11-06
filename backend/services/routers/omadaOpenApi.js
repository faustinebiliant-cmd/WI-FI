// ============================================================
// Oswagolink - TP-Link Open API (automation)
//
// The official programs' entrance of the Omada controller, used for automation:
// sites, adopting access points, speeds. Same rules as omadaClient.js:
// - only 127.0.0.1, certificate fingerprint checked before anything is sent
//   (it uses the same connection function);
// - the key (OMADA_OPENAPI_CLIENT_ID / _SECRET) lives only in the VPS .env and is
//   never logged; neither is the access token.
//
// Commands (from the controller's own API document, Omada 6.3.0.45):
//   POST /openapi/authorize/token?grant_type=client_credentials  {omadacId, client_id, client_secret}
//   then every call sends the header  Authorization: AccessToken=<token>
// ============================================================
const env = require('../../config/env');
const { rawRequest, OmadaError } = require('./omadaClient');

const TOKEN_SAFETY_MS = 5 * 60 * 1000; // renew 5 minutes before the controller says it ends

let token = null;     // { value, until }
let gettingToken = null;

const ensureEnabled = () => {
  if (!env.OMADA_OPENAPI_ENABLED) {
    throw new OmadaError('TP-Link Open API key is not set up on this server (OMADA_OPENAPI_* missing)', 'not_configured');
  }
};

const fetchToken = async () => {
  const r = await rawRequest('POST', '/openapi/authorize/token?grant_type=client_credentials', {
    omadacId: env.OMADA_CONTROLLER_ID,
    client_id: env.OMADA_OPENAPI_CLIENT_ID,
    client_secret: env.OMADA_OPENAPI_CLIENT_SECRET
  });
  const result = r.json && r.json.errorCode === 0 ? r.json.result : null;
  const value = result && result.accessToken;
  if (!value || typeof value !== 'string') {
    // Never log the secret or the answer body; the error code is enough
    throw new OmadaError(`Open API key refused (code ${r.json ? r.json.errorCode : r.status})`, 'login_refused');
  }
  const seconds = Number(result.expiresIn) > 0 ? Number(result.expiresIn) : 3600;
  token = { value, until: Date.now() + seconds * 1000 - TOKEN_SAFETY_MS };
  return token;
};

const getToken = async () => {
  if (token && Date.now() < token.until) return token;
  if (!gettingToken) {
    gettingToken = fetchToken().finally(() => {
      gettingToken = null;
    });
  }
  return gettingToken;
};

// One Open API call. path starts after /openapi/ and may contain {id} = the controller ID.
// Returns the answer's "result" (errorCode 0) or throws OmadaError with the controller's code.
const call = async (method, path, body) => {
  ensureEnabled();
  const fullPath = `/openapi/${path.replace('{id}', env.OMADA_CONTROLLER_ID)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await getToken();
    const r = await rawRequest(method, fullPath, body, { Authorization: `AccessToken=${t.value}` });
    const code = r.json ? r.json.errorCode : null;
    if (code === 0) return r.json.result;
    // Token ended early (for example after a controller restart): get a new one, once
    if (attempt === 0 && (r.status === 401 || (typeof code === 'number' && code <= -44100 && code > -44200))) {
      token = null;
      continue;
    }
    const msg = r.json && typeof r.json.msg === 'string' ? r.json.msg.slice(0, 200) : '';
    const err = new OmadaError(`controller refused (code ${code === null ? r.status : code}${msg ? ': ' + msg : ''})`, 'refused');
    err.omadaCode = code;
    throw err;
  }
  throw new OmadaError('controller refused after a new token', 'refused');
};

// ------------------------------------------------------------
// What the rest of the backend uses (all values must already be checked by the caller)
// ------------------------------------------------------------
const dashed = (mac) => String(mac).toUpperCase().replace(/:/g, '-');
const colons = (mac) => String(mac || '').toUpperCase().replace(/-/g, ':');

// Speeds come in kbps (packages store multiples of 1024 = whole Mbps). 0 or missing = no own
// speed: the limit is removed, so the WiFi speed limit applies.
// Tested 6 Nov 2026: 1 Mbps limit gave 920 kbps on the phone, removed gave 2.1 Mbps.
const toLimit = (kbps) => {
  const k = Number(kbps);
  if (!Number.isInteger(k) || k <= 0) return null;
  if (k % 1024 === 0 && k / 1024 <= 1024) return { unit: 2, value: k / 1024 }; // Mbps
  if (k <= 1024) return { unit: 1, value: k };                                  // Kbps
  return { unit: 2, value: Math.min(1024, Math.round(k / 1024)) };
};

const setClientSpeed = async (site, clientMac, downKbps, upKbps) => {
  const down = toLimit(downKbps);
  const up = toLimit(upKbps);
  const customRateLimit = {
    downEnable: Boolean(down),
    upEnable: Boolean(up),
    ...(down ? { downUnit: down.unit, downLimit: down.value } : {}),
    ...(up ? { upUnit: up.unit, upLimit: up.value } : {})
  };
  await call('PATCH', `v1/{id}/sites/${site}/clients/${dashed(clientMac)}/ratelimit`, { mode: 0, customRateLimit });
  return Boolean(down || up);
};

const AP_STATUS = { 0: 'offline', 1: 'online', 2: 'pending', 3: 'heartbeat_missed', 4: 'isolated' };

// The access points of a site with their status: [{ mac: 'AA:BB:..', status: 'online' }]
const listSiteDevices = async (site) => {
  const r = await call('GET', `v1/{id}/sites/${site}/devices?page=1&pageSize=200`);
  const list = Array.isArray(r && r.data) ? r.data : [];
  return list
    .filter((d) => d && typeof d.mac === 'string')
    .map((d) => ({ mac: colons(d.mac), status: AP_STATUS[d.status] || 'offline' }));
};

module.exports = { call, setClientSpeed, listSiteDevices, OmadaError, _test: { toLimit } };
