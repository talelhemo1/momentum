-- R14.2 — Security hardening: WITH CHECK clauses, case-insensitive admin
-- gate, and rate limiting on the open analytics insert path.
--
-- Background: the security audit flagged several `FOR ALL USING (...)`
-- policies without companion `WITH CHECK` clauses. In Postgres RLS,
-- `USING` is consulted on rows being read; `WITH CHECK` is consulted on
-- rows being written (INSERT / UPDATE). A `FOR ALL USING (auth.uid() =
-- user_id)` policy with NO `WITH CHECK` lets an authenticated user
-- INSERT a row with `user_id = '<victim-uuid>'` — the new row never
-- needs to pass any check, so the victim's ledger gets poisoned.
--
-- This migration is idempotent — safe to re-run.

-- ─── 1. event_receipts: split FOR ALL into per-action policies ──────────
-- The old policy was `for all using (auth.uid() = user_id)`. INSERT
-- with arbitrary user_id was unchecked. UPDATE could rewrite user_id
-- to someone else's.
drop policy if exists "users own receipts" on event_receipts;
drop policy if exists "receipts owner select" on event_receipts;
drop policy if exists "receipts owner insert" on event_receipts;
drop policy if exists "receipts owner update" on event_receipts;
drop policy if exists "receipts owner delete" on event_receipts;

create policy "receipts owner select" on event_receipts
  for select using (auth.uid() = user_id);

create policy "receipts owner insert" on event_receipts
  for insert with check (auth.uid() = user_id);

create policy "receipts owner update" on event_receipts
  for update using (auth.uid() = user_id)
              with check (auth.uid() = user_id);

create policy "receipts owner delete" on event_receipts
  for delete using (auth.uid() = user_id);

-- ─── 2. payment_schedule: same fix, gated by parent receipt ────────────
drop policy if exists "users own schedule" on payment_schedule;
drop policy if exists "schedule owner select" on payment_schedule;
drop policy if exists "schedule owner insert" on payment_schedule;
drop policy if exists "schedule owner update" on payment_schedule;
drop policy if exists "schedule owner delete" on payment_schedule;

create policy "schedule owner select" on payment_schedule
  for select using (
    exists (
      select 1 from event_receipts r
      where r.id = payment_schedule.receipt_id and r.user_id = auth.uid()
    )
  );

create policy "schedule owner insert" on payment_schedule
  for insert with check (
    exists (
      select 1 from event_receipts r
      where r.id = payment_schedule.receipt_id and r.user_id = auth.uid()
    )
  );

create policy "schedule owner update" on payment_schedule
  for update using (
    exists (
      select 1 from event_receipts r
      where r.id = payment_schedule.receipt_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from event_receipts r
      where r.id = payment_schedule.receipt_id and r.user_id = auth.uid()
    )
  );

create policy "schedule owner delete" on payment_schedule
  for delete using (
    exists (
      select 1 from event_receipts r
      where r.id = payment_schedule.receipt_id and r.user_id = auth.uid()
    )
  );

-- ─── 3. vendor_applications admin update: add WITH CHECK ────────────────
-- The audit flagged a UPDATE policy with `using` but no `with check`,
-- letting an admin (or someone with a stolen admin JWT) rewrite rows
-- into arbitrary shapes including changing the application id.
-- Also, the admin check compared raw email strings — provider-supplied
-- JWT emails can be mixed-case, while DB emails are stored lowercase,
-- creating both lockout AND bypass surface. Switch to lower() on both
-- sides for a stable comparison.
drop policy if exists "admin reads applications" on vendor_applications;
drop policy if exists "admin updates applications" on vendor_applications;

create policy "admin reads applications" on vendor_applications
  for select using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      select lower(email) from admin_emails
    )
  );

create policy "admin updates applications" on vendor_applications
  for update using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      select lower(email) from admin_emails
    )
  ) with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      select lower(email) from admin_emails
    )
  );

-- ─── 4. vendor_page_actions: clone the rate-limit trigger ──────────────
-- Same threat model as vendor_page_views: the INSERT path is open to
-- anonymous, so without a per-vendor-per-hour cap an attacker can
-- inflate engagement stats on competing vendors or balloon table size.
-- The vendor_page_views_rate table is shared (separate bucket per
-- table not strictly needed — both feed dashboard counts that already
-- look at action_type).
create table if not exists vendor_page_actions_rate (
  vendor_id text not null,
  hour_bucket timestamptz not null,
  count int not null default 0,
  primary key (vendor_id, hour_bucket)
);

create or replace function check_page_action_rate()
returns trigger
language plpgsql
as $$
declare
  bucket timestamptz := date_trunc('hour', now());
  current_count int;
begin
  insert into vendor_page_actions_rate(vendor_id, hour_bucket, count)
  values (new.vendor_id, bucket, 1)
  on conflict (vendor_id, hour_bucket)
  do update set count = vendor_page_actions_rate.count + 1
  returning count into current_count;

  -- 200/hour is more generous than views (50/hour) because legit power
  -- users click multiple actions per visit (whatsapp + phone + gallery).
  if current_count > 200 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_page_actions_rate_check on vendor_page_actions;
create trigger vendor_page_actions_rate_check
  before insert on vendor_page_actions
  for each row execute function check_page_action_rate();

-- ─── 5. vendor_leads: per-user lead-creation rate limit ────────────────
-- The audit flagged the lead endpoint as a free outbound SMS/email
-- vector if an attacker scripts inserts across every vendor in the
-- catalog. Cap at 30 lead creations per user per hour. The unique
-- constraint already blocks repeated leads to the SAME vendor; this
-- adds the missing axis.
create table if not exists vendor_leads_rate (
  couple_user_id uuid not null,
  hour_bucket timestamptz not null,
  count int not null default 0,
  primary key (couple_user_id, hour_bucket)
);

create or replace function check_vendor_lead_rate()
returns trigger
language plpgsql
as $$
declare
  bucket timestamptz := date_trunc('hour', now());
  current_count int;
begin
  if new.couple_user_id is null then
    return new; -- shouldn't happen, but don't divide by zero
  end if;
  insert into vendor_leads_rate(couple_user_id, hour_bucket, count)
  values (new.couple_user_id, bucket, 1)
  on conflict (couple_user_id, hour_bucket)
  do update set count = vendor_leads_rate.count + 1
  returning count into current_count;

  if current_count > 30 then
    raise exception 'Rate limit: too many leads from this user'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_leads_rate_check on vendor_leads;
create trigger vendor_leads_rate_check
  before insert on vendor_leads
  for each row execute function check_vendor_lead_rate();
