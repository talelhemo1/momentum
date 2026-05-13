-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Live — accept-invitation RPC (R20, Phase 2 fix).
--
-- The original RLS policy on event_managers lets a manager SELECT/UPDATE
-- their own row by user_id == auth.uid(). But on the first visit to
-- /manage/accept the row's user_id is still null — so both reads and the
-- accept update silently return 0 rows. These two RPCs (both
-- `security definer`) bypass RLS in a controlled way: a possessor of the
-- secret invitation_token can look up the public-safe fields and accept.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_manager_invitation(p_token text)
returns table (
  event_id text,
  invitee_name text,
  role text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select event_id, invitee_name, role, status
  from event_managers
  where invitation_token = p_token
  limit 1;
$$;

create or replace function accept_manager_invitation(p_token text)
returns table (event_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text;
  v_status text;
begin
  select em.event_id, em.status into v_event_id, v_status
  from event_managers em
  where em.invitation_token = p_token;

  if v_event_id is null then
    raise exception 'invitation_not_found';
  end if;

  if v_status = 'accepted' then
    -- Idempotent: re-clicking the link after acceptance just returns the id.
    return query select v_event_id;
    return;
  end if;

  if v_status = 'declined' then
    raise exception 'invitation_declined';
  end if;

  update event_managers
  set
    user_id = auth.uid(),
    status = 'accepted',
    accepted_at = now()
  where invitation_token = p_token
    and status = 'invited';

  return query select v_event_id;
end;
$$;

grant execute on function get_manager_invitation(text) to anon, authenticated;
grant execute on function accept_manager_invitation(text) to authenticated;
