-- R32 — invitation_views: click/open tracking so the couple sees, in
-- real time, who opened their invitation.
--
-- Same open-insert capability model as short_links / event_memories:
-- the guest's browser (anon key, no session) must be able to INSERT a
-- view, and the host's dashboard (also anon) must be able to SELECT the
-- event's views for the realtime feed. No PII is stored raw — the IP is
-- only ever a salted SHA-256 hash (set server-side in the API route).
-- Idempotent — safe to re-run.

create table if not exists invitation_views (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  short_id text,
  guest_id text,
  guest_name text,
  viewed_at timestamptz default now(),
  user_agent text,
  ip_hash text
);

create index if not exists invitation_views_event_idx
  on invitation_views(event_id, viewed_at desc);
create index if not exists invitation_views_guest_idx
  on invitation_views(guest_id);

alter table invitation_views enable row level security;

drop policy if exists "anyone records views" on invitation_views;
create policy "anyone records views"
  on invitation_views for insert with check (true);

drop policy if exists "anyone reads views" on invitation_views;
create policy "anyone reads views"
  on invitation_views for select using (true);

-- R30 lesson: `alter publication … add table` is NOT idempotent and
-- errors on re-run. Guard it the same way 2026-05-17-event-memories.sql
-- now does.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'invitation_views'
  ) then
    alter publication supabase_realtime add table invitation_views;
  end if;
end $$;
