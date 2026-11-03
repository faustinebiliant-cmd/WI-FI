-- ============================================================
-- Run this ONCE on every database (laptop and VPS), BEFORE restarting the backend.
-- Safe to run twice: it does nothing where the column already exists.
--
-- tenant_users.logged_out_at: when the owner pressed "Log out of all devices".
-- A business login (token) issued before that moment is refused, on every device.
-- Empty for everyone until they use the button.
-- ============================================================
ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS logged_out_at timestamptz;
