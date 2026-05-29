-- WhatsApp Business API — RSVP sync, outbound tracking, message log.
-- Run on the client Supabase project before enabling WHATSAPP_* env vars.

-- ── RSVP rows (cross-device + realtime dashboard) ─────────────────────
create table if not exists public.rsvps (
  guest_id text primary key,
  event_id text not null,
  status text not null check (status in ('confirmed', 'declined', 'maybe')),
  attending_count int not null default 1,
  notes text,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rsvps_event_id_idx on public.rsvps (event_id);

alter table public.rsvps enable row level security;

-- Public RSVP page + webhooks upsert (guest_id is an unguessable UUID).
create policy "rsvps_anon_insert"
  on public.rsvps for insert to anon
  with check (true);

create policy "rsvps_anon_update"
  on public.rsvps for update to anon
  using (true);

create policy "rsvps_anon_select"
  on public.rsvps for select to anon
  using (true);

-- Host reads RSVPs for events they own (payload.event.id in app_states).
create policy "rsvps_host_select"
  on public.rsvps for select to authenticated
  using (
    exists (
      select 1 from public.app_states a
      where a.user_id = auth.uid()
        and (a.payload->'event'->>'id') = event_id
    )
  );

-- ── Per-guest WhatsApp RSVP tracking (cron: 48h voice fallback) ───────
create table if not exists public.whatsapp_guest_tracking (
  event_id text not null,
  guest_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_e164 text not null,
  rsvp_sent_at timestamptz,
  rsvp_replied_at timestamptz,
  voice_queued_at timestamptz,
  primary key (event_id, guest_id)
);

create index if not exists whatsapp_guest_tracking_phone_idx
  on public.whatsapp_guest_tracking (phone_e164);

create index if not exists whatsapp_guest_tracking_voice_idx
  on public.whatsapp_guest_tracking (rsvp_sent_at)
  where rsvp_replied_at is null and voice_queued_at is null;

alter table public.whatsapp_guest_tracking enable row level security;

create policy "whatsapp_tracking_host_all"
  on public.whatsapp_guest_tracking
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Outbound message log (support + webhook phone lookup) ─────────────
create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_id text,
  guest_id text,
  vendor_slug text,
  phone_e164 text not null,
  template_name text not null,
  wa_message_id text,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_message_log_phone_idx
  on public.whatsapp_message_log (phone_e164, created_at desc);

alter table public.whatsapp_message_log enable row level security;

create policy "whatsapp_log_host_select"
  on public.whatsapp_message_log for select to authenticated
  using (user_id = auth.uid());

-- Realtime for host dashboard RSVP updates
do $$
begin
  alter publication supabase_realtime add table public.rsvps;
exception when duplicate_object then null;
end$$;

alter table public.rsvps replica identity full;
