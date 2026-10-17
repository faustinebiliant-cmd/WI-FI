// ============================================================
// OSWAGOTech WiFi - Mock Router
// Used for development before real MikroTik hardware arrives.
// ============================================================
class MockRouter {
  async createVoucher(code, durationMinutes, speedLimitKbps) {
    console.log(`[MockRouter] Created voucher ${code} for ${durationMinutes} mins`);
    return { ok: true, expiresAt: new Date(Date.now() + durationMinutes * 60000) };
  }

  async getActiveUsers() {
    return []; // We will mock this later
  }

  async disconnectUser(macAddress) {
    console.log(`[MockRouter] Disconnected MAC ${macAddress}`);
    return { ok: true };
  }
}

module.exports = MockRouter;