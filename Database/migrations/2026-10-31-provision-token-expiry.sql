-- ============================================================
-- Run this ONCE on every database (laptop and VPS)
-- BEFORE restarting the backend with the new code.
-- Safe to run twice: it does nothing if the column exists.
--
-- A router setup link (provision token) now works for 12 hours.
-- Routers that already exist get no expiry time, so their old
-- link no longer works; a fresh one can be made in the panel
-- for any router that is not set up yet.
-- ============================================================
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS provision_token_expires_at timestamptz;
