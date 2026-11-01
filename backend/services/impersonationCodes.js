// ============================================================
// Oswagolink - One-time impersonation codes
// ============================================================
// The admin panel (admin.oswagolink.co.tz) and the Business Panel
// (oswagolink.co.tz/tenant) are different sites, so they cannot share
// browser storage. To "Impersonate Owner", the admin panel gets a short
// random code, sends the browser to the Business Panel with it, and the
// Business Panel swaps the code for the login token, once.
//
// Codes live in memory only (one backend process), work for 60 seconds
// and can be used once. A backend restart simply cancels open codes.
// ============================================================

const crypto = require('crypto');

const CODE_LIFETIME_MS = 60 * 1000;
const codes = new Map(); // code -> { token, tenantUser, expiresAt }

const removeExpired = () => {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(code);
  }
};

const issueImpersonationCode = (token, tenantUser) => {
  removeExpired();
  const code = crypto.randomBytes(32).toString('base64url');
  codes.set(code, { token, tenantUser, expiresAt: Date.now() + CODE_LIFETIME_MS });
  return code;
};

// Returns { token, tenantUser } once, or null for an unknown, used or expired code
const redeemImpersonationCode = (code) => {
  removeExpired();
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  return { token: entry.token, tenantUser: entry.tenantUser };
};

module.exports = { issueImpersonationCode, redeemImpersonationCode };
