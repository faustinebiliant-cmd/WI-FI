// ============================================================
// OSWAGOTech WiFi - Mock Router
// Used for development before real MikroTik hardware arrives.
// Has the same methods as MikroTikRouter, so every caller works in mock mode.
// ============================================================
class MockRouter {
  async createVoucher(code, durationMinutes, speedDownKbps, speedUpKbps) {
    console.log(`[MockRouter] Created voucher for ${durationMinutes} mins`);
    return { ok: true, expiresAt: new Date(Date.now() + durationMinutes * 60000) };
  }

  async removeVoucher(code) {
    console.log('[MockRouter] Removed voucher');
    return { ok: true };
  }

  async getActiveUsers() {
    return [];
  }

  async disconnectUser(macAddress) {
    console.log(`[MockRouter] Disconnected MAC ${macAddress}`);
    return { ok: true };
  }

  async checkStatus() {
    return { online: true, version: 'mock' };
  }
}

module.exports = MockRouter;
