// ============================================================
// OSWAGOTech WiFi - MikroTik Router Adapter
// ============================================================
const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { decrypt } = require('../../utils/encryption');

class MikroTikRouter {
  constructor(routerRecord) {
    this.ip = routerRecord.ip_address;
    this.port = routerRecord.api_port || 8728;
    this.username = routerRecord.api_username;
    this.password = decrypt(routerRecord.api_password_encrypted);
    
    if (!this.password) {
      throw new Error('Failed to decrypt router password');
    }
  }

  async getConnection() {
    const conn = new RouterOSAPI({
      host: this.ip,
      user: this.username,
      password: this.password,
      port: this.port,
      timeout: 5
    });
    await conn.connect();
    return conn;
  }

  async createVoucher(code, durationMinutes, speedLimitKbps) {
    let conn;
    try {
      conn = await this.getConnection();
      const limitUptime = `${durationMinutes}m`;
      
      await conn.write('/ip/hotspot/user/add', [
        `=name=${code}`,
        `=password=${code}`,
        `=limit-uptime=${limitUptime}`,
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

  // NEW: This is the only function we are adding to this file
  async removeVoucher(code) {
    let conn;
    try {
      conn = await this.getConnection();
      
      try {
        const active = await conn.write('/ip/hotspot/active/print', [`?user=${code}`]);
        if (active.length > 0) {
          await conn.write('/ip/hotspot/active/remove', [`=.id=${active[0]['.id']}`]);
        }
      } catch (err) {
        if (err.message && !err.message.includes('!empty')) throw err;
      }

      try {
        const user = await conn.write('/ip/hotspot/user/print', [`?name=${code}`]);
        if (user.length > 0) {
          await conn.write('/ip/hotspot/user/remove', [`=.id=${user[0]['.id']}`]);
        }
      } catch (err) {
        if (err.message && !err.message.includes('!empty')) throw err;
      }

      return { ok: true };
    } catch (error) {
      console.error(`[MikroTik] Failed to remove voucher ${code}:`, error.message);
      return { ok: false, error: error.message };
    } finally {
      if (conn) conn.close();
    }
  }

  async getActiveUsers() {
    let conn;
    try {
      conn = await this.getConnection();
      const active = await conn.write('/ip/hotspot/active/print');

      return active.map(user => ({
        mac: user['mac-address'],
        ip: user.address,
        voucherCode: user.user,
        startedAt: user['login-by'],
        expiresAt: null 
      }));
    } catch (error) {
      console.error('[MikroTik] Failed to fetch active users:', error.message);
      return [];
    } finally {
      if (conn) conn.close();
    }
  }

  async disconnectUser(macAddress) {
    let conn;
    try {
      conn = await this.getConnection();
      const active = await conn.write('/ip/hotspot/active/print', [
        `?mac-address=${macAddress}`
      ]);

      if (active.length > 0) {
        const id = active[0]['.id'];
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