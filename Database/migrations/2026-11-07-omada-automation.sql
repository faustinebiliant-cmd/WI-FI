-- ============================================================
-- Oswagolink - TP-Link automation (7 November 2026, steps V2-2, V2-3, V2-4)
--
-- V2-2  Oswagolink creates each TP-Link business's controller site itself.
-- V2-3  Oswagolink adopts the business's access point itself (only the MAC the business typed).
-- V2-4  Deleting the router removes the site Oswagolink created from the controller.
--
-- routers:
--   omada_site_auto                   true = Oswagolink created this site (only these are ever
--                                     deleted automatically; sites made by hand stay false)
--   omada_wifi_name                   the WiFi name (SSID) Oswagolink created
--   omada_speed_kbps                  the business WiFi speed per phone (kbps, whole Mbps)
--   omada_device_password_encrypted   the site's access point login (device account), encrypted
--   omada_setup_password_encrypted    the one-time setup login the technician types on a new
--                                     access point, so Oswagolink can adopt it; encrypted
-- omada_aps:
--   adopted_at                        when the access point joined its site (NULL = not yet)
--   adopt_tried_at, adopt_error       the last adoption try and why it failed
--
-- Run on the VPS (safe to run twice):
--   sudo -u postgres psql -d wifi_app -v ON_ERROR_STOP=1 < Database/migrations/2026-11-07-omada-automation.sql
-- Undo:
--   ALTER TABLE routers DROP COLUMN omada_site_auto, DROP COLUMN omada_wifi_name,
--     DROP COLUMN omada_speed_kbps, DROP COLUMN omada_device_password_encrypted,
--     DROP COLUMN omada_setup_password_encrypted;
--   ALTER TABLE omada_aps DROP COLUMN adopted_at, DROP COLUMN adopt_tried_at, DROP COLUMN adopt_error;
-- ============================================================
BEGIN;

ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS omada_site_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS omada_wifi_name varchar(32),
  ADD COLUMN IF NOT EXISTS omada_speed_kbps integer,
  ADD COLUMN IF NOT EXISTS omada_device_password_encrypted text,
  ADD COLUMN IF NOT EXISTS omada_setup_password_encrypted text;

ALTER TABLE public.omada_aps
  ADD COLUMN IF NOT EXISTS adopted_at timestamptz,
  ADD COLUMN IF NOT EXISTS adopt_tried_at timestamptz,
  ADD COLUMN IF NOT EXISTS adopt_error varchar(30);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routers_omada_speed_check') THEN
    ALTER TABLE public.routers
      ADD CONSTRAINT routers_omada_speed_check
      CHECK (omada_speed_kbps IS NULL OR (omada_speed_kbps BETWEEN 1024 AND 102400 AND omada_speed_kbps % 1024 = 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'omada_aps_adopt_error_check') THEN
    ALTER TABLE public.omada_aps
      ADD CONSTRAINT omada_aps_adopt_error_check
      CHECK (adopt_error IS NULL OR adopt_error IN ('wrong_login', 'no_answer', 'failed'));
  END IF;
END $$;

-- Access points already working on a site made by hand count as adopted
UPDATE public.omada_aps a SET adopted_at = COALESCE(a.status_at, now())
FROM public.routers r
WHERE r.id = a.router_id AND r.omada_site_id IS NOT NULL AND a.adopted_at IS NULL
  AND a.status IN ('online', 'offline', 'heartbeat_missed', 'isolated');

COMMIT;
