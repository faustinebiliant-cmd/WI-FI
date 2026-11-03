// ============================================================
// Oswagolink - Emergency key for a router's staff door (Winbox)
// Run on the VPS from ~/WI-FI/backend:
//   node scripts/routerStaffDoor.js open  10.20.0.3   Winbox on every LAN port again (check paused)
//   node scripts/routerStaffDoor.js close 10.20.0.3   back to normal: access-point ports blocked within 1 minute
// The address is the router's tunnel address (admin panel > Routers, or the router's name
// "oswagolink-10-20-0-3"). Works over the tunnel: nobody has to visit the router.
// ============================================================
const db = require('../config/db');
const { getRouter } = require('../services/routers/routerFactory');

const [action, address] = process.argv.slice(2);

const run = async () => {
  if (!['open', 'close'].includes(action) || !/^10\.20\.\d{1,3}\.\d{1,3}$/.test(String(address || ''))) {
    console.log('Usage: node scripts/routerStaffDoor.js open|close 10.20.X.Y');
    process.exitCode = 1;
    return;
  }

  const { rows } = await db.query(
    `SELECT r.id, r.name, r.ip_address, r.api_port, r.api_username, r.api_password_encrypted, t.business_name
     FROM routers r JOIN tenants t ON t.id = r.tenant_id
     WHERE r.tunnel_ip = $1 OR r.ip_address = $1`,
    [address]
  );
  if (rows.length === 0) {
    console.log(`No router with the address ${address}.`);
    process.exitCode = 1;
    return;
  }
  // Never guess which router is meant
  if (rows.length > 1) {
    console.log(`More than one router has the address ${address}: ${rows.map((r) => `"${r.name}" (${r.business_name})`).join(', ')}. Nothing was changed. Tell Claude.`);
    process.exitCode = 1;
    return;
  }
  const router = rows[0];

  const result = await getRouter(router).setStaffDoorOpen(action === 'open');
  if (!result.ok) {
    console.log(`Router "${router.name}" (${router.business_name}) could not be reached: ${result.error}. Nothing was changed. Is it online?`);
    process.exitCode = 1;
    return;
  }
  console.log(action === 'open'
    ? `OPEN: Winbox now works on every LAN port of "${router.name}" (${router.business_name}), customers' ports included. Close it again when the work is done.`
    : `CLOSED: "${router.name}" (${router.business_name}) blocks Winbox on access-point ports again within 1 minute.`);
};

run()
  .catch((err) => {
    console.error('Staff door error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await db.pool.end(); } catch (e) { /* ignore */ }
    process.exit(process.exitCode || 0);
  });
