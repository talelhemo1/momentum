-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Live — Phase 3
-- Enable Supabase Realtime on the live-event tables so the manager dashboard
-- can subscribe to INSERTs instead of polling every 5s. Replaces the polling
-- loop in app/manage/[eventId]/page.tsx.
--
-- Note: alter publication add table is NOT idempotent in older Postgres
-- versions; running it twice raises a duplicate_object error. Wrap in a
-- DO block that swallows that specific error so re-running the migration
-- is safe.
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table guest_arrivals;
exception when duplicate_object then null;
end$$;

do $$
begin
  alter publication supabase_realtime add table manager_actions;
exception when duplicate_object then null;
end$$;

do $$
begin
  alter publication supabase_realtime add table event_managers;
exception when duplicate_object then null;
end$$;

-- REPLICA IDENTITY FULL means the WAL row carries every column, not just
-- primary keys. Without it, UPDATE events arrive with only the PK + changed
-- columns — fine for our INSERT-only flows today but cheap insurance for
-- the future (e.g. event_managers UPDATE when a manager accepts).
alter table guest_arrivals replica identity full;
alter table manager_actions replica identity full;
alter table event_managers replica identity full;
