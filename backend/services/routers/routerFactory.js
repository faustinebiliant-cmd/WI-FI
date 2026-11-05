// ============================================================
// Oswagolink - Router Factory
// ============================================================
const env = require('../../config/env');
const MockRouter = require('./MockRouter');
const MikroTikRouter = require('./MikroTikRouter');
const OmadaRouter = require('./OmadaRouter');
const { isValidOmadaSiteId } = require('../../utils/validators');

// mock: development without hardware. real: the MikroTik or TP-Link (Omada) adapter,
// chosen by the router's device_type (old records without one are MikroTik).
// If the adapter cannot be created (for example the stored password cannot be
// decrypted, or a TP-Link router has no controller site yet), this throws. There is no
// silent stand-in: callers must report "router not reachable" instead of pretending
// the action worked.
const getRouter = (routerRecord) => {
  if (env.ROUTER_MODE === 'mock') {
    return new MockRouter();
  }
  if (routerRecord && routerRecord.device_type === 'omada') {
    return new OmadaRouter(routerRecord);
  }
  return new MikroTikRouter(routerRecord);
};

// Is this router set up far enough to be used?
//   MikroTik: it has its tunnel address.  TP-Link: it has its controller site.
const isRouterReady = (r) => {
  if (!r) return false;
  if (r.device_type === 'omada') return isValidOmadaSiteId(r.omada_site_id);
  return Boolean(r.ip_address && r.ip_address !== '0.0.0.0');
};

// The router columns every caller of getRouter / isRouterReady must select
// (prefix r. in queries). Keeps all callers in step with the factory.
const ROUTER_ADAPTER_COLUMNS = 'r.id, r.tenant_id, r.device_type, r.omada_site_id, r.ip_address, r.api_port, r.api_username, r.api_password_encrypted';

module.exports = { getRouter, isRouterReady, ROUTER_ADAPTER_COLUMNS };
