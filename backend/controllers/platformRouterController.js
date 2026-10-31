const db = require('../config/db');

const listAllRouters = async (req, res) => {
  try {
    // Only what the page shows. Tokens and passwords never go to the browser.
    const { rows } = await db.query(`
      SELECT r.id, r.name, r.location_label, r.status, r.last_seen_at, r.created_at,
             t.business_name as tenant_name
      FROM routers r
      JOIN tenants t ON r.tenant_id = t.id
      ORDER BY r.created_at DESC
    `);
    
    const formattedData = rows.map(r => ({
      ...r,
      tenants: { business_name: r.tenant_name }
    }));

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to list routers' });
  }
};

module.exports = { listAllRouters };