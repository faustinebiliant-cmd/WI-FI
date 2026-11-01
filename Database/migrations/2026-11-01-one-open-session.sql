-- ============================================================
-- Run this ONCE on every database (laptop and VPS),
-- BEFORE restarting the backend with the new code.
-- Safe to run twice.
--
-- Rule: one voucher on one device has at most ONE open session.
-- The portal and the cleaner could both record the same customer at
-- the same moment, which counted them twice as "online". The backend
-- now skips such a second record (ON CONFLICT DO NOTHING).
--
-- First any existing doubles are closed (the newest one stays open),
-- otherwise the rule could not be added. All in one transaction.
-- ============================================================
BEGIN;

UPDATE public.sessions s
SET ended_at = NOW(), disconnect_reason = 'duplicate'
WHERE s.ended_at IS NULL
  AND s.voucher_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sessions newer
    WHERE newer.voucher_id = s.voucher_id
      AND newer.mac_address = s.mac_address
      AND newer.ended_at IS NULL
      AND (newer.started_at, newer.id) > (s.started_at, s.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_open
  ON public.sessions(voucher_id, mac_address) WHERE ended_at IS NULL;

COMMIT;
