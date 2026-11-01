-- ============================================================
-- Oswagolink - "what is slow?" report (scaling phase 6)
--   sudo -u postgres psql -d wifi_app < vps/wifi-db-slow-report.sql
-- Shows request shapes only ($1, $2 instead of real values).
-- Start counting again from zero: SELECT pg_stat_statements_reset();
-- ============================================================
\echo '== Slowest on average (ms per run) =='
SELECT round(mean_exec_time::numeric, 1) AS avg_ms,
       calls,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS request
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY mean_exec_time DESC
LIMIT 10;

\echo '== Most total database time (all runs together, seconds) =='
SELECT round((total_exec_time / 1000)::numeric, 1) AS total_s,
       calls,
       round(mean_exec_time::numeric, 1) AS avg_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS request
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC
LIMIT 10;

\echo '== Table sizes =='
SELECT relname AS table_name,
       n_live_tup AS rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS size_with_indexes
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
