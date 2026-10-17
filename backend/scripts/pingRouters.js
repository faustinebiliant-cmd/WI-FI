// ============================================================
// OSWAGOTech WiFi - Background Router Pinger
// Run this as a cron job or alongside your server to keep
// the "status" column in the database accurate.
// ============================================================
const supabase = require('../config/supabase');
const { getRouter } = require('../services/routers/routerFactory');

const pingAllRouters = async () => {
  console.log('[Pinger] Checking router statuses...');
  
  try {
    // 1. Get all routers
    const { data: routers, error } = await supabase.from('routers').select('*');
    if (error) throw error;

    for (const r of routers) {
      try {
        const adapter = getRouter(r);
        
        // If we are in dev mode, MockRouter doesn't have checkStatus.
        // So we only ping if we are in "real" mode.
        if (typeof adapter.checkStatus === 'function') {
          const status = await adapter.checkStatus();
          
          if (status.online) {
            await supabase
              .from('routers')
              .update({ status: 'online', last_seen_at: new Date() })
              .eq('id', r.id);
          } else {
            await supabase
              .from('routers')
              .update({ status: 'offline' })
              .eq('id', r.id);
          }
        }
      } catch (err) {
        console.error(`[Pinger] Failed to ping router ${r.name}:`, err.message);
      }
    }
    console.log('[Pinger] Finished checking routers.');
  } catch (err) {
    console.error('[Pinger] Fatal error:', err.message);
  }
};

// Run immediately when the script is executed
pingAllRouters();