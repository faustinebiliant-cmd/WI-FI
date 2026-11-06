// ============================================================
// Oswagolink - TP-Link Open API test tool (step V2-0 of the automation plan)
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
//
// Never prints the key, the access token or any password.
// ============================================================
const crypto = require('crypto');
const env = require('../config/env');
const { call } = require('../services/routers/omadaOpenApi');
const { normalizeMac } = require('../utils/validators');

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
    else console.log('Use: check | trial-site | speed <PHONE-MAC> <down-Mbps> <up-Mbps> | speed-off <PHONE-MAC>');
  } catch (err) {
    bad(err.message);
  }
  process.exit(0);
})();
