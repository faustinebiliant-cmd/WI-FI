// ============================================================
// OSWAGOTech WiFi - MikroTik Router Adapter
// Works with ANY client router. Nothing here is specific to one
// router: everything comes from the router record in the database
// (ip_address, api_port, api_username, api_password_encrypted).
// ============================================================
const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { decrypt } = require('../../utils/encryption');

// ------------------------------------------------------------
// PROTECTION AGAINST "!empty"
// RouterOS 7.18+ answers a search that finds nothing with "!empty".
// The node-routeros library throws that as an error.
// We catch it locally here and return an empty list instead.
// Real errors (timeouts, auth failures) still fail normally.
// ------------------------------------------------------------
const isEmptyReply = (err) => {
  const message = String(err?.message || err || '');
  return (
    err?.errno === 'UNKNOWNREPLY' &&
    /unknown reply.*!empty\b/i.test(message)
  );
};

const safePrint = async (conn, path, query = []) => {
  try {
    const rows = await conn.write(path, query);
    return rows ?? [];
  } catch (err) {
    if (isEmptyReply(err)) {
      return []; // Treat the specific blank reply as an empty list
    }
    throw err; // Let real errors fail normally
  }
};

// ------------------------------------------------------------
// Input checks (a bad value must never reach the router)
// ------------------------------------------------------------
const MAX_SPEED_KBPS = 1000000;

const cleanCode = (code) => {
  const value = String(code || '');
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(value)) throw new Error('Invalid voucher code');
  return value;
};

const cleanMac = (mac) => {
  const value = String(mac || '');
  if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(value)) throw new Error('Invalid MAC address');
  return value;
};

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

  async getConnection() {
    const conn = new RouterOSAPI({
      host: this.ip,
      user: this.username,
      password: this.password,
      port: this.port,
      timeout: 5 // seconds
    });
    // A dropped connection must never crash the server
    if (typeof conn.on === 'function') {
      conn.on('error', (e) => console.error('[MikroTik] connection error:', e && e.message ? e.message : e));
    }
    await conn.connect();
    return conn;
  }

  // Runs one step on its own short, clean connection
  async _step(work) {
    let conn;
    try {
      conn = await this.getConnection();
      return await work(conn);
    } finally {
      if (conn) {
        try {
          const closing = conn.close();
          if (closing && typeof closing.catch === 'function') closing.catch(() => {});
        } catch (e) { /* ignore */ }
      }
    }
  }

  // Makes sure a speed profile exists on THIS router and returns its name
  async ensureSpeedProfile(downKbps, upKbps) {
    const down = Math.round(Number(downKbps));
    const up = Math.round(Number(upKbps));
    if (!Number.isInteger(down) || !Number.isInteger(up) ||
        down < 1 || up < 1 || down > MAX_SPEED_KBPS || up > MAX_SPEED_KBPS) {
      throw new Error('Invalid speed');
    }

    const name = `spd-${down}d-${up}u`;

    const profiles = await this._step((conn) =>
      safePrint(conn, '/ip/hotspot/user/profile/print', ['=.proplist=name'])
    );

    if (!profiles.some((p) => p.name === name)) {
      try {
        await this._step((conn) =>
          conn.write('/ip/hotspot/user/profile/add', [
            `=name=${name}`,
            `=rate-limit=${up}k/${down}k`, // upload/download, from the customer's side
            '=shared-users=1'
          ])
        );
      } catch (err) {
        // Two customers at the same moment: the other one created it first, that is fine
        if (!/already|exist|same name/i.test(String(err.message))) throw err;
      }
    }
    return name;
  }

  /**
   * Creates a hotspot user for a voucher. Safe to call twice:
   * if the router already has the user, its used time is kept.
   */
  async createVoucher(code, durationMinutes, speedDownKbps, speedUpKbps) {
    try {
      const voucher = cleanCode(code);
      const minutes = Math.max(1, Math.round(Number(durationMinutes)));
      if (!Number.isFinite(minutes)) throw new Error('Invalid duration');

      const profile = await this.ensureSpeedProfile(speedDownKbps, speedUpKbps);

      const users = await this._step((conn) =>
        safePrint(conn, '/ip/hotspot/user/print', ['=.proplist=.id,name'])
      );
      const existing = users.find((u) => u.name === voucher);

      if (existing) {
        // The router kept the user: only make sure the speed is right
        await this._step((conn) =>
          conn.write('/ip/hotspot/user/set', [
            `=.id=${existing['.id']}`,
            `=profile=${profile}`
          ])
        );
      } else {
        await this._step((conn) =>
          conn.write('/ip/hotspot/user/add', [
            `=name=${voucher}`,
            `=password=${voucher}`, // the password is the same as the code
            `=limit-uptime=${minutes}m`,
            `=profile=${profile}`
          ])
        );
      }

      return { ok: true, expiresAt: new Date(Date.now() + minutes * 60000) };
    } catch (error) {
      console.error('[MikroTik] Failed to create voucher:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Kicks the guest off and deletes the voucher user from the router.
   * Safe to call when the user does not exist any more.
   */
  async removeVoucher(code) {
    try {
      const voucher = cleanCode(code);

      // 1. Disconnect running sessions of this voucher
      const active = await this._step((conn) =>
        safePrint(conn, '/ip/hotspot/active/print', ['=.proplist=.id', `?user=${voucher}`])
      );
      for (const session of active) {
        await this._step((conn) =>
          conn.write('/ip/hotspot/active/remove', [`=.id=${session['.id']}`])
        );
      }

      // 2. Delete the hotspot user
      const users = await this._step((conn) =>
        safePrint(conn, '/ip/hotspot/user/print', ['=.proplist=.id,name'])
      );
      for (const user of users.filter((u) => u.name === voucher)) {
        await this._step((conn) =>
          conn.write('/ip/hotspot/user/remove', [`=.id=${user['.id']}`])
        );
      }

      return { ok: true };
    } catch (error) {
      console.error('[MikroTik] Failed to remove voucher:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Guests that are online right now (empty list if none, or if the router cannot be reached).
   */
  async getActiveUsers() {
    try {
      const active = await this._step((conn) =>
        safePrint(conn, '/ip/hotspot/active/print')
      );
      return active.map((user) => ({
        mac: user['mac-address'],
        ip: user.address,
        voucherCode: user.user,
        uptime: user.uptime,
        expiresAt: null
      }));
    } catch (error) {
      console.error('[MikroTik] Failed to fetch active users:', error.message);
      return [];
    }
  }

  /**
   * Kicks a device off the WiFi by its MAC address.
   */
  async disconnectUser(macAddress) {
    try {
      const mac = cleanMac(macAddress);
      const active = await this._step((conn) =>
        safePrint(conn, '/ip/hotspot/active/print', ['=.proplist=.id', `?mac-address=${mac}`])
      );
      for (const session of active) {
        await this._step((conn) =>
          conn.write('/ip/hotspot/active/remove', [`=.id=${session['.id']}`])
        );
      }
      return { ok: true };
    } catch (error) {
      console.error('[MikroTik] Failed to disconnect device:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Checks whether the router is reachable.
   */
  async checkStatus() {
    try {
      const sysInfo = await this._step((conn) => conn.write('/system/resource/print'));
      return { online: true, version: (sysInfo[0] && sysInfo[0].version) || 'Unknown' };
    } catch (error) {
      return { online: false, error: error.message };
    }
  }
}

module.exports = MikroTikRouter;