const db = require('../config/db');

const updateProfile = async (req, res) => {
  try {
    const { lipa_namba, payout_provider } = req.body;
    const tenantId = req.tenantId;

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