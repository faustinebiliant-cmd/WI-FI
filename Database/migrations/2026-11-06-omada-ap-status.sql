-- ============================================================
-- Oswagolink - TP-Link access point status (6 November 2026, automation step V2-1)
--
-- Each TP-Link access point (EAP) gets the status the controller reports, checked by
-- the 5-minute router pinger with the Open API key. The router's own status keeps its
-- meaning ("the controller answers for this business"); this is per access point.
--
-- Run on the VPS (safe to run twice):
--   sudo -u postgres psql -d wifi_app -v ON_ERROR_STOP=1 < Database/migrations/2026-11-06-omada-ap-status.sql
-- Undo:
--   ALTER TABLE omada_aps DROP COLUMN status, DROP COLUMN status_at;
-- ============================================================
BEGIN;

-- online, offline, pending (waiting to be adopted), heartbeat_missed, isolated,
-- not_found (not in the business's controller site yet), or NULL (never checked)
ALTER TABLE public.omada_aps
  ADD COLUMN IF NOT EXISTS status varchar(20),
  ADD COLUMN IF NOT EXISTS status_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'omada_aps_status_check') THEN
    ALTER TABLE public.omada_aps
      ADD CONSTRAINT omada_aps_status_check
      CHECK (status IS NULL OR status IN ('online', 'offline', 'pending', 'heartbeat_missed', 'isolated', 'not_found'));
  END IF;
END $$;

COMMIT;
