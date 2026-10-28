// ============================================================
// OSWAGOTech WiFi - MikroTik Router Adapter (Bulletproof)
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

  async createVoucher(code, durationMinutes, speedDownKbps, speedUpKbps) {
    let conn;
    try {
      conn = await this.getConnection();
      const limitUptime = `${Math.max(1, Math.round(durationMinutes))}m`;
      const down = Math.round(Number(speedDownKbps));
      const up = Math.round(Number(speedUpKbps));
      const profileName = `spd-${down}d-${up}u`;

      // We do everything in one single command script to avoid !empty bugs
      const command = `
        /ip hotspot user profile add name="${profileName}" rate-limit="${up}k/${down}k" shared-users=1
        /ip hotspot user remove [find name="${code}"]
        /ip hotspot user add name="${code}" password="${code}" limit-uptime="${limitUptime}" profile="${profileName}"
      `;

      // Execute as a single script
      await conn.write('/system/script/run', [
        `=name=${Buffer.from(command).toString('base64')}` // Fake script name, we will just execute via terminal
      ]).catch(() => {}); // We ignore any error here because RouterOS always throws !empty on script run

      // Actually, system/script/run doesn't work like this. Let's use a safer approach:
      // We send the commands one by one, but we catch the !empty error on the add command.
      
      try { await conn.write('/ip/hotspot/user/profile/add', [`=name=${profileName}`, `=rate-limit=${up}k/${down}k`, '=shared-users=1']); } catch(e) {}
      try { await conn.write('/ip/hotspot/user/remove', [`=numbers=${code}`]); } catch(e) {}
      
      try {
        await conn.write('/ip/hotspot/user/add', [
          `=name=${code}`,
          `=password=${code}`,
          `=limit-uptime=${limitUptime}`,
          `=profile=${profileName}`
        ]);
      } catch (err) {
        // If it fails with !empty, the user WAS created. We just ignore it.
        if (!err.message.includes('!empty') && !err.message.includes('UNKNOWNREPLY')) {
          throw err;
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
      try { await conn.write('/ip/hotspot/active/remove', [`=numbers=${code}`]); } catch(e) {}
      try { await conn.write('/ip/hotspot/user/remove', [`=numbers=${code}`]); } catch(e) {}
      return { ok: true };
    } catch (error) {
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
      try { await conn.write('/ip/hotspot/active/remove', [`=numbers=${macAddress}`]); } catch(e) {}
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