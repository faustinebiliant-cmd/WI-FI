const crypto = require('crypto');

// POST /api/portal/pay
const initiatePayment = async (req, res) => {
  try {
    const { router_token, package_id, phone_number } = req.body;

    if (!router_token || !package_id || !phone_number) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // --- MOCK LOGIC ---
    // In the future, this is where we will call the AzamPay API.
    // For now, we just pretend the payment was successful so you can test the UI.
    
    console.log(`[MOCK PAYMENT] Simulating payment for ${phone_number} on package ${package_id}`);

    // We simulate a short delay to make it feel real
    await new Promise(resolve => setTimeout(resolve, 1500));

    return res.status(200).json({
      success: true,
      message: 'Mock payment successful. Please check your phone.',
      data: { 
        transaction_id: crypto.randomUUID(),
        status: 'success'
      }
    });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate payment' });
  }
};

module.exports = { initiatePayment };