// ============================================================
// OSWAGOTech WiFi - MikroTik Router Adapter
// ============================================================
const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { decrypt } = require('../../utils/encryption');

const safePrint = async (conn, path, query = []) => {
  try {
    return await conn.write(path, query);
  } catch (err) {
    if (err.message && err.message.includes('!empty')) return [];
    throw err;
  }
};

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

  async createVoucher(code, durationMinutes, speedDownKbps, speedUpKbps) {
    let conn;
    try {
      conn = await this.getConnection();
      const limitUptime = `${Math.max(1, Math.round(durationMinutes))}m`;
      const down = Math.round(Number(speedDownKbps));
      const up = Math.round(Number(speedUpKbps));
      const profileName = `spd-${down}d-${up}u`;

      // 1. Ensure the speed profile exists
      const profiles = await safePrint(conn, '/ip/hotspot/user/profile/print', [`?name=${profileName}`]);
      if (profiles.length === 0) {
        try {
          await conn.write('/ip/hotspot/user/profile/add', [
            `=name=${profileName}`,
            `=rate-limit=${up}k/${down}k`,
            '=shared-users=1'
          ]);
        } catch (err) {
           if (!err.message.includes('already have')) throw err;
        }
      }

      // 2. Check if the user already exists (Resume case)
      const existing = await safePrint(conn, '/ip/hotspot/user/print', [`?name=${code}`]);
      
      if (existing.length > 0) {
        // Update existing user
        await conn.write('/ip/hotspot/user/set', [
          `=.id=${existing[0]['.id']}`,
          `=profile=${profileName}`,
          `=limit-uptime=${limitUptime}`
        ]);
      } else {
        // Create fresh user
        try {
          await conn.write('/ip/hotspot/user/add', [
            `=name=${code}`,
            `=password=${code}`,
            `=limit-uptime=${limitUptime}`,
            `=profile=${profileName}`
          ]);
        } catch (err) {
          // Ignore the router being weird
          if (!err.message.includes('!empty')) throw err;
        }
      }

      return { ok: true, expiresAt: new Date(Date.now() + durationMinutes * 60000) };
    } catch (error) {
      console.error(`[MikroTik] Failed to create voucher ${code}:`, error.message);
      return { ok: false, error: error.message };
    } finally {
      if (conn) conn.close();
    }
  }

  async removeVoucher(code) {
    let conn;
    try {
      conn = await this.getConnection();
      
      const active = await safePrint(conn, '/ip/hotspot/active/print', [`?user=${code}`]);
      for (const a of active) {
        await conn.write('/ip/hotspot/active/remove', [`=.id=${a['.id']}`]);
      }

      const users = await safePrint(conn, '/ip/hotspot/user/print', [`?name=${code}`]);
      for (const u of users) {
        await conn.write('/ip/hotspot/user/remove', [`=.id=${u['.id']}`]);
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
      const active = await safePrint(conn, '/ip/hotspot/active/print');
      return active.map(user => ({
        mac: user['mac-address'],
        ip: user.address,
        voucherCode: user.user,
        uptime: user.uptime,
        expiresAt: null
      }));
    } catch (error) {
      return [];
    } finally {
      if (conn) conn.close();
    }
  }

  async disconnectUser(macAddress) {
    let conn;
    try {
      conn = await this.getConnection();
      const active = await safePrint(conn, '/ip/hotspot/active/print', [`?mac-address=${macAddress}`]);
      for (const a of active) {
        await conn.write('/ip/hotspot/active/remove', [`=.id=${a['.id']}`]);
      }
      return { ok: true };
    } catch (error) {
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