// ============================================================
// OSWAGOTech WiFi - MikroTik Router Adapter
// Uses node-routeros to communicate with real hardware.
// ============================================================
const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { decrypt } = require('../../utils/encryption');

class MikroTikRouter {
  constructor(routerRecord) {
    this.ip = routerRecord.ip_address;
    this.port = routerRecord.api_port || 8728;
    this.username = routerRecord.api_username;
    
    // Decrypt the password before connecting
    this.password = decrypt(routerRecord.api_password_encrypted);
    
    if (!this.password) {
      throw new Error('Failed to decrypt router password');
    }
  }

  // Helper to establish the connection
  async getConnection() {
    const conn = new RouterOSAPI({
      host: this.ip,
      user: this.username,
      password: this.password,
      port: this.port,
      timeout: 5 // 5 seconds timeout
    });

    await conn.connect();
    return conn;
  }

  /**
   * Creates a Hotspot User on the MikroTik.
   * @param {string} code - The voucher code (e.g. "011847")
   * @param {number} durationMinutes - How long the guest gets
   * @param {number} speedLimitKbps - The speed limit (e.g. 5120 for 5Mbps)
   */
  async createVoucher(code, durationMinutes, speedLimitKbps) {
    let conn;
    try {
      conn = await this.getConnection();

      // MikroTik expects speed limits in the format "Upload/Download" 
      // e.g., "5120k/5120k" for 5Mbps symmetric
      const rateLimit = `${speedLimitKbps}k/${speedLimitKbps}k`;

      // MikroTik limit-uptime expects format like "1h30m" or "1440m"
      const limitUptime = `${durationMinutes}m`;

      // Add the user to the Hotspot Server
      await conn.write('/ip/hotspot/user/add', [
        `=name=${code}`,
        `=password=${code}`, // The password is the same as the username
        `=limit-uptime=${limitUptime}`,
        `=rate-limit=${rateLimit}`,
        '=profile=default'
      ]);

      return { ok: true, expiresAt: new Date(Date.now() + durationMinutes * 60000) };
    } catch (error) {
      console.error(`[MikroTik] Failed to create voucher ${code}:`, error.message);
      return { ok: false, error: error.message };
    } finally {
      if (conn) conn.close();
    }
  }

  /**
   * Fetches currently active guests from the router.
   */
  async getActiveUsers() {
    let conn;
    try {
      conn = await this.getConnection();
      
      // Ask for all active hotspot connections
      const active = await conn.write('/ip/hotspot/active/print');

      return active.map(user => ({
        mac: user['mac-address'],
        ip: user.address,
        voucherCode: user.user,
        startedAt: user['login-by'],
        expiresAt: null // Router doesn't give us exact expiry here, we track that in DB
      }));
    } catch (error) {
      console.error('[MikroTik] Failed to fetch active users:', error.message);
      return [];
    } finally {
      if (conn) conn.close();
    }
  }

  /**
   * Kicks a user off the WiFi immediately.
   * @param {string} macAddress - The device MAC address to disconnect
   */
  async disconnectUser(macAddress) {
    let conn;
    try {
      conn = await this.getConnection();

      // Find the active connection ID for this MAC
      const active = await conn.write('/ip/hotspot/active/print', [
        `?mac-address=${macAddress}`
      ]);

      if (active.length > 0) {
        const id = active[0]['.id'];
        // Remove the active connection
        await conn.write('/ip/hotspot/active/remove', [`=.id=${id}`]);
      }

      return { ok: true };
    } catch (error) {
      console.error(`[MikroTik] Failed to disconnect MAC ${macAddress}:`, error.message);
      return { ok: false, error: error.message };
    } finally {
      if (conn) conn.close();
    }
  }

  /**
   * Pings the router to check if it is online.
   */
  async checkStatus() {
    let conn;
    try {
      conn = await this.getConnection();
      const sysInfo = await conn.write('/system/resource/print');
      return { online: true, version: sysInfo[0]?.version || 'Unknown' };
    } catch (error) {
      return { online: false, error: error.message };
    } finally {
      if (conn) conn.close();
    }
  }
}

module.exports = MikroTikRouter;