-- R30 — security/abuse hardening for the open-INSERT tables added in
-- R27/R28 (short_links, event_memories) + the public memories bucket.
-- Clones the R14 per-actor hourly rate-limit trigger pattern.
-- Idempotent — safe to re-run.

-- ─── 1. short_links: dedupe + uniqueness + insert rate limit ──────────

-- Collapse any duplicate (event_id, long_path) rows created before the
-- app-side dedupe (R30 lib/shortLinks.ts) — keep the earliest short id.
delete from short_links a
using short_links b
where a.event_id = b.event_id
  and a.long_path = b.long_path
  and a.created_at > b.created_at;

create unique index if not exists short_links_event_path_uk
  on short_links(event_id, long_path);

create table if not exists short_links_rate (
  event_id text not null,
  hour_bucket timestamptz not null,
  count int not null default 0,
  primary key (event_id, hour_bucket)
);

create or replace function check_short_link_rate()
returns trigger
language plpgsql
as $$
declare
  bucket timestamptz := date_trunc('hour', now());
  current_count int;
begin
  insert into short_links_rate(event_id, hour_bucket, count)
  values (new.event_id, bucket, 1)
  on conflict (event_id, hour_bucket)
  do update set count = short_links_rate.count + 1
  returning count into current_count;
  -- A wedding has a few hundred guests; 600/event/hour is generous for
  -- a legit batch send while stopping unbounded scripted bloat.
  if current_count > 600 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists short_links_rate_check on short_links;
create trigger short_links_rate_check
  before insert on short_links
  for each row execute function check_short_link_rate();

-- ─── 2. event_memories: per-event insert rate limit ──────────────────

create table if not exists event_memories_rate (
  event_id text not null,
  hour_bucket timestamptz not null,
  count int not null default 0,
  primary key (event_id, hour_bucket)
);

create or replace function check_event_memory_rate()
returns trigger
language plpgsql
as $$
declare
  bucket timestamptz := date_trunc('hour', now());
  current_count int;
begin
  insert into event_memories_rate(event_id, hour_bucket, count)
  values (new.event_id, bucket, 1)
  on conflict (event_id, hour_bucket)
  do update set count = event_memories_rate.count + 1
  returning count into current_count;
  -- 300 photo rows/event/hour: very generous for a real party, caps a
  -- script flooding the table / public bucket.
  if current_count > 300 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists event_memories_rate_check on event_memories;
create trigger event_memories_rate_check
  before insert on event_memories
  for each row execute function check_event_memory_rate();

-- ─── 3. event-memories bucket: size + mime caps ──────────────────────
-- Client compresses to JPEG ≤1280px (~<1MB); 8MB hard cap + image-only
-- so the open-insert public bucket can't host arbitrary large files.
update storage.buckets
  set file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'event-memories';
