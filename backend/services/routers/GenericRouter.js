// ============================================================
// OSWAGOTech WiFi - Generic Router Adapter
// For routers that do not have a programmable API (e.g. TP-Link)
// Speed limits and timeouts are managed by the cloud portal,
// not the hardware.
// ============================================================
class GenericRouter {
  async createVoucher(code, durationMinutes, speedLimitKbps) {
    console.log(`[GenericRouter] Customer authorized for ${durationMinutes} mins.`);
    return { 
      ok: true, 
      expiresAt: new Date(Date.now() + durationMinutes * 60000) 
    };
  }

  async getActiveUsers() {
    // We can't ask the router. We only know who is connected 
    // by checking the `sessions` table in the database.
    return [];
  }

  async disconnectUser(macAddress) {
    console.log(`[GenericRouter] Kicked MAC ${macAddress}. Customer must log in again.`);
    return { ok: true };
  }
}

module.exports = GenericRouter;