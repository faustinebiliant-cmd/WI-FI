-- ============================================================
-- Run this ONCE on every database (laptop and VPS).
-- Safe to run twice: it does nothing where the rule already exists.
--
-- schema.sql says every router setup link (provision_token) is
-- different: UNIQUE (provision_token). The VPS database was made
-- without that rule (it had only a plain index, removed by
-- 2026-11-01-scaling-indexes.sql as a duplicate). This adds the rule,
-- which also gives setup-link lookups their index back.
--
-- Before running on a database with data, check that no two routers
-- share a link (must show 0 rows):
--   SELECT provision_token, count(*) FROM routers
--   WHERE provision_token IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--
-- (routers.tunnel_ip on the VPS is protected by a unique index named
-- idx_routers_tunnel_ip instead of routers_tunnel_ip_key: same rule,
-- other name, so it is left as it is.)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.routers'::regclass
      AND i.indisunique AND i.indnatts = 1 AND a.attname = 'provision_token'
  ) THEN
    ALTER TABLE public.routers ADD CONSTRAINT routers_provision_token_key UNIQUE (provision_token);
    RAISE NOTICE 'Added: every router setup link must be different';
  ELSE
    RAISE NOTICE 'Already there: nothing changed';
  END IF;
END $$;
