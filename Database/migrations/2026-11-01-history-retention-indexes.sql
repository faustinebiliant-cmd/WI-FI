-- ============================================================
-- Oswagolink - indexes for the nightly history clean-up
-- (backend/scripts/deleteOldHistory.js). Without them, each night
-- would read the whole sessions and vouchers tables.
-- Safe to run twice.
-- Run on the VPS: sudo -u postgres psql -d wifi_app < Database/migrations/2026-11-01-history-retention-indexes.sql
-- ============================================================
BEGIN;

CREATE INDEX IF NOT EXISTS idx_sessions_ended
  ON public.sessions(ended_at) WHERE ended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vouchers_finished
  ON public.vouchers((GREATEST(created_at, used_at, expires_at)))
  WHERE status IN ('expired', 'cancelled');

COMMIT;
