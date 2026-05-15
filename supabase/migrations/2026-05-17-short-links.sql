-- R28 — Premium WhatsApp invitation: short links behind /i/<id>.
-- Idempotent — safe to re-run.

create table if not exists short_links (
  short_id text primary key,        -- 6 chars, base56 (no 1lI0O confusion)
  long_path text not null,          -- "/rsvp?d=...&sig=..."
  event_id text not null,
  created_at timestamptz default now()
);

create index if not exists short_links_event_idx on short_links(event_id);

alter table short_links enable row level security;

-- The short id IS the capability (unguessable, 56^6 ≈ 30B). Hosts
-- create them client-side while sending invites; guests resolve them
-- when opening the link — both unauthenticated, so open policies.
drop policy if exists "anyone reads short links" on short_links;
create policy "anyone reads short links" on short_links
  for select using (true);

drop policy if exists "anyone creates short links" on short_links;
create policy "anyone creates short links" on short_links
  for insert with check (true);
