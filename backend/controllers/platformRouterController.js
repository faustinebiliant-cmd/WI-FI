const db = require('../config/db');
const env = require('../config/env');
const { isValidUUID, isValidOmadaSiteId } = require('../utils/validators');
const omadaSites = require('../services/routers/omadaSites');

const listAllRouters = async (req, res) => {
  try {
    // Only what the page shows. Tokens and passwords never go to the browser.
    // TP-Link routers also show their access points and their controller site ID
    // (not secret: it is in every customer's portal link).
    const { rows } = await db.query(`
      SELECT r.id, r.name, r.location_label, r.status, r.last_seen_at, r.created_at,
             r.device_type, r.omada_site_id, r.omada_site_auto AS site_auto, r.omada_wifi_name AS wifi_name,
             COALESCE(
               (SELECT json_agg(a.mac ORDER BY a.created_at) FROM omada_aps a WHERE a.router_id = r.id),
               '[]'::json
             ) AS ap_macs,
             COALESCE(
               (SELECT json_agg(json_build_object('mac', a.mac, 'status', a.status, 'status_at', a.status_at,
                                                  'adopted', a.adopted_at IS NOT NULL, 'adopt_error', a.adopt_error) ORDER BY a.created_at)
                FROM omada_aps a WHERE a.router_id = r.id),
               '[]'::json
             ) AS aps,
             t.business_name as tenant_name
      FROM routers r
      JOIN tenants t ON r.tenant_id = t.id
      ORDER BY r.created_at DESC
    `);

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('List all routers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list routers' });
  }
};

// PATCH /api/platform/routers/:id/omada-site   { site_id }
// After creating the business's site in the Omada controller, the admin saves its
// site ID here. From then on, customers on that site's access points can use the
// router's vouchers. Written in the Audit Logs.
const setOmadaSite = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(String(id))) return res.status(404).json({ success: false, error: 'Router not found' });

    const siteId = String((req.body && req.body.site_id) || '').trim().toLowerCase();
    if (!isValidOmadaSiteId(siteId)) {
      return res.status(400).json({ success: false, error: 'Site ID: the 24 letters/numbers of the site, from the controller (site=... in a portal link).' });
    }

    const result = await db.transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE routers r SET omada_site_id = $1
         FROM tenants t
         WHERE r.id = $2 AND r.device_type = 'omada' AND r.omada_site_auto = false AND t.id = r.tenant_id
         RETURNING r.id, r.name, r.omada_site_id, t.business_name`,
        [siteId, id]
      );
      if (rows.length === 0) return null;
      await client.query(
        `INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details)
         VALUES ($1, $2, 'set_omada_site', 'router', $3, $4, $5)`,
        [req.admin.id, req.admin.email, id, `${rows[0].business_name}: ${rows[0].name}`, JSON.stringify({ site_id: siteId })]
      );
      return rows[0];
    });
    if (!result) return res.status(404).json({ success: false, error: 'TP-Link router not found' });

    return res.status(200).json({ success: true, message: 'Site ID saved', data: { id: result.id, omada_site_id: result.omada_site_id } });
  } catch (error) {
    // Another router already has this site (one site = one router)
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: 'This site ID is already used by another router.' });
    }
    console.error('Set Omada site error:', error);
    return res.status(500).json({ success: false, error: 'Failed to save the site ID' });
  }
};

// GET /api/platform/omada/waiting
// TP-Link access points that knock on our controller but whose MAC no business registered.
// Oswagolink never adopts these. Usually: a business typed a wrong MAC, or someone's own test.
const listWaitingAccessPoints = async (req, res) => {
  try {
    if (!env.OMADA_OPENAPI_ENABLED) return res.status(200).json({ success: true, data: [], enabled: false });
    const { rows: sites } = await db.query("SELECT omada_site_id FROM routers WHERE device_type = 'omada' AND omada_site_id IS NOT NULL LIMIT 1");
    if (sites.length === 0) return res.status(200).json({ success: true, data: [], enabled: true });
    const pending = await omadaSites.listPending(sites[0].omada_site_id);
    const { rows: known } = await db.query('SELECT mac FROM omada_aps WHERE mac = ANY($1::varchar[])', [pending.map((p) => p.mac)]);
    const knownSet = new Set(known.map((k) => k.mac));
    const data = pending.map((p) => ({ mac: p.mac, model: p.model, registered: knownSet.has(p.mac) }));
    return res.status(200).json({ success: true, data, enabled: true });
  } catch (error) {
    console.error('List waiting access points error:', error.message);
    return res.status(503).json({ success: false, error: 'The TP-Link controller did not answer' });
  }
};

module.exports = { listAllRouters, setOmadaSite, listWaitingAccessPoints };
