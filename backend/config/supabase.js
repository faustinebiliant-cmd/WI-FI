// ============================================================
// OSWAGOTech WiFi - Supabase Connection
// ------------------------------------------------------------
// The service-role key bypasses RLS. This client is backend
// only. Never import it from any frontend.
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

if (env.IS_DEV) {
  console.log('Supabase connected');
}

module.exports = supabase;