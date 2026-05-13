-- ──────────────────────────────────────────────────────────────────────────
-- R12 — vendor review + analytics security hardening (2026-05-13).
--
-- Closes four vulnerabilities flagged in the R12 audit:
--   (B) vendor_review_responses — anyone could fake a vendor's reply
--       because RLS only checked `auth.uid() = vendor_user_id` without
--       proving that user actually owns the vendor being reviewed.
--   (C) vendor_cost_reports — accepted anonymous submissions with no
--       rate limit; one user could flood with fake "transparency" data.
--   (D) vendor_page_views + vendor_page_actions — SELECT was open to all.
--   (E) vendor_reviews — INSERT accepted any vendor_id, including ones
--       that don't exist in vendor_landings.
--
-- Also adds missing WITH CHECK to UPDATE policies on vendor_landings,
-- vendor_reviews, event_managers (UPDATE without WITH CHECK lets a row
-- be rewritten to a state the user could not have INSERTed).
-- ──────────────────────────────────────────────────────────────────────────

-- ─── (B) vendor_review_responses — tie responder to vendor ────────────
-- Pattern: vendor_reviews.vendor_id matches vendor_landings.slug, and
-- only the landing's owner_user_id can respond.

drop policy if exists "vendor responds to own reviews" on vendor_review_responses;
create policy "vendor responds to own reviews" on vendor_review_responses
  for insert with check (
    auth.uid() = vendor_user_id
    and exists (
      select 1
      from vendor_reviews vr
      join vendor_landings vl on vl.slug = vr.vendor_id
      where vr.id = vendor_review_responses.review_id
        and vl.owner_user_id = auth.uid()
    )
  );

drop policy if exists "vendor updates own response" on vendor_review_responses;
create policy "vendor updates own response" on vendor_review_responses
  for update
    using (auth.uid() = vendor_user_id)
    with check (
      auth.uid() = vendor_user_id
      and exists (
        select 1
        from vendor_reviews vr
        join vendor_landings vl on vl.slug = vr.vendor_id
        where vr.id = vendor_review_responses.review_id
          and vl.owner_user_id = auth.uid()
      )
    );

-- ─── (E) vendor_reviews — INSERT must target a real published landing ──

drop policy if exists "users write own reviews" on vendor_reviews;
create policy "users write own reviews" on vendor_reviews
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from vendor_landings
      where slug = vendor_reviews.vendor_id
        and landing_published = true
    )
  );

-- UPDATE policy was missing WITH CHECK.
drop policy if exists "users update own reviews" on vendor_reviews;
create policy "users update own reviews" on vendor_reviews
  for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ─── UPDATE policies missing WITH CHECK — same fix, several tables ────

drop policy if exists "couple updates own event managers" on event_managers;
create policy "couple updates own event managers" on event_managers
  for update
    using (auth.uid() = invited_by)
    with check (auth.uid() = invited_by);

drop policy if exists "manager accepts own invitation" on event_managers;
create policy "manager accepts own invitation" on event_managers
  for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "owner updates landing" on vendor_landings;
create policy "owner updates landing" on vendor_landings
  for update
    using (auth.uid() = owner_user_id)
    with check (auth.uid() = owner_user_id);

-- ─── (C) vendor_cost_reports — require auth + dedupe ──────────────────

alter table vendor_cost_reports
  add column if not exists submitted_by_user_id uuid references auth.users(id) on delete cascade;

drop policy if exists "anyone submits reports" on vendor_cost_reports;
create policy "auth users submit reports" on vendor_cost_reports
  for insert with check (
    auth.uid() is not null
    and auth.uid() = submitted_by_user_id
  );

-- One report per user per (category, region, guest band) — caps the
-- pollution attack at one row per category instead of 1000.
create unique index if not exists vcr_user_dedupe
  on vendor_cost_reports(submitted_by_user_id, category, region, guest_count_band);

-- ─── (D) vendor_page_views + vendor_page_actions — owner-only SELECT ──

drop policy if exists "anyone reads views" on vendor_page_views;
create policy "owner reads own page views" on vendor_page_views
  for select using (
    exists(
      select 1 from vendor_landings
      where vendor_landings.id::text = vendor_page_views.vendor_id
        and owner_user_id = auth.uid()
    )
    or exists(
      select 1 from vendor_landings
      where slug = vendor_page_views.vendor_id
        and owner_user_id = auth.uid()
    )
  );

drop policy if exists "anyone reads actions" on vendor_page_actions;
create policy "owner reads own page actions" on vendor_page_actions
  for select using (
    exists(
      select 1 from vendor_landings
      where vendor_landings.id::text = vendor_page_actions.vendor_id
        and owner_user_id = auth.uid()
    )
    or exists(
      select 1 from vendor_landings
      where slug = vendor_page_actions.vendor_id
        and owner_user_id = auth.uid()
    )
  );

-- Server-side rate limit on the open INSERT path. We bucket by hour;
-- the trigger silently drops (returns NULL) anything past 50 inserts
-- per vendor per hour, which is the soft ceiling we want for hot pages
-- without blocking real visitors.
create table if not exists vendor_page_views_rate (
  vendor_id text not null,
  hour_bucket timestamptz not null,
  count int not null default 0,
  primary key (vendor_id, hour_bucket)
);

create or replace function check_page_view_rate()
returns trigger
language plpgsql
as $$
declare
  bucket timestamptz := date_trunc('hour', now());
  current_count int;
begin
  insert into vendor_page_views_rate(vendor_id, hour_bucket, count)
  values (new.vendor_id, bucket, 1)
  on conflict (vendor_id, hour_bucket)
  do update set count = vendor_page_views_rate.count + 1
  returning count into current_count;

  if current_count > 50 then
    -- Silently drop. The page render doesn't depend on this insert.
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_page_views_rate_check on vendor_page_views;
create trigger vendor_page_views_rate_check
  before insert on vendor_page_views
  for each row execute function check_page_view_rate();
