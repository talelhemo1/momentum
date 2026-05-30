-- ─────────────────────────────────────────────────────────────────────────────
-- R94 — event-reminder idempotency log.
-- Run in Supabase SQL Editor.
--
-- Notes on the spec adaptation:
--   The spec asked to add `reminder_7d_sent` / `reminder_1d_sent` COLUMNS
--   to a `guests` table. This project has NO `guests` table — guests live
--   inside the per-user JSON blob in `app_states.payload`. A cron that
--   wrote reminder flags back into that blob would have to read-modify-
--   write the WHOLE payload, racing (and potentially clobbering) edits the
--   user is making in their own session. See lib/sync.ts for the blob's
--   last-write-wins conflict model — exactly the footgun we avoid here.
--
--   Instead, the cron NEVER mutates app_states. It records "sent" rows in
--   this append-only side table, keyed by (user_id, guest_id, kind). The
--   cron reads app_states (read-only), checks this log, sends, and inserts
--   a row. Zero risk to the user's data.
--
--   guest_id is TEXT (not uuid) because guest IDs are app-generated string
--   ids inside the JSON, not auth.users uuids.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_id text not null,
  kind text not null check (kind in ('reminder_7d', 'reminder_1d')),
  sent_at timestamptz not null default now()
);

-- Idempotency: each guest gets each reminder kind at most once. The cron
-- relies on this both as a pre-send filter and as a hard backstop (the
-- INSERT uses ON CONFLICT DO NOTHING).
create unique index if not exists uq_reminder_once
  on public.reminder_log(user_id, guest_id, kind);

create index if not exists idx_reminder_user
  on public.reminder_log(user_id);

-- RLS: deny everything by default. Only the service-role key in
-- /api/cron/event-reminders reads or writes this table.
alter table public.reminder_log enable row level security;
-- No policies on purpose. Service-role key bypasses RLS.
