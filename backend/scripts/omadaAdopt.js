// ============================================================
// Oswagolink - TP-Link automatic adopt (automation step V2-3)
// Runs once a minute (started by server.js, only with the Open API key), then exits.
//
// For every access point a business registered (its MAC from the sticker) on a site that
// Oswagolink created, and that has not joined yet (or that the pinger saw waiting again):
//   1. connected in its site?           -> marked adopted
//   2. waiting in the controller, or waiting inside its own site
//                                       -> adopted into THAT business's site: first with the
//      factory login, then with the router's one-time setup login (shown in the business panel)
//   3. not seen yet                     -> nothing (the technician has not typed the Inform URL)
// An access point whose MAC no business registered is never adopted.
// Never prints a password.
// ============================================================
const db = require('../config/db');
const env = require('../config/env');
const { decrypt } = require('../utils/encryption');
const { call } = require('../services/routers/omadaOpenApi');
const omadaSites = require('../services/routers/omadaSites');
const { normalizeMac } = require('../utils/validators');

const MAX_PER_RUN = 5;          // adopting takes up to a minute each
const RETRY_AFTER_MINUTES = 3;  // after a failed try, wait before trying again

const listOf = (r) => (Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : []);

const run = async () => {
  if (!env.OMADA_OPENAPI_ENABLED) return;
  const { rows } = await db.query(
    `SELECT a.id, a.mac, a.adopted_at, r.id AS router_id, r.omada_site_id, r.omada_setup_password_encrypted
     FROM omada_aps a JOIN routers r ON r.id = a.router_id
     WHERE r.device_type = 'omada' AND r.omada_site_auto = true AND r.omada_site_id IS NOT NULL
       AND (a.adopted_at IS NULL OR a.status = 'pending')
       AND (a.adopt_tried_at IS NULL OR a.adopt_tried_at < NOW() - make_interval(mins => $1::int))
     ORDER BY a.adopt_tried_at NULLS FIRST, a.created_at
     LIMIT 50`,
    [RETRY_AFTER_MINUTES]
  );
  if (rows.length === 0) return;

  const pendingBySite = new Map();
  let tried = 0;
  for (const ap of rows) {
    if (tried >= MAX_PER_RUN) break;
    const mac = normalizeMac(ap.mac);
    const site = ap.omada_site_id;
    if (!mac) continue;
    try {
      // 1. Connected in its site (adopted, also by hand)?
      const devices = listOf(await call('GET', `v1/{id}/sites/${site}/devices?page=1&pageSize=200`));
      const inSite = devices.find((d) => d && normalizeMac(String(d.mac || '')) === mac) || null;
      if (inSite && inSite.status === omadaSites.CONNECTED) {
        await db.query("UPDATE omada_aps SET adopted_at = COALESCE(adopted_at, NOW()), adopt_error = NULL, status = 'online', status_at = NOW() WHERE id = $1", [ap.id]);
        if (!ap.adopted_at) console.log(`[Adopt] Access point ${mac} is connected in its site (router ${ap.router_id})`);
        continue;
      }
      // 2. Waiting to be adopted: in the controller's waiting list, or waiting inside its own site
      const waitingInSite = Boolean(inSite && inSite.status === 2);
      if (!waitingInSite) {
        if (!pendingBySite.has(site)) pendingBySite.set(site, await omadaSites.listPending(site));
        if (!pendingBySite.get(site).some((d) => d.mac === mac)) continue;
      }

      tried += 1;
      // Not adopted any more (also when it was marked adopted too early): the panel shows it waiting
      await db.query('UPDATE omada_aps SET adopt_tried_at = NOW(), adopted_at = NULL WHERE id = $1', [ap.id]);
      let result = await omadaSites.adopt(site, mac, null);
      if (result === 'wrong_login' && ap.omada_setup_password_encrypted) {
        const password = decrypt(ap.omada_setup_password_encrypted);
        if (password) result = await omadaSites.adopt(site, mac, { username: omadaSites.SETUP_USER, password });
      }
      if (result === 'adopted') {
        await db.query('UPDATE omada_aps SET adopted_at = NOW(), adopt_error = NULL WHERE id = $1', [ap.id]);
        console.log(`[Adopt] Access point ${mac} adopted into its site (router ${ap.router_id})`);
      } else {
        await db.query('UPDATE omada_aps SET adopt_error = $1 WHERE id = $2', [result, ap.id]);
        console.log(`[Adopt] Access point ${mac} not adopted yet (${result}), router ${ap.router_id}; trying again in ${RETRY_AFTER_MINUTES} minutes`);
      }
    } catch (err) {
      console.error(`[Adopt] Access point ${mac} (router ${ap.router_id}): ${err.message}`);
    }
  }
};

run()
  .catch((err) => console.error('[Adopt] error:', err.message))
  .finally(async () => {
    try {
      await db.pool.end();
    } catch (_) {
      // closing is best effort
    }
    process.exit(0);
  });
