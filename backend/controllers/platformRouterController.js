const db = require('../config/db');
const { isValidUUID, isValidOmadaSiteId } = require('../utils/validators');

const listAllRouters = async (req, res) => {
  try {
    // Only what the page shows. Tokens and passwords never go to the browser.
    // TP-Link routers also show their access points and their controller site ID
    // (not secret: it is in every customer's portal link).
    const { rows } = await db.query(`
      SELECT r.id, r.name, r.location_label, r.status, r.last_seen_at, r.created_at,
             r.device_type, r.omada_site_id,
             COALESCE(
               (SELECT json_agg(a.mac ORDER BY a.created_at) FROM omada_aps a WHERE a.router_id = r.id),
               '[]'::json
             ) AS ap_macs,
             COALESCE(
               (SELECT json_agg(json_build_object('mac', a.mac, 'status', a.status, 'status_at', a.status_at) ORDER BY a.created_at)
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
         WHERE r.id = $2 AND r.device_type = 'omada' AND t.id = r.tenant_id
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

module.exports = { listAllRouters, setOmadaSite };
