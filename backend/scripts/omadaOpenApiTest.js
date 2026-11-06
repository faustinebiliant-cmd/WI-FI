// ============================================================
// Oswagolink - TP-Link Open API test tool (automation steps V2-0 to V2-4)
//
// Run on the VPS from the backend folder:
//   node scripts/omadaOpenApiTest.js check
//       Reads only: sites, access points, pending access points, portal,
//       allowed addresses, speed profiles, WiFi names. Changes nothing.
//   node scripts/omadaOpenApiTest.js trial-site
//       Creates a throw-away site "zz-oswagolink-trial", reads it back, deletes it.
//   node scripts/omadaOpenApiTest.js speed <PHONE-MAC> <down-Mbps> <up-Mbps>
//       Gives one connected phone its own speed on the Oswagolink site (the per-package
//       speed test). Example: speed A6:4E:3C:A5:6C:87 2 1
//   node scripts/omadaOpenApiTest.js speed-off <PHONE-MAC>
//       Removes that phone's own speed again.
//   node scripts/omadaOpenApiTest.js trial-full
//       V2-2/V2-4: builds a complete business site "zz-oswagolink-trial-full" exactly as the
//       backend does (WiFi, speed, portal, pre-login, operator), shows it next to the
//       Oswagolink site made by hand, then removes it again as Delete Router does.
//   node scripts/omadaOpenApiTest.js waiting
//       V2-3: access points waiting to be adopted, and whether a business registered them.
//   node scripts/omadaOpenApiTest.js wifi-probe
//       Shows the WiFi settings of the hand-made Oswagolink site (no passwords), then on a
//       throw-away site "zz-oswagolink-probe" tries creating the WiFi several ways (one
//       setting changed each time) to find which value the controller refuses; deletes it.
//
// Never prints the key, the access token or any password.
// ============================================================
const crypto = require('crypto');
const env = require('../config/env');
const { call } = require('../services/routers/omadaOpenApi');
const { normalizeMac } = require('../utils/validators');
const db = require('../config/db');
const omadaSites = require('../services/routers/omadaSites');

const TRIAL_NAME = 'zz-oswagolink-trial';
const SITE_NAME = 'Oswagolink';

const STATUS = { 0: 'offline', 1: 'online', 2: 'pending (waiting to be adopted)', 3: 'heartbeat missed', 4: 'isolated' };
const ok = (msg) => console.log(`OK    ${msg}`);
const bad = (msg) => console.log(`FAIL  ${msg}`);

const step = async (label, fn) => {
  try {
    const out = await fn();
    ok(label + (out ? `: ${out}` : ''));
    return true;
  } catch (err) {
    bad(`${label}: ${err.message}`);
    return false;
  }
};

const listSites = async () => {
  const r = await call('GET', 'v1/{id}/sites?page=1&pageSize=100');
  return Array.isArray(r && r.data) ? r.data : [];
};

const findSite = async (name) => (await listSites()).find((s) => s.name === name);

const check = async () => {
  let site = null;
  await step('Key accepted, site list', async () => {
    const sites = await listSites();
    site = sites.find((s) => s.name === SITE_NAME) || null;
    return `${sites.length} site(s): ${sites.map((s) => `${s.name} (${s.siteId})`).join(', ')}`;
  });
  if (!site) {
    bad(`site "${SITE_NAME}" not found, stopping`);
    return;
  }
  const S = `v1/{id}/sites/${site.siteId}`;
  await step('Site settings (copied when creating sites)', async () => {
    const info = await call('GET', S);
    return `region "${info.region}", time zone "${info.timeZone}", scenario "${info.scenario}"`;
  });
  await step('Access points', async () => {
    const r = await call('GET', `${S}/devices?page=1&pageSize=100`);
    const list = Array.isArray(r && r.data) ? r.data : [];
    return list.length === 0
      ? 'none'
      : list.map((d) => `${d.mac} ${d.model || d.modelName || ''} ${STATUS[d.status] || 'status ' + d.status} firmware ${d.firmwareVersion || '?'}`).join('; ');
  });
  await step('Pending access points (waiting to be adopted)', async () => {
    const r = await call('GET', `${S}/grid/devices/pending?page=1&pageSize=100`);
    const list = Array.isArray(r && r.data) ? r.data : [];
    return list.length === 0 ? 'none' : list.map((d) => `${d.mac} ${d.model || ''}`).join('; ');
  });
  await step('Portal', async () => {
    const r = await call('GET', `${S}/portals`);
    const list = Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : [];
    return list.map((p) => `"${p.name}" ${p.enable ? 'on' : 'off'} type ${p.authType} on ${(p.ssidList || []).length} WiFi`).join('; ') || 'none';
  });
  await step('Allowed before login (pre-auth)', async () => {
    const r = await call('GET', `${S}/setting/access-control`);
    const list = (r && r.preAuthAccessPolicies) || [];
    return `${r && r.preAuthAccessEnable ? 'on' : 'off'}: ${list.map((p) => (p.ip ? `${p.ip}/${p.subnetMask}` : p.url)).join(', ') || 'nothing'}`;
  });
  await step('Speed profiles', async () => {
    const r = await call('GET', `v1/{id}/hotspot/sites/${site.siteId}/setting/profiles/rateLimits`);
    const list = Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : [];
    return list.map((p) => `"${p.name}" down ${p.downLimitEnable ? p.downLimit : 'no limit'} up ${p.upLimitEnable ? p.upLimit : 'no limit'}`).join('; ') || 'none';
  });
  await step('WiFi names', async () => {
    const r = await call('GET', `v2/{id}/sites/${site.siteId}/wireless-network/ssids?page=1&pageSize=100`);
    const list = Array.isArray(r && r.data) ? r.data : [];
    return list.map((w) => `"${w.name}"`).join(', ') || 'none';
  });
};

// A strong one-time password for the trial site's device account (never printed).
// TP-Link's rule: 10-64 characters with upper, lower, number and symbol, and never the
// same character twice in a row.
const strongPassword = () => {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#$%&*@^'];
  const out = [];
  for (let i = 0; i < 24; i++) {
    const set = sets[i % sets.length]; // rotating sets: every kind present, neighbours always differ
    out.push(set[crypto.randomInt(set.length)]);
  }
  return out.join('');
};

const trialSite = async () => {
  const model = await findSite(SITE_NAME);
  if (!model) return bad(`site "${SITE_NAME}" not found`);
  if (await findSite(TRIAL_NAME)) return bad(`"${TRIAL_NAME}" already exists: delete it in the controller first`);
  const info = await call('GET', `v1/{id}/sites/${model.siteId}`);
  let created = null;
  const made = await step('Create trial site', async () => {
    const r = await call('POST', 'v1/{id}/sites', {
      name: TRIAL_NAME,
      type: 0,
      region: info.region,
      timeZone: info.timeZone,
      scenario: info.scenario,
      deviceAccountSetting: { username: 'eap-admin', password: strongPassword() },
      supportES: false,
      supportL2: false
    });
    created = (r && (r.siteId || r.id)) || null;
    if (!created) {
      const found = await findSite(TRIAL_NAME);
      created = found ? found.siteId : null;
    }
    return created ? `site ID ${created}` : 'created, but no ID returned';
  });
  if (!made || !created) return;
  await step('Read trial site back', async () => {
    const r = await call('GET', `v1/{id}/sites/${created}`);
    return `"${r.name}"`;
  });
  await step('Delete trial site', async () => {
    await call('DELETE', `v1/{id}/sites/${created}`);
    return (await findSite(TRIAL_NAME)) ? 'still listed!' : 'gone';
  });
};

const speed = async (macArg, downArg, upArg, off) => {
  const mac = normalizeMac(macArg || '');
  if (!mac) return bad('give the phone MAC, like A6:4E:3C:A5:6C:87');
  const down = Number(downArg);
  const up = Number(upArg);
  if (!off && (!Number.isInteger(down) || !Number.isInteger(up) || down < 1 || up < 1 || down > 1000 || up > 1000)) {
    return bad('give whole Mbps numbers 1-1000, like: speed A6:4E:3C:A5:6C:87 2 1');
  }
  const site = await findSite(SITE_NAME);
  if (!site) return bad(`site "${SITE_NAME}" not found`);
  const dashed = mac.replace(/:/g, '-');
  const path = `v1/{id}/sites/${site.siteId}/clients/${dashed}`;
  await step(off ? 'Remove phone speed' : `Set phone speed ${down} Mbps down / ${up} Mbps up`, async () => {
    await call('PATCH', `${path}/ratelimit`, off
      ? { mode: 0, customRateLimit: { upEnable: false, downEnable: false } }
      : { mode: 0, customRateLimit: { upEnable: true, upUnit: 2, upLimit: up, downEnable: true, downUnit: 2, downLimit: down } });
    return '';
  });
  await step('Controller now shows for this phone', async () => {
    const c = await call('GET', path);
    const rl = (c && c.rateLimit) || {};
    const unit = (u) => (u === 1 ? 'Kbps' : 'Mbps');
    return `connected to "${c.ssid || '?'}", limit ${rl.downEnable ? rl.downLimit + ' ' + unit(rl.downUnit) : 'none'} down / ${rl.upEnable ? rl.upLimit + ' ' + unit(rl.upUnit) : 'none'} up`;
  });
};

// ------------------------------------------------------------
// trial-full: the complete automatic site, compared with the hand-made one
// ------------------------------------------------------------
const FULL_NAME = 'zz-oswagolink-trial-full';
const listOf = (r) => (Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : []);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

// Only settings, never passwords
const describeSite = async (siteId) => {
  const S = `v1/{id}/sites/${siteId}`;
  const out = {};
  const ssids = listOf(await call('GET', `v2/{id}/sites/${siteId}/wireless-network/ssids?page=1&pageSize=100`));
  out.wifi = ssids.map((w) => ({
    ...pick(w, ['name', 'band', 'security', 'guestNetEnable', 'broadcast', 'pmfMode', 'vlanEnable']),
    ...Object.fromEntries(Object.entries(w).filter(([k]) => /rate/i.test(k)))
  }));
  out.portal = listOf(await call('GET', `${S}/portals`)).map((x) => ({
    ...pick(x, ['name', 'enable', 'authType', 'authTimeout', 'httpsRedirectEnable', 'landingPage', 'externalPortal']),
    wifiCount: (x.ssidList || []).length
  }));
  const ac = await call('GET', `${S}/setting/access-control`);
  out.preLogin = {
    on: Boolean(ac && ac.preAuthAccessEnable),
    allowed: ((ac && ac.preAuthAccessPolicies) || []).map((x) => (x.ip ? `${x.ip}/${x.subnetMask}` : x.url))
  };
  const ops = listOf(await call('GET', `${S}/hotspot/operators?page=1&pageSize=100`));
  const op = ops.find((o) => o && o.name === env.OMADA_OPERATOR_USER);
  out.operatorHasSite = Boolean(op && Array.isArray(op.selectedSites) && op.selectedSites.includes(siteId));
  return out;
};

const trialFull = async () => {
  const model = await findSite(SITE_NAME);
  if (!model) return bad(`site "${SITE_NAME}" not found`);
  if (await findSite(FULL_NAME)) return bad(`"${FULL_NAME}" already exists: delete it in the controller first`);
  let site = null;
  const made = await step('Create complete trial site (as Add Router does)', async () => {
    try {
      site = await omadaSites.createBusinessSite({ label: FULL_NAME, wifiName: 'zz Oswagolink Trial', speedKbps: 2048 });
    } catch (err) {
      throw new Error(`failed at step "${err.stage}": ${err.message} (the half-made site was removed)`);
    }
    return `site ID ${site.siteId}`;
  });
  if (!made) return;
  await step('Hand-made site Oswagolink', async () => JSON.stringify(await describeSite(model.siteId)));
  await step('Automatic trial site     ', async () => JSON.stringify(await describeSite(site.siteId)));
  await step('Remove trial site (as Delete Router does)', async () => {
    await omadaSites.deleteBusinessSite(site.siteId, []);
    return (await findSite(FULL_NAME)) ? 'still listed!' : 'gone';
  });
  await step('Operator no longer has the trial site', async () => {
    const ops = listOf(await call('GET', `v1/{id}/sites/${model.siteId}/hotspot/operators?page=1&pageSize=100`));
    const op = ops.find((o) => o && o.name === env.OMADA_OPERATOR_USER);
    if (!op) throw new Error('operator not found');
    return (op.selectedSites || []).includes(site.siteId) ? 'still has it!' : `yes (${(op.selectedSites || []).length} site(s) left)`;
  });
};

const waiting = async () => {
  const model = await findSite(SITE_NAME);
  if (!model) return bad(`site "${SITE_NAME}" not found`);
  await step('Access points waiting to be adopted', async () => {
    const list = await omadaSites.listPending(model.siteId);
    if (list.length === 0) return 'none';
    const { rows } = await db.query('SELECT mac FROM omada_aps WHERE mac = ANY($1::varchar[])', [list.map((d) => d.mac)]);
    const known = new Set(rows.map((r) => r.mac));
    return list.map((d) => `${d.mac} ${d.model} ${known.has(d.mac) ? '(registered by a business)' : '(no business registered it: never adopted)'}`).join('; ');
  });
  await step('Inform URL for technicians', async () => omadaSites.informUrl());
};

// ------------------------------------------------------------
// wifi-probe: which WiFi setting does the controller refuse?
// ------------------------------------------------------------
const PROBE_NAME = 'zz-oswagolink-probe';
const SECRET_KEY = /^(psk|ppsk|ent)Setting$|pass|secret|radius|key/i;

const wifiProbe = async () => {
  const model = await findSite(SITE_NAME);
  if (!model) return bad(`site "${SITE_NAME}" not found`);
  if (await findSite(PROBE_NAME)) return bad(`"${PROBE_NAME}" already exists: delete it in the controller first`);

  let modelWifi = null;
  await step('Hand-made WiFi settings (no passwords)', async () => {
    const list = listOf(await call('GET', `v2/{id}/sites/${model.siteId}/wireless-network/ssids?page=1&pageSize=100`));
    if (list.length === 0) return 'no WiFi on the hand-made site';
    modelWifi = Object.fromEntries(Object.entries(list[0]).filter(([k]) => !SECRET_KEY.test(k)));
    return JSON.stringify(modelWifi);
  });

  const info = await call('GET', `v1/{id}/sites/${model.siteId}`);
  let siteId = null;
  const made = await step('Create probe site', async () => {
    const r = await call('POST', 'v1/{id}/sites', {
      name: PROBE_NAME, type: 0, region: info.region, timeZone: info.timeZone, scenario: info.scenario,
      deviceAccountSetting: { username: 'eap-admin', password: strongPassword() }, supportES: false, supportL2: false
    });
    siteId = (r && (r.siteId || r.id)) || ((await findSite(PROBE_NAME)) || {}).siteId || null;
    return siteId ? `site ID ${siteId}` : 'created, but no ID returned';
  });
  if (!made || !siteId) return;

  const base = {
    deviceType: 1, band: 3, guestNetEnable: true, security: 0, broadcast: true, vlanEnable: false,
    mloEnable: false, pmfMode: 3, enable11r: false, hidePwd: false
  };
  const tries = [
    ['as Add Router sends it', {}],
    ['ssidEnable true', { ssidEnable: true }],
    ['ssidEnable true + chooseDevices 0', { ssidEnable: true, chooseDevices: 0 }],
    ['pmfMode 2', { pmfMode: 2 }],
    ['pmfMode 1', { pmfMode: 1 }],
    ['guestNetEnable false', { guestNetEnable: false }],
    ['band 1 (2.4 GHz only)', { band: 1 }],
    ['deviceType 3', { deviceType: 3 }],
    ['all extras off', { ssidEnable: true, chooseDevices: 0, prohibitWifiShare: false, wifiCallingEnable: false, greEnable: false, enhancedIotConnectivity: false }]
  ];
  if (modelWifi) {
    const copy = {};
    for (const k of Object.keys(base).concat(['ssidEnable', 'chooseDevices', 'prohibitWifiShare', 'wifiCallingEnable', 'enhancedIotConnectivity'])) {
      if (modelWifi[k] !== undefined && typeof modelWifi[k] !== 'object') copy[k] = modelWifi[k];
    }
    tries.push(['copy of the hand-made WiFi values', copy]);
  }
  let n = 0;
  for (const [label, change] of tries) {
    n += 1;
    await step(`WiFi try ${n}: ${label}`, async () => {
      const r = await call('POST', `v2/{id}/sites/${siteId}/wireless-network/ssids`, { ...base, ...change, name: `zz probe ${n}` });
      return `accepted${r && r.id ? ' (id returned)' : ' (no id returned)'}`;
    });
  }
  await step('Delete probe site', async () => {
    await call('DELETE', `v1/{id}/sites/${siteId}`);
    return (await findSite(PROBE_NAME)) ? 'still listed!' : 'gone';
  });
};

(async () => {
  if (!env.OMADA_OPENAPI_ENABLED) {
    bad('OMADA_OPENAPI_CLIENT_ID and OMADA_OPENAPI_CLIENT_SECRET are not in .env');
    process.exit(1);
  }
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    if (cmd === 'check') await check();
    else if (cmd === 'trial-site') await trialSite();
    else if (cmd === 'speed') await speed(a, b, c, false);
    else if (cmd === 'speed-off') await speed(a, null, null, true);
    else if (cmd === 'trial-full') await trialFull();
    else if (cmd === 'waiting') await waiting();
    else if (cmd === 'wifi-probe') await wifiProbe();
    else console.log('Use: check | trial-site | trial-full | waiting | wifi-probe | speed <PHONE-MAC> <down-Mbps> <up-Mbps> | speed-off <PHONE-MAC>');
  } catch (err) {
    bad(err.message);
  }
  process.exit(0);
})();
