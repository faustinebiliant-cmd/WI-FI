// ============================================================
// OSWAGOTech WiFi - Tenant Auth Middleware
// ============================================================
const { verifyTenantToken } = require('../services/jwt');
const supabase = require('../config/supabase');

const authTenant = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No tenant token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyTenantToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired tenant token' });
    }

    // Handle Impersonation (Admin acting as Tenant)
    if (decoded.impersonation_token_id) {
      const { data: session } = await supabase
        .from('impersonation_sessions')
        .select('*')
        .eq('token_id', decoded.impersonation_token_id)
        .is('ended_at', null)
        .single();

      if (!session || new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ success: false, error: 'Impersonation session expired or ended' });
      }

      req.tenantUser = { id: session.tenant_user_id, role: 'owner', is_impersonation: true };
      req.tenantId = session.tenant_id;
      return next();
    }

    // Normal Tenant User Flow
    const { data: user, error } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, email, full_name, role, is_active')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Tenant user not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    req.tenantUser = user;
    req.tenantId = user.tenant_id;
    next();
  } catch (error) {
    console.error('Tenant Auth Error:', error);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

module.exports = authTenant;