const supabase = require('../config/supabase');
const { verifyPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

    const cleanEmail = email.toLowerCase().trim();

    const { data: user } = await supabase
      .from('tenant_users')
      .select('*, tenants(subscription_status)')
      .eq('email', cleanEmail)
      .maybeSingle();

    const FAILED = { success: false, error: 'Invalid credentials' };
    if (!user) return res.status(401).json(FAILED);
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) return res.status(401).json(FAILED);

    const token = signTenantToken({
      id: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      full_name: user.full_name
    });

    await supabase.from('tenant_users').update({ last_login_at: new Date() }).eq('id', user.id);

    return res.status(200).json({
      success: true,
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      tenant_status: user.tenants?.subscription_status
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

const endImpersonationSelf = async (req, res) => {
  try {
    if (!req.tenantUser.is_impersonation) {
      return res.status(400).json({ success: false, error: 'Not in an impersonation session' });
    }
    // Mark session ended
    await supabase
      .from('impersonation_sessions')
      .update({ ended_at: new Date(), ended_by: 'tenant' })
      .eq('tenant_user_id', req.tenantUser.id)
      .is('ended_at', null);

    return res.status(200).json({ success: true, message: 'Impersonation ended' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to end impersonation' });
  }
};

module.exports = { login, endImpersonationSelf };