-- ─────────────────────────────────────────────────────────────────────────────
-- Momentum — Cloud Sync Schema
-- Run this once on your Supabase project (SQL Editor → New Query → paste → run)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The single table that stores each user's full app state as JSON.
--    Simple model: one row per user, JSON payload that mirrors AppState.
--    When we need partner sharing later, we'll add a junction table for events.
create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Auto-update the timestamp on every change.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_states_touch_updated_at on public.app_states;
create trigger app_states_touch_updated_at
before update on public.app_states
for each row execute function public.touch_updated_at();

-- 2. Row Level Security: a user can only read/write their own row.
alter table public.app_states enable row level security;

drop policy if exists "Users read own state" on public.app_states;
create policy "Users read own state"
on public.app_states for select
using (auth.uid() = user_id);

drop policy if exists "Users insert own state" on public.app_states;
create policy "Users insert own state"
on public.app_states for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own state" on public.app_states;
create policy "Users update own state"
on public.app_states for update
using (auth.uid() = user_id);

drop policy if exists "Users delete own state" on public.app_states;
create policy "Users delete own state"
on public.app_states for delete
using (auth.uid() = user_id);

-- 3. Optional: enable Realtime so partner-sharing in the future is one flag away.
alter publication supabase_realtime add table public.app_states;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AUTH PROVIDERS
-- ─────────────────────────────────────────────────────────────────────────────
-- In your Supabase dashboard → Authentication → Providers:
--   ✓ Enable Email (already on by default)
--   ✓ Enable Google: add your Google OAuth Client ID & Secret
--   ✓ Enable Apple: add Services ID, Team ID, Key ID, private key
--   ✓ Enable Phone: configure SMS provider (Twilio recommended)
-- Add your dev URL to "Redirect URLs":
--   http://localhost:3030
--   https://your-production-domain.com
-- ─────────────────────────────────────────────────────────────────────────────
