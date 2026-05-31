-- ─────────────────────────────────────────────────────────────────────────────
-- R98 — Bulletproof seating-notifications system.
-- Run in the Supabase SQL Editor (client project) before enabling the
-- NEXT_PUBLIC_TWILIO_TEMPLATE_EVENT_SEATING_SID env var.
--
-- ───────────────── Spec adaptation (READ THIS) ─────────────────
-- The original spec assumed normalized `events` and `guests` tables with a
-- `guests.table_number` column and a DB trigger that revokes table approvals
-- when an assignment changes. THIS PROJECT HAS NEITHER TABLE: the entire user
-- state (event, guests, tables, seatAssignments) lives in a single JSON blob
-- in `public.app_states.payload` (jsonb), keyed by `user_id = auth.uid()`.
-- Guest/event ids are app-generated TEXT, not auth uuids.
--
-- Consequences for this migration:
--   • event_id / guest_id are TEXT (matching public.rsvps + reminder_log).
--   • Ownership is carried by `user_id uuid references auth.users` on every
--     row (matching whatsapp_guest_tracking) — there is no events.owner_id.
--   • There is NO `guests` table to attach an "auto-revoke on assignment
--     change" trigger to. That guarantee is enforced in APPLICATION code
--     instead: /api/seating/preview and /api/seating/send recompute each
--     table's guest set from the CURRENT app_states payload and compare it to
--     the locked snapshot; any table whose membership changed is marked
--     `revoked` server-side before a send can proceed. See lib/seating-server.ts.
--   • All writes happen server-side via the service-role key (which bypasses
--     RLS). RLS here only grants the signed-in host SELECT on their own rows,
--     so the dashboard wizard can read state and subscribe via Realtime.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Send session — a frozen snapshot of the guest list at "lock" time. One
--    ACTIVE session per event (enforced by the partial unique index below);
--    cancelled/completed sessions don't block a fresh lock.
create table if not exists public.seating_send_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  locked_at timestamptz not null default now(),
  reception_time text not null,            -- "19:00" (host-entered; EventInfo has no time field)
  venue text not null,                     -- "אולם הגן · תל אביב"
  guest_snapshot jsonb not null,           -- guests + their table at lock time
  table_snapshot jsonb not null,           -- tables (id, number, name, capacity) at lock time
  status text not null default 'locked'
    check (status in ('locked', 'approved', 'sending', 'completed', 'cancelled')),
  total_guests int not null,
  total_tables int not null,
  sent_count int not null default 0,
  failed_count int not null default 0,
  completed_at timestamptz
);

-- One active session per event. A partial unique index is correct here; the
-- spec's `UNIQUE(event_id, status)` would have allowed one row PER status
-- (so two "cancelled" rows would collide while two "locked" wouldn't be
-- blocked against an "approved" of the same event). We want: at most one row
-- in any of the live states per event.
create unique index if not exists uq_seating_active_session
  on public.seating_send_sessions (event_id)
  where status in ('locked', 'approved', 'sending');

create index if not exists idx_seating_sessions_user
  on public.seating_send_sessions (user_id, status);

-- 2. Per-table human approval. A table can only be approved when it passes
--    validation (no blocking errors). `guest_snapshot` records exactly who was
--    in the table at approval time so we can detect drift later.
create table if not exists public.seating_table_approvals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.seating_send_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_number int not null,
  table_name text,
  guest_count int not null,
  guest_snapshot jsonb not null,
  validation_result jsonb not null,
  approved_at timestamptz not null default now(),
  status text not null default 'approved'
    check (status in ('approved', 'revoked')),
  unique (session_id, table_number)
);

create index if not exists idx_seating_approvals_session
  on public.seating_table_approvals (session_id, status);

-- 3. One queued message per guest. The UNIQUE(session_id, guest_id) is the
--    hard anti-duplicate backstop: a guest can have at most one notification
--    row per session, so no double-send is possible even under concurrent
--    worker runs (cron + the dashboard's live pump).
create table if not exists public.seating_notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.seating_send_sessions (id) on delete cascade,
  event_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  guest_id text not null,
  guest_name text not null,
  guest_phone text not null,
  table_number int not null,
  template_sid text not null,
  template_variables jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'retrying')),
  attempts int not null default 0,
  -- Earliest time the worker may (re)claim this row. Drives exponential
  -- backoff between retries; null = claimable immediately.
  next_attempt_at timestamptz,
  twilio_message_sid text,
  error_code text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  unique (session_id, guest_id)
);

create index if not exists idx_seating_notif_claim
  on public.seating_notifications (session_id, status, next_attempt_at);
create index if not exists idx_seating_notif_user
  on public.seating_notifications (user_id);

-- 4. RLS — host can READ their own rows (for the wizard + Realtime). All
--    writes are server-side via the service-role key, which bypasses RLS, so
--    no insert/update/delete policies are defined on purpose.
alter table public.seating_send_sessions enable row level security;
alter table public.seating_table_approvals enable row level security;
alter table public.seating_notifications enable row level security;

create policy "seating_sessions_host_select"
  on public.seating_send_sessions for select to authenticated
  using (user_id = auth.uid());

create policy "seating_approvals_host_select"
  on public.seating_table_approvals for select to authenticated
  using (user_id = auth.uid());

create policy "seating_notifications_host_select"
  on public.seating_notifications for select to authenticated
  using (user_id = auth.uid());

-- 5. Realtime — the dashboard wizard subscribes to live progress + approval
--    revocations. Mirror the public.rsvps setup (add to publication + full
--    replica identity so UPDATE payloads carry the changed row).
do $$
begin
  alter publication supabase_realtime add table public.seating_notifications;
exception when duplicate_object then null;
end$$;

do $$
begin
  alter publication supabase_realtime add table public.seating_table_approvals;
exception when duplicate_object then null;
end$$;

alter table public.seating_notifications replica identity full;
alter table public.seating_table_approvals replica identity full;
