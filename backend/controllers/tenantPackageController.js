const supabase = require('../config/supabase');

const listPackages = async (req, res) => {
  const { data, error } = await supabase.from('packages').select('*').eq('tenant_id', req.tenantId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, error: 'Failed to list packages' });
  return res.status(200).json({ success: true, data });
};

const createPackage = async (req, res) => {
  try {
    const { name, price_tzs, duration_minutes, speed_down_kbps, speed_up_kbps } = req.body;

    if (!name || !price_tzs || !duration_minutes || !speed_down_kbps || !speed_up_kbps) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const { data, error } = await supabase.from('packages').insert({
      tenant_id: req.tenantId,
      name: name.trim(),
      price_tzs,
      duration_minutes,
      speed_down_kbps,
      speed_up_kbps
    }).select().single();

    if (error) throw error;
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to create package' });
  }
};

const deletePackage = async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('packages').delete().eq('id', id).eq('tenant_id', req.tenantId);
  
  if (error) {
    console.error('Delete package error:', error);
    return res.status(500).json({ success: false, error: 'Cannot delete package. It may have active vouchers tied to it.' });
  }
  return res.status(200).json({ success: true, message: 'Package deleted' });
};

module.exports = { listPackages, createPackage, deletePackage };