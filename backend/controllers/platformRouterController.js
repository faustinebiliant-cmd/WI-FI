const supabase = require('../config/supabase');

const listAllRouters = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('routers')
      .select(`
        *,
        tenants (business_name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to list routers' });
  }
};

module.exports = { listAllRouters };