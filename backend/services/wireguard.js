// ============================================================
// Oswagolink - WireGuard tunnels on the VPS
// Used when a router is deleted, and when a whole business is deleted.
// ============================================================
const { execFile } = require('child_process');

// A WireGuard public key: 43 base64 characters and "="
const PUBKEY_RE = /^[A-Za-z0-9+/]{43}=$/;

// Removes one router's tunnel through the root-owned helper (vps/wifi-wireguard-remove-peer).
// Same lock as enrollment, so two changes to wg0.conf never run at the same time.
// No shell is used. Resolves true only if the helper reported success; a tunnel that
// is already gone counts as success, so trying again after a failure is always safe.
const removeWireGuardPeer = (publicKey) => new Promise((resolve) => {
  if (!PUBKEY_RE.test(String(publicKey || ''))) return resolve(false);
  execFile(
    'flock',
    ['-w', '10', '/var/lock/wg-enroll.lock', 'sudo', '-n', '/usr/local/sbin/wifi-wireguard-remove-peer', publicKey],
    { timeout: 30000 },
    (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to remove WireGuard peer:', (stderr && stderr.trim()) || err.message);
        return resolve(false);
      }
      resolve(true);
    }
  );
});

module.exports = { PUBKEY_RE, removeWireGuardPeer };
