// ============================================================
// Oswagolink - Connection to the TP-Link Omada controller
//
// The controller runs on this VPS (Docker box "omada"). This file is the only place
// that talks to it. Rules:
// - Only inside the VPS: 127.0.0.1, never a name or another address.
// - Before ANY data is sent (the operator password included), the controller's
//   certificate fingerprint is compared with OMADA_CERT_SHA256. Another program that
//   took the port (for example while the controller restarts) gets nothing.
// - One shared login (the hotspot operator), renewed every 20 minutes or when refused.
// - Every answer is limited to 2 MB and 10 seconds.
//
// The calls used here were tested on Omada Network Application 6.3.0.45 (Phase A/B,
// 4-5 November 2026):
//   GET  /api/info                                               (no login)
//   POST /{id}/api/v2/hotspot/login                              {name, password} -> token + cookie
//   POST /{id}/api/v2/hotspot/extPortal/auth                     let a phone in; time = DURATION in ms
//   GET  /{id}/api/v2/hotspot/sites/{site}/clients?currentPage&currentPageSize   approvals
//   POST /{id}/api/v2/hotspot/sites/{site}/cmd/clients/{rowId}/disconnect        body: null
// ============================================================
const https = require('https');
const tls = require('tls');
const env = require('../../config/env');

const HOST = '127.0.0.1';
const TIMEOUT_MS = 10 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const SESSION_MAX_AGE_MS = 20 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // at most 2,000 approval rows per site per look

// errorCode values that mean "your login is no longer valid": log in again once
const LOGIN_EXPIRED = new Set([-1001, -1200, -1201, -1202, -1203, -1204, -1205]);

class OmadaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'OmadaError';
    this.code = code;
  }
}

const ensureEnabled = () => {
  if (!env.OMADA_ENABLED) {
    throw new OmadaError('TP-Link is not set up on this server (OMADA_* settings missing)', 'not_configured');
  }
};

// Opens a TLS connection to the controller and checks its certificate BEFORE handing
// the connection to the request (so no request data can leave before the check).
const connectVerified = () =>
  new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, socket) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(socket);
    };
    // The controller uses its own self-made certificate, so the normal check cannot
    // succeed. Instead we compare its exact fingerprint (stronger than a normal check).
    const socket = tls.connect({ host: HOST, port: env.OMADA_PORT, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      const fingerprint = String((cert && cert.fingerprint256) || '').replace(/:/g, '').toLowerCase();
      if (fingerprint !== env.OMADA_CERT_SHA256) {
        socket.destroy();
        console.error('[Omada] The controller certificate does not match OMADA_CERT_SHA256. Nothing was sent.');
        return done(new OmadaError('controller certificate mismatch', 'cert_mismatch'));
      }
      done(null, socket);
    });
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      done(new OmadaError('controller did not answer in time', 'timeout'));
    });
    socket.once('error', (err) => done(new OmadaError(`controller not reachable (${err.code || err.message})`, 'unreachable')));
  });

// One request on a verified connection. body: object (sent as JSON), the string 'null', or undefined.
const rawRequest = async (method, path, body, headers = {}) => {
  const socket = await connectVerified();
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : body === 'null' ? 'null' : JSON.stringify(body);
    const req = https.request(
      {
        host: HOST,
        port: env.OMADA_PORT,
        method,
        path,
        // No agent: the request must use exactly this already-checked connection
        createConnection: () => socket,
        timeout: TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          ...(data !== null ? { 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new OmadaError('controller answer too big', 'too_big'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode, json, cookies: res.headers['set-cookie'] || [] });
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new OmadaError('controller did not answer in time', 'timeout')));
    req.on('error', (err) => reject(err instanceof OmadaError ? err : new OmadaError(`controller request failed (${err.code || err.message})`, 'unreachable')));
    if (data !== null) req.write(data);
    req.end();
  });
};

// ------------------------------------------------------------
// The shared operator login
// ------------------------------------------------------------
let session = null;     // { token, cookie, at }
let loggingIn = null;   // the login in progress, so many requests share one login

const login = async () => {
  const r = await rawRequest('POST', `/${env.OMADA_CONTROLLER_ID}/api/v2/hotspot/login`, {
    name: env.OMADA_OPERATOR_USER,
    password: env.OMADA_OPERATOR_PASSWORD
  });
  const token = r.json && r.json.errorCode === 0 && r.json.result && r.json.result.token;
  const cookie = r.cookies.map((c) => String(c).split(';')[0]).find((c) => c.startsWith('TPOMADA_SESSIONID='));
  if (!token || typeof token !== 'string' || !cookie) {
    // Never log the password or the answer body; the error code is enough
    throw new OmadaError(`operator login refused (code ${r.json ? r.json.errorCode : r.status})`, 'login_refused');
  }
  session = { token, cookie, at: Date.now() };
  return session;
};

const getSession = async () => {
  if (session && Date.now() - session.at < SESSION_MAX_AGE_MS) return session;
  if (!loggingIn) {
    loggingIn = login().finally(() => {
      loggingIn = null;
    });
  }
  return loggingIn;
};

// A logged-in API call. Returns the JSON answer (errorCode 0) or throws OmadaError.
const call = async (method, path, body) => {
  ensureEnabled();
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getSession();
    const r = await rawRequest(method, `/${env.OMADA_CONTROLLER_ID}${path}`, body, {
      'Csrf-Token': s.token,
      Cookie: s.cookie
    });
    const code = r.json ? r.json.errorCode : null;
    if (code === 0) return r.json;
    // Login no longer valid (or the controller restarted): log in again, once
    if (attempt === 0 && (r.status === 401 || r.json === null || LOGIN_EXPIRED.has(code))) {
      session = null;
      continue;
    }
    throw new OmadaError(`controller refused (code ${code === null ? r.status : code})`, 'refused');
  }
  throw new OmadaError('controller refused after a new login', 'refused');
};

// ------------------------------------------------------------
// What the rest of the backend uses
// ------------------------------------------------------------
const toDashes = (mac) => String(mac).toUpperCase().replace(/:/g, '-');
const toColons = (mac) => String(mac || '').toUpperCase().replace(/-/g, ':');

// Let a phone in for `minutes`. All values must already be checked by the caller.
const authorize = async ({ site, clientMac, apMac, ssidName, radioId, minutes }) => {
  await call('POST', '/api/v2/hotspot/extPortal/auth', {
    clientMac: toDashes(clientMac),
    apMac: toDashes(apMac),
    ssidName,
    radioId: Number(radioId),
    site,
    // A DURATION in milliseconds (tested: an end time here gave the year 2083)
    time: minutes * 60 * 1000,
    authType: 4
  });
};

// Every approval row of a site (valid and ended), newest pages first as the controller sends them
const listApprovals = async (site) => {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const answer = await call('GET', `/api/v2/hotspot/sites/${site}/clients?currentPage=${page}&currentPageSize=${PAGE_SIZE}`);
    const result = answer.result || {};
    const data = Array.isArray(result.data) ? result.data : Array.isArray(result) ? result : [];
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
};

// The phones that are let in right now: [{ mac: 'AA:BB:..', ip }]
const listValid = async (site) => {
  const rows = await listApprovals(site);
  return rows
    .filter((c) => c && c.valid === true)
    .map((c) => ({ mac: toColons(c.mac), ip: typeof c.ip === 'string' ? c.ip : null, rowId: String(c.id || '') }));
};

// Cut one phone off at once (every still-valid approval of that MAC). Returns how many were cut.
const cutMac = async (site, mac) => {
  const target = toColons(mac);
  const valid = (await listValid(site)).filter((c) => c.mac === target && /^[0-9a-f]{24}$/i.test(c.rowId));
  for (const c of valid) {
    await call('POST', `/api/v2/hotspot/sites/${site}/cmd/clients/${c.rowId}/disconnect`, 'null');
  }
  return valid.length;
};

// Forget the shared login, so the next call logs in again. Used after Oswagolink gave the
// operator a new site: a fresh login surely includes it.
const resetSession = () => {
  session = null;
};

// Is the controller answering for this site? (a tiny list request)
const ping = async (site) => {
  await call('GET', `/api/v2/hotspot/sites/${site}/clients?currentPage=1&currentPageSize=1`);
  return true;
};

module.exports = {
  authorize,
  listValid,
  cutMac,
  ping,
  resetSession,
  OmadaError,
  // For omadaOpenApi.js only: the same certificate-checked connection
  rawRequest,
  toDashes,
  _test: { toDashes, toColons }
};
