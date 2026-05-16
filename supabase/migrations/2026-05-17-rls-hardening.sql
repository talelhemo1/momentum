-- R36 — SECURITY HOTFIX: close 3 open-SELECT RLS leaks.
--
-- Before this, short_links / invitation_views / event_memories all had
-- an "anyone reads" policy → ANY anon visitor could enumerate every
-- event's short links, invitation-open analytics (guest names!) and
-- uploaded photos across ALL events. This locks reads down.
--
-- Idempotent — safe to re-run (drop-if-exists + create-or-replace +
-- drop-trigger-if-exists, matching the R30 convention).
--
-- ⚠️ DEPLOY NOTE: lib/shortLinks.ts (R36) calls the new
-- lookup_short_link() RPC but FALLS BACK to a direct select if the RPC
-- is missing, so the code is safe to deploy before OR after this runs.
-- Run it as soon as possible to actually close the leak.

-- ─── 1. short_links — read only via a SECURITY DEFINER RPC ───────────
-- The short id is the capability. We still allow the open INSERT (the
-- invite flow needs it) but resolution now goes through a function so
-- the table itself isn't directly enumerable by anon.
drop policy if exists "anyone reads short links" on short_links;

create or replace function lookup_short_link(p_short_id text)
returns text
language sql
security definer
set search_path = public
as $$
  select long_path from short_links where short_id = p_short_id limit 1;
$$;

grant execute on function lookup_short_link(text) to anon, authenticated;

-- ─── 2. invitation_views — event owner / accepted managers only ─────
drop policy if exists "anyone reads views" on invitation_views;
create policy "event owner reads own views" on invitation_views
  for select using (
    exists (
      select 1 from event_managers em
      where em.event_id = invitation_views.event_id
        and (
          -- Host owns the event the moment they invite anyone — do NOT
          -- gate the host on the *manager's* acceptance status (the
          -- spec's `status='accepted'` here would lock the couple out
          -- of their OWN analytics until a manager accepts).
          em.invited_by = auth.uid()
          -- A manager only sees data once they've accepted.
          or (em.user_id = auth.uid() and em.status = 'accepted')
        )
    )
  );

-- ─── 3. event_memories — event owner / accepted managers only ───────
-- Guests still INSERT (open) but can't read other guests' uploads.
drop policy if exists "anyone reads memories" on event_memories;
create policy "event owner reads memories" on event_memories
  for select using (
    exists (
      select 1 from event_managers em
      where em.event_id = event_memories.event_id
        and (
          em.invited_by = auth.uid()
          or (em.user_id = auth.uid() and em.status = 'accepted')
        )
    )
  );

-- ─── 4. invitation_views insert rate limit (1000 / event / hour) ────
create or replace function check_invitation_views_rate()
returns trigger
language plpgsql
as $$
declare
  cnt int;
begin
  select count(*) into cnt from invitation_views
  where event_id = new.event_id
    and viewed_at > now() - interval '1 hour';
  if cnt > 1000 then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists invitation_views_rate on invitation_views;
create trigger invitation_views_rate
  before insert on invitation_views
  for each row execute function check_invitation_views_rate();
