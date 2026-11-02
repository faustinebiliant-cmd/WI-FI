const db = require('../config/db');

// The same choices as the Settings page offers
const PAYOUT_PROVIDERS = ['Tigo', 'Airtel', 'Mpesa', 'Halopesa', 'Azampesa'];

const updateProfile = async (req, res) => {
  try {
    const { payout_provider } = req.body || {};
    const lipa_namba = String((req.body || {}).lipa_namba || '').trim();
    const tenantId = req.tenantId;

    if (!PAYOUT_PROVIDERS.includes(payout_provider)) {
      return res.status(400).json({ success: false, error: 'Choose a mobile money provider from the list.' });
    }
    if (!/^[0-9]{5,15}$/.test(lipa_namba)) {
      return res.status(400).json({ success: false, error: 'Lipa Namba must be 5 to 15 digits.' });
    }

    await db.query(
      'UPDATE tenants SET lipa_namba = $1, payout_provider = $2 WHERE id = $3',
      [lipa_namba, payout_provider, tenantId]
    );

    return res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

const getProfile = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT business_name, lipa_namba, payout_provider FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

module.exports = { updateProfile, getProfile };