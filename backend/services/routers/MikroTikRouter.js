// ============================================================
// OSWAGOTech WiFi - MikroTik Router Adapter
// ============================================================
const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { decrypt } = require('../../utils/encryption');

// A print that returns [] instead of throwing when RouterOS answers "!empty"
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

  // Creates (or reuses) a profile that carries the speed
  async ensureSpeedProfile(conn, downKbps, upKbps) {
    const down = Math.round(Number(downKbps));
    const up = Math.round(Number(upKbps));
    if (!Number.isInteger(down) || !Number.isInteger(up) ||
        down < 1 || up < 1 || down > 102400 || up > 102400) {
      throw new Error('Invalid speed');
    }
    const name = `spd-${down}d-${up}u`;
    const found = await safePrint(conn, '/ip/hotspot/user/profile/print', [`?name=${name}`]);
    if (found.length === 0) {
      try {
        await conn.write('/ip/hotspot/user/profile/add', [
          `=name=${name}`,
          `=rate-limit=${up}k/${down}k`, // upload/download, from the customer's side
          '=shared-users=1',
        ]);
      } catch (e) {
        if (!/already have/i.test(String(e.message))) throw e; // two vouchers at once
      }
    }
    return name;
  }

  // Safe to call twice: an existing router user is kept, not duplicated
  async createVoucher(code, durationMinutes, speedDownKbps, speedUpKbps) {
    let conn;
    try {
      conn = await this.getConnection();
      const limitUptime = `${Math.max(1, Math.round(durationMinutes))}m`;
      const profile = await this.ensureSpeedProfile(conn, speedDownKbps, speedUpKbps);

      const existing = await safePrint(conn, '/ip/hotspot/user/print', [`?name=${code}`]);
      if (existing.length > 0) {
        // Router kept the user (and its used time): only make sure the speed is right
        await conn.write('/ip/hotspot/user/set', [
          `=.id=${existing[0]['.id']}`,
          `=profile=${profile}`,
        ]);
      } else {
        await conn.write('/ip/hotspot/user/add', [
          `=name=${code}`,
          `=password=${code}`,
          `=limit-uptime=${limitUptime}`,
          `=profile=${profile}`,
        ]);
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
      const active = await safePrint(conn, '/ip/hotspot/active/print', [
        `?mac-address=${macAddress}`
      ]);
      for (const a of active) {
        await conn.write('/ip/hotspot/active/remove', [`=.id=${a['.id']}`]);
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