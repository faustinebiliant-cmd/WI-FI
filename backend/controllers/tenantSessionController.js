const supabase = require('../config/supabase');
const { isValidUUID } = require('../utils/validators');
const { getRouter } = require('../services/routers/routerFactory');
const { formatDateTimeEAT } = require('../utils/tz');

// GET /api/tenant/sessions/active
const getActiveSessions = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        vouchers (code),
        routers (name)
      `)
      .eq('tenant_id', req.tenantId)
      .is('ended_at', null)
      .order('started_at', { ascending: false });

    if (error) throw error;

    // Attach EAT-formatted start time so the UI does not
    // depend on the browser's local timezone.
    const enriched = (data || []).map((s) => ({
      ...s,
      started_at_eat: formatDateTimeEAT(s.started_at),
    }));

    return res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error('Get active sessions error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch active sessions' });
  }
};

// POST /api/tenant/sessions/:id/disconnect
const disconnectSession = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }

    // 1. Get the session and router details
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('*, routers(*)')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // 2. Tell the router to kick the MAC address
    const adapter = getRouter(session.routers);
    await adapter.disconnectUser(session.mac_address);

    // 3. Mark the session as ended
    await supabase
      .from('sessions')
      .update({
        ended_at: new Date(),
        disconnect_reason: 'Disconnected by Tenant Admin',
      })
      .eq('id', id);

    return res.status(200).json({ success: true, message: 'Guest disconnected' });
  } catch (error) {
    console.error('Disconnect session error:', error);
    return res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
};

module.exports = { getActiveSessions, disconnectSession };