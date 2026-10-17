const supabase = require('../config/supabase');
const { getRouter } = require('../services/routers/routerFactory');

// GET /api/platform/sessions
const listAllSessions = async (req, res) => {
  try {
    // Get all active sessions (ended_at is null)
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        tenants (business_name),
        routers (name)
      `)
      .is('ended_at', null)
      .order('started_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
};

// POST /api/platform/sessions/:id/disconnect
const forceDisconnect = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get the session
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, routers(*)')
      .eq('id', id)
      .single();

    if (error || !session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // 2. Call the router adapter to kick them off
    const router = getRouter(session.routers);
    await router.disconnectUser(session.mac_address);

    // 3. Mark session as ended in the database
    await supabase
      .from('sessions')
      .update({ 
        ended_at: new Date(),
        disconnect_reason: 'Force disconnected by Platform Admin'
      })
      .eq('id', id);

    return res.status(200).json({ success: true, message: 'Guest disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
};

module.exports = { listAllSessions, forceDisconnect };