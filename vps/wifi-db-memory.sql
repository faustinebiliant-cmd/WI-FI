-- ============================================================
-- Oswagolink - give PostgreSQL the memory the VPS really has (phase 7)
-- Sized for the KVM 1 VPS: 3.8 GB RAM, shared with the backend and Nginx.
-- (After an upgrade to a bigger VPS, these numbers can grow: ask first.)
-- Run once on the VPS:
--   sudo -u postgres psql -v ON_ERROR_STOP=1 < vps/wifi-db-memory.sql
--   sudo systemctl restart postgresql && pm2 restart wifi-backend
-- Safe to run twice. Undo one with: ALTER SYSTEM RESET <name>;  then restart PostgreSQL.
-- ============================================================

-- Data kept in PostgreSQL's own memory (factory setting: 128 MB). About 20% of RAM.
ALTER SYSTEM SET shared_buffers = '768MB';

-- Tells the planner how much the system as a whole keeps in memory (PostgreSQL plus
-- Linux's file cache), so it prefers the indexes. It reserves nothing.
ALTER SYSTEM SET effective_cache_size = '2GB';

-- Memory per sort or join inside one request (factory: 4 MB)
ALTER SYSTEM SET work_mem = '8MB';

-- Memory for maintenance: the nightly clean-up's vacuum, index building (factory: 64 MB)
ALTER SYSTEM SET maintenance_work_mem = '128MB';

-- The VPS has an SSD: reading a random page costs about the same as the next one,
-- so indexes are used more readily (factory value 4 is for spinning disks)
ALTER SYSTEM SET random_page_cost = 1.1;

\echo 'Done. Now restart PostgreSQL: sudo systemctl restart postgresql && pm2 restart wifi-backend'
