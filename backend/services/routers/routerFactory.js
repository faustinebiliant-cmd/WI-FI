// ============================================================
// OSWAGOTech WiFi - Router Factory
// ============================================================
const env = require('../../config/env');
const MockRouter = require('./MockRouter');
const GenericRouter = require('./GenericRouter');
const MikroTikRouter = require('./MikroTikRouter');

const getRouter = (routerRecord) => {
  // 1. In development, always use the Mock
  if (env.ROUTER_MODE === 'mock') {
    return new MockRouter();
  }
  
  // 2. In production, use the real MikroTik adapter
  if (env.ROUTER_MODE === 'real') {
    try {
      return new MikroTikRouter(routerRecord);
    } catch (err) {
      console.error('Failed to initialize MikroTikRouter:', err.message);
      // If MikroTik fails (e.g. bad password), fallback to Generic
      return new GenericRouter();
    }
  }

  // Absolute fallback
  return new GenericRouter();
};

module.exports = { getRouter };