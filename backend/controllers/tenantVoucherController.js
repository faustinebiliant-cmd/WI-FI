// ============================================================
// OSWAGOTech WiFi - Tenant Voucher Controller
// ============================================================
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { getTodayRangeEAT } = require('../utils/tz');

const generateCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

const generateVouchers = async (req, res) => {
  try {
    const { package_id, quantity } = req.body;
    const count = parseInt(quantity) || 100;

    if (count < 1 || count > 500) {
      return res.status(400).json({ success: false, error: 'Generate between 1 and 500' });
    }

    const { data: pkg } = await supabase
      .from('packages')
      .select('id')
      .eq('id', package_id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });

    const vouchersToInsert = [];
    for (let i = 0; i < count; i++) {
      vouchersToInsert.push({
        tenant_id: req.tenantId,
        package_id: package_id,
        code: generateCode(),
        status: 'unused',
        created_by: req.tenantUser.id,
      });
    }

    const { data, error } = await supabase.from('vouchers').insert(vouchersToInsert).select();
    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: `Generated ${count} vouchers`,
      data: data.map((v) => v.code),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to generate vouchers' });
  }
};

// GET /api/tenant/vouchers?page=1&limit=50&today=true
// - today=true filters to vouchers CREATED today in EAT
// - ?today=true&scope=used filters to vouchers USED today in EAT
const listVouchers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('vouchers')
      .select('*, packages (name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId);

    if (req.query.today === 'true') {
      const { start, end } = getTodayRangeEAT();
      if (req.query.scope === 'used') {
        query = query
          .gte('used_at', start.toISOString())
          .lte('used_at', end.toISOString());
      } else {
        query = query
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());
      }
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
      filter: req.query.today === 'true'
        ? { today: true, scope: req.query.scope === 'used' ? 'used' : 'created' }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to list vouchers' });
  }
};

const revokeVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('vouchers')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to revoke voucher' });
  }
};

module.exports = { generateVouchers, listVouchers, revokeVoucher };