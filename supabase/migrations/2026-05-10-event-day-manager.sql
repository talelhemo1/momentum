-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Live — event-day manager system (R20, Phase 1)
--
-- Three tables:
--   event_managers   — who runs the event for the couple
--   guest_arrivals   — real-time check-ins at the door
--   manager_actions  — audit log for everything a manager does
--
-- Every table is RLS-protected. Couple sees their own event; managers see
-- only the events they were invited to.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists event_managers (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) not null,
  invitee_phone text not null,
  invitee_name text not null,
  role text not null default 'general' check (role in ('general', 'door', 'floor', 'vip', 'kids', 'vendor')),
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  invitation_token text not null unique,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists event_managers_event_idx on event_managers(event_id, status);

create table if not exists guest_arrivals (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  guest_id text not null,
  arrived_at timestamptz default now(),
  marked_by uuid references auth.users(id) not null,
  plus_ones int default 0,
  notes text
);

-- One arrival row per (event, guest) — a re-scan just no-ops.
create unique index if not exists guest_arrivals_unique on guest_arrivals(event_id, guest_id);
create index if not exists guest_arrivals_event_idx on guest_arrivals(event_id, arrived_at desc);

create table if not exists manager_actions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  manager_id uuid references event_managers(id),
  action_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

create index if not exists manager_actions_event_idx on manager_actions(event_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table event_managers enable row level security;
alter table guest_arrivals enable row level security;
alter table manager_actions enable row level security;

-- Policies are re-runnable: drop + recreate (Postgres lacks "if not exists" here).
drop policy if exists "couple sees own event managers" on event_managers;
create policy "couple sees own event managers" on event_managers
  for select using (auth.uid() = invited_by);

drop policy if exists "couple manages own event managers" on event_managers;
create policy "couple manages own event managers" on event_managers
  for insert with check (auth.uid() = invited_by);

drop policy if exists "couple updates own event managers" on event_managers;
create policy "couple updates own event managers" on event_managers
  for update using (auth.uid() = invited_by);

drop policy if exists "manager sees own invitation" on event_managers;
create policy "manager sees own invitation" on event_managers
  for select using (auth.uid() = user_id);

drop policy if exists "manager accepts own invitation" on event_managers;
create policy "manager accepts own invitation" on event_managers
  for update using (auth.uid() = user_id);

drop policy if exists "managers + couple see arrivals" on guest_arrivals;
create policy "managers + couple see arrivals" on guest_arrivals
  for select using (
    exists(
      select 1 from event_managers em
      where em.event_id = guest_arrivals.event_id
        and (em.user_id = auth.uid() or em.invited_by = auth.uid())
    )
  );

drop policy if exists "managers mark arrivals" on guest_arrivals;
create policy "managers mark arrivals" on guest_arrivals
  for insert with check (
    exists(
      select 1 from event_managers em
      where em.event_id = guest_arrivals.event_id
        and em.user_id = auth.uid()
        and em.status = 'accepted'
    )
  );

drop policy if exists "couple + managers see actions" on manager_actions;
create policy "couple + managers see actions" on manager_actions
  for select using (
    exists(
      select 1 from event_managers em
      where em.event_id = manager_actions.event_id
        and (em.user_id = auth.uid() or em.invited_by = auth.uid())
    )
  );

drop policy if exists "managers log actions" on manager_actions;
create policy "managers log actions" on manager_actions
  for insert with check (
    exists(
      select 1 from event_managers em
      where em.event_id = manager_actions.event_id
        and em.user_id = auth.uid()
        and em.status = 'accepted'
    )
  );
