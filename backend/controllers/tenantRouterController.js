// ============================================================
// OSWAGOTech WiFi - Tenant Router Controller
// ============================================================
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { isValidIPAddress, isSafeText } = require('../utils/validators');
const { encrypt } = require('../utils/encryption');

const listRouters = async (req, res) => {
  const { data, error } = await supabase.from('routers').select('*').eq('tenant_id', req.tenantId);
  if (error) return res.status(500).json({ success: false, error: 'Failed to list routers' });
  return res.status(200).json({ success: true, data });
};

const createRouter = async (req, res) => {
  try {
    const { name, location_label, ip_address, api_port, api_username, api_password } = req.body;

    if (!name || !ip_address || !api_username || !api_password) {
      return res.status(400).json({ success: false, error: 'Name, IP, Username and Password are required' });
    }

    if (!isSafeText(name) || !isSafeText(api_username)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in name or username' });
    }

    if (!isValidIPAddress(ip_address)) {
      return res.status(400).json({ success: false, error: 'Invalid IP address format' });
    }

    // Encrypt the password
    const encryptedPassword = encrypt(api_password);
    if (!encryptedPassword) return res.status(500).json({ success: false, error: 'Encryption failed' });

    const routerToken = crypto.randomBytes(16).toString('hex');

    const { data, error } = await supabase.from('routers').insert({
      tenant_id: req.tenantId,
      name: name.trim(),
      location_label,
      ip_address,
      api_port: api_port || 8728,
      api_username,
      api_password_encrypted: encryptedPassword,
      router_token: routerToken,
      status: 'offline'
    }).select().single();

    if (error) throw error;
    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Failed to create router' });
  }
};

module.exports = { listRouters, createRouter };