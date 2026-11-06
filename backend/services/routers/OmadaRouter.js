// ============================================================
// Oswagolink - TP-Link (Omada) router
//
// A "router" of type omada is one business site in the Omada controller on this VPS,
// with one or more TP-Link access points (EAPs). It offers the same jobs as
// MikroTikRouter, so the cleaner, disconnect, revoke and package delete work for both:
//
//   authorizeClient(...)  let a phone in for N minutes (instead of createVoucher)
//   removeVoucher(code)   cut off every phone that used this voucher on this router
//   getActiveUsers()      phones that are let in right now
//   disconnectUser(mac)   cut one phone off
//   checkStatus()         is the controller answering for this site? (+ each access point's status)
//
// Not available for TP-Link: createVoucher (MikroTik only), setStaffDoorOpen.
// Speeds: with the Open API key, each phone gets its package's speed (0 = the business
// WiFi speed set on the controller site). Without the key, the business WiFi speed only.
// ============================================================
const db = require('../../config/db');
const env = require('../../config/env');
const omada = require('./omadaClient');
const openApi = require('./omadaOpenApi');
const { normalizeMac, isValidOmadaSiteId, isValidSsidName, isValidRadioId } = require('../../utils/validators');

const MAX_MINUTES = 366 * 24 * 60; // a year: longer than any package

class OmadaRouter {
  constructor(routerRecord) {
    this.routerId = routerRecord && routerRecord.id;
    this.tenantId = routerRecord && routerRecord.tenant_id;
    this.site = routerRecord && routerRecord.omada_site_id;
    if (!isValidOmadaSiteId(this.site)) {
      throw new Error('This TP-Link router has no controller site yet');
    }
  }

  // Let one phone in for `minutes`. Any older approval of the same phone is cut first,
  // so the time is exactly the voucher's remaining time.
  // speedDownKbps / speedUpKbps: the package speed (0 = the business WiFi speed).
  async authorizeClient({ clientMac, apMac, ssidName, radioId, minutes, speedDownKbps = 0, speedUpKbps = 0 }) {
    const client = normalizeMac(clientMac);
    const ap = normalizeMac(apMac);
    const mins = Number(minutes);
    if (!client || !ap || !isValidSsidName(ssidName) || !isValidRadioId(radioId) ||
        !Number.isInteger(mins) || mins < 1 || mins > MAX_MINUTES) {
      return { ok: false, error: 'invalid values' };
    }
    try {
      await omada.cutMac(this.site, client);
      // The speed is set BEFORE the phone is let in, so it never has a moment at full speed.
      // The controller keeps a phone's speed, so it is set (or removed) on every voucher.
      // If only the speed fails, the phone still gets in at the business WiFi speed: the
      // customer paid and must not be refused because of the speed.
      if (env.OMADA_OPENAPI_ENABLED) {
        try {
          await openApi.setClientSpeed(this.site, client, speedDownKbps, speedUpKbps);
        } catch (err) {
          console.error(`[Omada] Could not set the package speed on router ${this.routerId} (the business WiFi speed applies): ${err.message}`);
        }
      }
      await omada.authorize({ site: this.site, clientMac: client, apMac: ap, ssidName, radioId: Number(radioId), minutes: mins });
      return { ok: true };
    } catch (err) {
      console.error(`[Omada] Could not let a phone in on router ${this.routerId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  // MikroTik creates a user per voucher; TP-Link lets phones in instead (authorizeClient)
  async createVoucher() {
    return { ok: false, error: 'not used for TP-Link routers' };
  }

  // Cut off every phone that used this voucher on this router (the controller only
  // knows phones, not voucher codes, so the phones come from our own sessions)
  async removeVoucher(code) {
    try {
      const { rows } = await db.query(
        `SELECT DISTINCT s.mac_address
         FROM sessions s JOIN vouchers v ON v.id = s.voucher_id
         WHERE v.code = $1 AND v.tenant_id = $2 AND s.router_id = $3`,
        [String(code), this.tenantId, this.routerId]
      );
      for (const row of rows) {
        const mac = normalizeMac(row.mac_address);
        if (mac) await omada.cutMac(this.site, mac);
      }
      return { ok: true };
    } catch (err) {
      console.error(`[Omada] Could not cut off a voucher's phones on router ${this.routerId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  // Phones let in right now. The controller does not know voucher codes (voucherCode ''),
  // so the cleaner only closes sessions of phones that are no longer let in.
  async getActiveUsers() {
    const valid = await omada.listValid(this.site);
    return valid.map((c) => ({ mac: c.mac, ip: c.ip, voucherCode: '' }));
  }

  async disconnectUser(macAddress) {
    const mac = normalizeMac(macAddress);
    if (!mac) return { ok: false, error: 'invalid MAC' };
    try {
      await omada.cutMac(this.site, mac);
      return { ok: true };
    } catch (err) {
      console.error(`[Omada] Could not disconnect a phone on router ${this.routerId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async setStaffDoorOpen() {
    return { ok: false, error: 'There is no staff door on a TP-Link router' };
  }

  // "online" means the controller answers for this site (the router can be used).
  // With the Open API key, also the status of each access point: aps = [{ mac, status }]
  // (the pinger saves it; an access point missing from the site is 'not_found').
  async checkStatus() {
    if (!env.OMADA_OPENAPI_ENABLED) {
      await omada.ping(this.site);
      return { online: true, version: 'omada' };
    }
    const devices = await openApi.listSiteDevices(this.site);
    const byMac = new Map(devices.map((d) => [d.mac, d.status]));
    const { rows } = await db.query('SELECT mac FROM omada_aps WHERE router_id = $1', [this.routerId]);
    const aps = rows.map((r) => ({ mac: r.mac, status: byMac.get(r.mac) || 'not_found' }));
    return { online: true, version: 'omada', aps };
  }
}

module.exports = OmadaRouter;
