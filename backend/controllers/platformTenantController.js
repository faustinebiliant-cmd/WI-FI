// ============================================================
// OSWAGOTech WiFi - Platform Tenant Controller
// ============================================================
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { hashPassword } = require('../services/password');
const { signTenantToken } = require('../services/jwt');
const { isValidEmail, isValidPhone, isSafeText } = require('../utils/validators');

// --- CREATE TENANT ---
const createTenant = async (req, res) => {
  try {
    const { business_name, owner_name, owner_email, owner_phone, monthly_fee } = req.body;

    if (!business_name || !owner_name || !owner_email || !owner_phone) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    // Deep validation
    if (!isSafeText(business_name) || !isSafeText(owner_name)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in name' });
    }
    if (!isValidEmail(owner_email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone format (use 07XXXXXXXX)' });
    }

    const cleanEmail = owner_email.toLowerCase().trim();

    const { data: existingUser } = await supabase
      .from('tenant_users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email is already registered to another tenant' });
    }

    const tempPassword = 'Welcome123!';
    const passwordHash = await hashPassword(tempPassword);

    const { data, error } = await supabase.rpc('create_tenant_with_owner', {
      p_business_name: business_name.trim(),
      p_owner_name: owner_name.trim(),
      p_owner_email: cleanEmail,
      p_owner_phone: owner_phone.trim(),
      p_owner_password_hash: passwordHash,
      p_monthly_fee: monthly_fee || 0
    });

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: {
        tenant_id: data.tenant_id,
        owner_email: cleanEmail,
        temp_password: tempPassword 
      }
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// --- LIST TENANTS ---
const listTenants = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List tenants error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list tenants' });
  }
};

// --- GET TENANT DETAILS ---
const getTenant = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { count: routerCount } = await supabase.from('routers').select('*', { count: 'exact', head: true }).eq('tenant_id', id);
    const { count: activeSessions } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('tenant_id', id).is('ended_at', null);

    return res.status(200).json({
      success: true,
      data: {
        ...tenant,
        router_count: routerCount || 0,
        active_sessions: activeSessions || 0
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get tenant' });
  }
};

// --- SUSPEND / UNSUSPEND TENANT ---
const toggleTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const { reason } = req.body;

    if (!['suspend', 'unsuspend'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const newStatus = action === 'suspend' ? 'suspended' : 'active';

    const { data: tenant, error } = await supabase
      .from('tenants')
      .update({ subscription_status: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (error || !tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    await supabase.from('platform_audit_logs').insert({
      admin_id: req.admin.id,
      admin_email: req.admin.email,
      action: action === 'suspend' ? 'Tenant Suspended' : 'Tenant Unsuspended',
      target_type: 'tenant',
      target_id: tenant.id,
      target_label: tenant.business_name,
      details: { reason: reason || 'No reason provided' }
    });

    return res.status(200).json({ success: true, message: `Tenant ${action}ed successfully`, data: tenant });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update tenant status' });
  }
};

// --- IMPERSONATE TENANT ---
const impersonateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'A detailed reason (min 10 chars) is required' });
    }

    const { data: owner } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', id)
      .eq('role', 'owner')
      .single();

    if (!owner) return res.status(404).json({ success: false, error: 'Tenant owner not found' });

    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await supabase.from('impersonation_sessions').insert({
      admin_id: req.admin.id,
      admin_email: req.admin.email,
      tenant_id: id,
      tenant_user_id: owner.id,
      reason: reason.trim(),
      token_id: tokenId,
      expires_at: expiresAt.toISOString()
    });

    const impersonationToken = signTenantToken({
      id: owner.id,
      email: owner.email,
      full_name: owner.full_name,
      tenant_id: id,
      role: 'owner',
      impersonation_token_id: tokenId
    });

    await supabase.from('platform_audit_logs').insert({
      admin_id: req.admin.id,
      admin_email: req.admin.email,
      action: 'Impersonation Started',
      target_type: 'tenant',
      target_id: id,
      target_label: owner.full_name,
      details: { reason: reason.trim() }
    });

    return res.status(200).json({
      success: true,
      message: 'Impersonation session started',
      token: impersonationToken,
      tenant_user: { full_name: owner.full_name, email: owner.email }
    });

  } catch (error) {
    console.error('Impersonation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to start impersonation' });
  }
};

module.exports = {
  createTenant,
  listTenants,
  getTenant,
  toggleTenantStatus,
  impersonateTenant
};