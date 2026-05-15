-- R27 — Momentum Live Phase 3: Memory Album.
-- Idempotent — safe to re-run.

create table if not exists event_memories (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  uploaded_by_name text,
  message text,
  storage_path text not null,
  created_at timestamptz default now()
);

create index if not exists event_memories_event_idx
  on event_memories(event_id, created_at desc);

alter table event_memories enable row level security;

-- "Anyone with the live link" can contribute + view. Guests are
-- unauthenticated kiosk users, so the policies are intentionally open
-- (the link itself is the capability). storage_path is server-shaped
-- as `<event_id>/<uuid>.<ext>` so one event can't read another's path
-- by guessing — the table scoping by event_id is the real boundary.
drop policy if exists "anyone with link uploads memories" on event_memories;
create policy "anyone with link uploads memories" on event_memories
  for insert with check (true);

drop policy if exists "anyone with link reads memories" on event_memories;
create policy "anyone with link reads memories" on event_memories
  for select using (true);

-- Public bucket so kiosk <img> tags render without signed URLs.
insert into storage.buckets (id, name, public)
values ('event-memories', 'event-memories', true)
on conflict (id) do nothing;

-- Storage RLS: open insert/select on the bucket (link = capability).
drop policy if exists "event-memories public insert" on storage.objects;
create policy "event-memories public insert" on storage.objects
  for insert with check (bucket_id = 'event-memories');

drop policy if exists "event-memories public read" on storage.objects;
create policy "event-memories public read" on storage.objects
  for select using (bucket_id = 'event-memories');

-- Realtime so the kiosk feed slides new uploads in live.
-- R30 — `alter publication ... add table` is NOT idempotent (re-running
-- throws "already member"), which contradicted this file's "safe to
-- re-run" header. Guarded so re-runs are truly no-ops.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_memories'
  ) then
    alter publication supabase_realtime add table event_memories;
  end if;
end $$;
