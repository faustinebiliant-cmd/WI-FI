// ============================================================
// OSWAGOTech WiFi - Subscription Guard
// A suspended tenant, or one whose trial has ended, is blocked
// from the tenant panel and from the guest portal.
// ============================================================

// SQL condition, true when the tenant must be blocked.
// The query must join the tenants table with the alias "t".
// The trial end date is compared with today's date in EAT.
const TENANT_BLOCKED_SQL = `(
  t.subscription_status = 'suspended'
  OR (t.subscription_status = 'trial'
      AND t.trial_ends_at IS NOT NULL
      AND t.trial_ends_at < (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)
)`;

// The tenant panel recognises the code and sends the user back to the login page
const TENANT_BLOCKED_ERROR = {
  success: false,
  code: 'TENANT_SUSPENDED',
  error: 'This account is suspended or its trial has ended. Please contact OSWAGOTech.'
};

// What guests see on the portal of a blocked tenant
const PORTAL_BLOCKED_ERROR = {
  success: false,
  error: 'This WiFi service is not available right now. Please contact the reception.'
};

module.exports = { TENANT_BLOCKED_SQL, TENANT_BLOCKED_ERROR, PORTAL_BLOCKED_ERROR };
