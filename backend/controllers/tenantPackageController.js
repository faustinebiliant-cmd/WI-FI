const db = require('../config/db');
const { getRouter, isRouterReady, ROUTER_ADAPTER_COLUMNS } = require('../services/routers/routerFactory');
const { isValidUUID, isValidName, nameRuleMessage, isWholeNumberBetween } = require('../utils/validators');

// Every router is set up with speed profiles for 1 to 20 Mbps (see provisionController),
// so a package speed must be one of those: a whole number of Mbps from 1 to 20.
const MIN_SPEED_KBPS = 1 * 1024;
const MAX_SPEED_KBPS = 20 * 1024;
const isAllowedSpeed = (kbps) => Number.isInteger(kbps) && kbps % 1024 === 0 && kbps >= MIN_SPEED_KBPS && kbps <= MAX_SPEED_KBPS;

const listPackages = async (req, res) => {
  try {
    // Include the router name, and the vouchers a delete would take away (shown in the delete dialog)
    const { rows } = await db.query(`
      SELECT p.*, r.name as router_name, r.device_type AS router_type,
             COALESCE(vc.unused_vouchers, 0) AS unused_vouchers,
             COALESCE(vc.active_vouchers, 0) AS active_vouchers
      FROM packages p
      LEFT JOIN routers r ON p.router_id = r.id
      LEFT JOIN (
        SELECT package_id,
               COUNT(*) FILTER (WHERE status = 'unused')::int AS unused_vouchers,
               COUNT(*) FILTER (WHERE status = 'active')::int AS active_vouchers
        FROM vouchers
        WHERE tenant_id = $1 AND status IN ('unused', 'active')
        GROUP BY package_id
      ) vc ON vc.package_id = p.id
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC
    `, [req.tenantId]);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('List packages error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list packages' });
  }
};

const createPackage = async (req, res) => {
  try {
    const { name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps, router_id } = req.body || {};

    if (!name || price_tzs === undefined || duration_minutes === undefined || !router_id) {
      return res.status(400).json({ success: false, error: 'All fields, including Router, are required' });
    }

    if (!isValidName(name, 1, 40)) {
      return res.status(400).json({ success: false, error: nameRuleMessage('Package name', 1, 40) });
    }
    const packageName = name.trim();

    if (!isValidUUID(router_id)) {
      return res.status(400).json({ success: false, error: 'Invalid router selected.' });
    }

    // Check if the router belongs to this tenant (and which kind it is)
    const routerCheck = await db.query('SELECT id, device_type FROM routers WHERE id = $1 AND tenant_id = $2', [router_id, req.tenantId]);
    if (routerCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Invalid router selected.' });
    }
    // TP-Link-only routers: one speed for the whole business (set on its controller site),
    // so the package has no speed of its own (saved as 0)
    const isOmada = routerCheck.rows[0].device_type === 'omada';

    if (!isOmada && (speed_down_kbps === undefined || speed_up_kbps === undefined)) {
      return res.status(400).json({ success: false, error: 'All fields, including Router, are required' });
    }

    // MATH VALIDATION & MAX LIMITS
    const price = Number(price_tzs);
    const duration = Number(duration_minutes);
    const down = isOmada ? 0 : Number(speed_down_kbps);
    const up = isOmada ? 0 : Number(speed_up_kbps);

    if (![price, duration, down, up].every(Number.isFinite)) {
      return res.status(400).json({ success: false, error: 'Price, duration and speeds must be numbers.' });
    }
    if (!isWholeNumberBetween(price_tzs, 0, 1000000)) {
      return res.status(400).json({ success: false, error: 'Price: a whole number from 0 to 1,000,000 TZS.' });
    }
    if (duration <= 0 || duration > 525600) return res.status(400).json({ success: false, error: 'Duration must be between 1 minute and 365 days.' });
    if (!isOmada && (!isAllowedSpeed(down) || !isAllowedSpeed(up))) {
      return res.status(400).json({ success: false, error: 'Speed must be a whole number from 1 to 20 Mbps.' });
    }

    // Limit: max 20 packages per tenant. Count and add under one lock per business,
    // so two quick clicks cannot pass the limit.
    const created = await db.transaction(async (client) => {
      await db.lockTenant(client, 'packages', req.tenantId);
      const countRes = await client.query('SELECT COUNT(*) FROM packages WHERE tenant_id = $1', [req.tenantId]);
      if (parseInt(countRes.rows[0].count, 10) >= 20) return null;

      const { rows } = await client.query(
        `INSERT INTO packages (tenant_id, router_id, name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.tenantId, router_id, packageName, price, duration, down, up]
      );
      return rows[0];
    });
    if (!created) {
      return res.status(400).json({ success: false, error: 'You have reached the maximum limit of 20 packages.' });
    }

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Create package error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create package' });
  }
};

const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid package ID' });

    // The package and its router (only what the router connection needs)
    const pkgRes = await db.query(
      `SELECT p.name, r.id AS router_id, ${ROUTER_ADAPTER_COLUMNS}
       FROM packages p
       LEFT JOIN routers r ON r.id = p.router_id AND r.tenant_id = p.tenant_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, req.tenantId]
    );
    if (pkgRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Package not found' });
    const pkg = pkgRes.rows[0];

    // Deleting a package deletes ALL its vouchers, unused and active ones too.
    // Cancel them first, so nobody can start using one while we talk to the router.
    const { rows: cancelled } = await db.query(
      `UPDATE vouchers v SET status = 'cancelled'
       FROM (SELECT id, status FROM vouchers
             WHERE package_id = $1 AND tenant_id = $2 AND status IN ('unused', 'active')
             FOR UPDATE) old
       WHERE v.id = old.id
       RETURNING v.id, v.code, old.status AS previous_status`,
      [id, req.tenantId]
    );

    // Only an active voucher has a user on the router: take every one off, so nobody
    // keeps internet from a voucher that no longer exists
    const active = cancelled.filter((v) => v.previous_status === 'active');
    if (active.length > 0 && pkg.router_id && isRouterReady(pkg)) {
      for (const v of active) {
        let result;
        try {
          result = await getRouter(pkg).removeVoucher(v.code);
        } catch (err) {
          console.error('Delete package: router could not be used:', err.message);
          result = { ok: false };
        }
        if (!result || !result.ok) {
          // Undo, so the tenant can try again when the router is reachable
          await db.query(
            `UPDATE vouchers v SET status = old.status
             FROM unnest($1::uuid[], $2::text[]) AS old(id, status)
             WHERE v.id = old.id AND v.status = 'cancelled'`,
            [cancelled.map((c) => c.id), cancelled.map((c) => c.previous_status)]
          );
          return res.status(503).json({
            success: false,
            error: 'The router could not be reached, so the customers using this package could not be disconnected. The package was NOT deleted. Please try again when the router is online.'
          });
        }
      }
    }

    // Close the open sessions and delete the package (its vouchers go with it): both or neither
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE sessions SET ended_at = NOW(), disconnect_reason = 'Package deleted'
         WHERE ended_at IS NULL AND voucher_id IN (SELECT id FROM vouchers WHERE package_id = $1 AND tenant_id = $2)`,
        [id, req.tenantId]
      );
      await client.query('DELETE FROM packages WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    });

    return res.status(200).json({ success: true, message: `Package "${pkg.name}" and its vouchers deleted` });
  } catch (error) {
    console.error('Delete package error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete package' });
  }
};

module.exports = { listPackages, createPackage, deletePackage };