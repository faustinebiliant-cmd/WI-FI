-- ============================================================
-- Run this ONCE on every database (laptop and VPS)
-- BEFORE restarting the backend with the new code.
-- Safe to run twice: it does nothing if the column exists.
-- ============================================================
ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
