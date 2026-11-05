-- ============================================================
-- Oswagolink - TP-Link-only routers (5 November 2026)
--
-- Adds a second kind of router: a TP-Link Omada access point (EAP) managed by the
-- Omada controller on the VPS, instead of a MikroTik. Nothing existing changes:
-- every current router becomes device_type 'mikrotik' automatically.
--
-- Run on the VPS (safe to run twice):
--   sudo -u postgres psql -d wifi_app -v ON_ERROR_STOP=1 < Database/migrations/2026-11-05-tplink-routers.sql
-- Undo (only before any TP-Link router exists):
--   DROP TABLE omada_aps; ALTER TABLE routers DROP COLUMN omada_site_id, DROP COLUMN device_type;
-- ============================================================
BEGIN;

-- Which kind of router this is
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS device_type varchar(20) NOT NULL DEFAULT 'mikrotik';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routers_device_type_check') THEN
    ALTER TABLE public.routers
      ADD CONSTRAINT routers_device_type_check CHECK (device_type IN ('mikrotik', 'omada'));
  END IF;
END $$;

-- The business's site in the Omada controller (24 hexadecimal characters, from the
-- controller). Empty until the admin has created the site. One site = one router.
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS omada_site_id varchar(24) UNIQUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routers_omada_site_id_check') THEN
    ALTER TABLE public.routers
      ADD CONSTRAINT routers_omada_site_id_check
      CHECK (omada_site_id IS NULL OR (omada_site_id ~ '^[0-9a-f]{24}$' AND device_type = 'omada'));
  END IF;
END $$;

-- The TP-Link access points (EAPs) of a TP-Link router. Only a phone on one of these
-- access points can redeem a voucher of that router. An EAP belongs to one router only.
CREATE TABLE IF NOT EXISTS public.omada_aps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id uuid REFERENCES public.routers(id) ON DELETE CASCADE NOT NULL,
    mac varchar(17) UNIQUE NOT NULL CHECK (mac ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_omada_aps_router ON public.omada_aps (router_id);

-- The backend's database user (wifi_app) needs to read and write the new table.
-- (When this file is run as postgres, the new table belongs to postgres.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.omada_aps TO wifi_app;
  END IF;
END $$;

COMMIT;
