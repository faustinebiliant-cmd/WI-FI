-- ============================================================
-- Oswagolink - switch on database monitoring (scaling phase 6)
-- Run once on the VPS:
--   sudo -u postgres psql -v ON_ERROR_STOP=1 < vps/wifi-db-monitoring.sql
--   sudo systemctl restart postgresql && pm2 restart wifi-backend
--   sudo -u postgres psql -d wifi_app -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
-- Safe to run twice. Settings are saved in postgresql.auto.conf;
-- undo one with: ALTER SYSTEM RESET <name>;  then restart PostgreSQL.
-- ============================================================

-- 1. Any request slower than 0.3 seconds is written to the PostgreSQL log
--    (/var/log/postgresql/). Only the request itself is logged, never the
--    values inside it: those can be emails or password hashes.
ALTER SYSTEM SET log_min_duration_statement = '300ms';
ALTER SYSTEM SET log_parameter_max_length = 0;
ALTER SYSTEM SET log_parameter_max_length_on_error = 0;

-- 2. A request that waits more than 1 second for another one (a lock) is logged too
ALTER SYSTEM SET log_lock_waits = on;

-- 3. pg_stat_statements: keeps a running list of the busiest and slowest requests
--    (read it with vps/wifi-db-slow-report.sql). It needs a restart to load.
--    Only switched on when it is installed and nothing else is loaded already:
--    a wrong value here would stop PostgreSQL from starting.
SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') AS pgss_installed,
       current_setting('shared_preload_libraries') IN ('', 'pg_stat_statements') AS preload_free
\gset
\if :pgss_installed
  \if :preload_free
    ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
    ALTER SYSTEM SET pg_stat_statements.track = 'top';
    \echo 'OK: pg_stat_statements will load after the restart.'
  \else
    \echo 'SKIPPED pg_stat_statements: shared_preload_libraries already has something else. Send this to Claude.'
  \endif
\else
  \echo 'SKIPPED pg_stat_statements: not installed on this server. Send this to Claude.'
\endif

SELECT pg_reload_conf();
\echo 'Done. Now restart PostgreSQL (see the top of this file).'
