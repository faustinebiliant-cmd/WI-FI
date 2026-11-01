-- ============================================================
-- Run this ONCE on every database (laptop and VPS).
-- Safe to run twice. No code change depends on it, so it can run
-- before or after the backend restart.
--
-- Indexes for 500 businesses: the busy questions the system asks
-- (every redeem, every portal visit, every minute in the cleaner)
-- get their own index, so the database no longer reads whole tables.
-- Duplicate indexes are removed: each one slows every new row.
--
-- All in one transaction: either every change is made or none.
-- The tables are still small, so the short lock is not noticed.
-- ============================================================
BEGIN;

-- Every redeem, expiry and revoke closes the sessions of one voucher.
-- Also used when vouchers are deleted (with their package).
CREATE INDEX IF NOT EXISTS idx_sessions_voucher ON public.sessions(voucher_id);

-- The portal asks: what is this phone's latest voucher on this router?
-- Also used when a router is deleted.
CREATE INDEX IF NOT EXISTS idx_sessions_router_mac ON public.sessions(router_id, mac_address, started_at DESC);

-- Open sessions only: these stay small however long the history grows.
-- Cleaner (every minute, every router), dashboards, active-customer pages.
CREATE INDEX IF NOT EXISTS idx_sessions_router_open ON public.sessions(router_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_open ON public.sessions(tenant_id, started_at DESC) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_open_started ON public.sessions(started_at DESC) WHERE ended_at IS NULL;

-- Cleaner (every minute): running vouchers past their end time
CREATE INDEX IF NOT EXISTS idx_vouchers_active_expires ON public.vouchers(expires_at) WHERE status = 'active';

-- Dashboard "used today" and the voucher list's "used today" filter
CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_used ON public.vouchers(tenant_id, used_at) WHERE used_at IS NOT NULL;

-- Vouchers of a package: package delete check, and deleting a package's vouchers
CREATE INDEX IF NOT EXISTS idx_vouchers_package ON public.vouchers(package_id);

-- Packages of a router: every redeem and portal visit, and deleting a router
CREATE INDEX IF NOT EXISTS idx_packages_router ON public.packages(router_id);

-- Duplicates (only removed after their replacements exist above)
DROP INDEX IF EXISTS public.idx_vouchers_code;            -- same as UNIQUE (tenant_id, code)
DROP INDEX IF EXISTS public.idx_routers_provision_token;  -- same as UNIQUE (provision_token)
DROP INDEX IF EXISTS public.idx_vouchers_tenant;          -- covered by idx_vouchers_tenant_status / _created
DROP INDEX IF EXISTS public.idx_sessions_tenant;          -- covered by idx_sessions_tenant_started
DROP INDEX IF EXISTS public.idx_sessions_active;          -- replaced by idx_sessions_tenant_open

COMMIT;

-- Refresh the database's table statistics so it starts using the new indexes at once
ANALYZE public.sessions;
ANALYZE public.vouchers;
ANALYZE public.packages;
