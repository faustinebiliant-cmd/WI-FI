// ============================================================
// Oswagolink - Router Factory
// ============================================================
const env = require('../../config/env');
const MockRouter = require('./MockRouter');
const MikroTikRouter = require('./MikroTikRouter');

// mock: development without hardware. real: the MikroTik adapter.
// If the MikroTik adapter cannot be created (for example the stored password
// cannot be decrypted), this throws. There is no silent stand-in: callers must
// report "router not reachable" instead of pretending the action worked.
const getRouter = (routerRecord) => {
  if (env.ROUTER_MODE === 'mock') {
    return new MockRouter();
  }
  return new MikroTikRouter(routerRecord);
};

module.exports = { getRouter };
