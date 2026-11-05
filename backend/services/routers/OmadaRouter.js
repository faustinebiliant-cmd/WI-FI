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
//   checkStatus()         is the controller answering for this site?
//
// Not available for TP-Link: createVoucher (MikroTik only), setStaffDoorOpen.
// One speed per business (set on the site in the controller), so speeds are ignored here.
// ============================================================
const db = require('../../config/db');
const omada = require('./omadaClient');
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
  async authorizeClient({ clientMac, apMac, ssidName, radioId, minutes }) {
    const client = normalizeMac(clientMac);
    const ap = normalizeMac(apMac);
    const mins = Number(minutes);
    if (!client || !ap || !isValidSsidName(ssidName) || !isValidRadioId(radioId) ||
        !Number.isInteger(mins) || mins < 1 || mins > MAX_MINUTES) {
      return { ok: false, error: 'invalid values' };
    }
    try {
      await omada.cutMac(this.site, client);
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

  // Version 1: "online" means the controller answers for this site. (Whether the EAP
  // itself is online comes with the read-only Open API key, Phase C step C0.)
  async checkStatus() {
    await omada.ping(this.site);
    return { online: true, version: 'omada' };
  }
}

module.exports = OmadaRouter;
