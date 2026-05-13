-- ──────────────────────────────────────────────────────────────────────────
-- Momentum — Cost Transparency Network (R20 Phase 7).
--
-- Couples submit anonymous price reports after their event. The
-- vendor_cost_stats view aggregates rows with sample_size >= 3 so a
-- single outlier can't move the median.
--
-- No user_id column on vendor_cost_reports → reports are not linkable
-- to a person. reporter_event_id is only used to prevent duplicate
-- submissions from the same event.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists vendor_cost_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  vendor_label text,
  amount_paid integer not null,
  guest_count_band text not null check (guest_count_band in ('<100', '100-200', '200-300', '300-500', '500+')),
  region text not null check (region in ('north', 'tel-aviv', 'jerusalem', 'south', 'center', 'shfela', 'judea-samaria')),
  event_type text not null,
  satisfaction smallint check (satisfaction between 1 and 5),
  reported_at timestamptz default now(),
  reporter_event_id text
);

create index if not exists vcr_lookup on vendor_cost_reports(category, region, guest_count_band);
create unique index if not exists vcr_no_dup on vendor_cost_reports(reporter_event_id, category, vendor_label);

create or replace view vendor_cost_stats as
select
  category,
  region,
  guest_count_band,
  count(*) as sample_size,
  round(avg(amount_paid)::numeric / 100, 0) as avg_amount,
  round(percentile_cont(0.5) within group (order by amount_paid)::numeric / 100, 0) as median_amount,
  round(percentile_cont(0.25) within group (order by amount_paid)::numeric / 100, 0) as p25_amount,
  round(percentile_cont(0.75) within group (order by amount_paid)::numeric / 100, 0) as p75_amount,
  round(avg(satisfaction)::numeric, 1) as avg_satisfaction
from vendor_cost_reports
where satisfaction is not null
group by category, region, guest_count_band
having count(*) >= 3;

alter table vendor_cost_reports enable row level security;

drop policy if exists "anyone submits reports" on vendor_cost_reports;
create policy "anyone submits reports" on vendor_cost_reports
  for insert with check (true);

drop policy if exists "anyone reads reports" on vendor_cost_reports;
create policy "anyone reads reports" on vendor_cost_reports
  for select using (true);

grant select on vendor_cost_stats to anon, authenticated;
