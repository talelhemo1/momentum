-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Vendor Reviews (R20 Phase 8).
--
-- vendor_reviews            — one row per (vendor, user, event)
-- vendor_review_responses   — vendor's reply, 1:1 with a review
-- vendor_review_helpful     — "this review was helpful" votes
-- vendor_review_stats VIEW  — aggregates for the rating summary card
--
-- Money in agorot (integer). Photos live in the public `vendor-reviews`
-- storage bucket — paths look like `<user_uuid>/<vendor_id>/<timestamp>-<name>`.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists vendor_reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_id text not null,
  vendor_name text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  event_id text not null,
  event_date date,

  overall_rating smallint not null check (overall_rating between 1 and 5),
  quality_rating smallint check (quality_rating between 1 and 5),
  value_rating smallint check (value_rating between 1 and 5),
  communication_rating smallint check (communication_rating between 1 and 5),
  punctuality_rating smallint check (punctuality_rating between 1 and 5),

  title text,
  review_text text,
  highlights text[] default '{}',
  concerns text[] default '{}',

  agreed_price integer,
  initial_quote integer,

  would_recommend boolean,
  recommend_tags text[] default '{}',

  photo_paths text[] default '{}',
  quote_document_path text,

  is_verified boolean default true,
  is_published boolean default true,
  helpful_count integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vendor_reviews_lookup on vendor_reviews(vendor_id, created_at desc);
create unique index if not exists vendor_reviews_unique on vendor_reviews(vendor_id, user_id, event_id);

create table if not exists vendor_review_responses (
  review_id uuid primary key references vendor_reviews(id) on delete cascade,
  vendor_user_id uuid references auth.users(id) not null,
  response_text text not null,
  responded_at timestamptz default now()
);

create table if not exists vendor_review_helpful (
  review_id uuid references vendor_reviews(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (review_id, user_id),
  marked_at timestamptz default now()
);

create or replace view vendor_review_stats as
select
  vendor_id,
  count(*) as total_reviews,
  round(avg(overall_rating)::numeric, 1) as avg_rating,
  round(avg(quality_rating)::numeric, 1) as avg_quality,
  round(avg(value_rating)::numeric, 1) as avg_value,
  round(avg(communication_rating)::numeric, 1) as avg_communication,
  round(avg(punctuality_rating)::numeric, 1) as avg_punctuality,
  count(*) filter (where would_recommend = true) as recommend_count,
  case when count(*) > 0
    then round(100.0 * count(*) filter (where would_recommend = true) / count(*), 0)
    else 0
  end as recommend_percent,
  count(*) filter (where overall_rating = 5) as count_5,
  count(*) filter (where overall_rating = 4) as count_4,
  count(*) filter (where overall_rating = 3) as count_3,
  count(*) filter (where overall_rating = 2) as count_2,
  count(*) filter (where overall_rating = 1) as count_1
from vendor_reviews
where is_published = true
group by vendor_id;

insert into storage.buckets (id, name, public)
values ('vendor-reviews', 'vendor-reviews', true)
on conflict (id) do nothing;

alter table vendor_reviews enable row level security;
alter table vendor_review_responses enable row level security;
alter table vendor_review_helpful enable row level security;

drop policy if exists "anyone reads published reviews" on vendor_reviews;
create policy "anyone reads published reviews" on vendor_reviews
  for select using (is_published = true);

drop policy if exists "users write own reviews" on vendor_reviews;
create policy "users write own reviews" on vendor_reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "users update own reviews" on vendor_reviews;
create policy "users update own reviews" on vendor_reviews
  for update using (auth.uid() = user_id);

drop policy if exists "users delete own reviews" on vendor_reviews;
create policy "users delete own reviews" on vendor_reviews
  for delete using (auth.uid() = user_id);

drop policy if exists "anyone reads responses" on vendor_review_responses;
create policy "anyone reads responses" on vendor_review_responses
  for select using (true);

drop policy if exists "vendor responds to own reviews" on vendor_review_responses;
create policy "vendor responds to own reviews" on vendor_review_responses
  for insert with check (auth.uid() = vendor_user_id);

drop policy if exists "vendor updates own response" on vendor_review_responses;
create policy "vendor updates own response" on vendor_review_responses
  for update using (auth.uid() = vendor_user_id);

drop policy if exists "anyone reads helpful" on vendor_review_helpful;
create policy "anyone reads helpful" on vendor_review_helpful
  for select using (true);

drop policy if exists "users mark helpful" on vendor_review_helpful;
create policy "users mark helpful" on vendor_review_helpful
  for insert with check (auth.uid() = user_id);

drop policy if exists "users unmark own" on vendor_review_helpful;
create policy "users unmark own" on vendor_review_helpful
  for delete using (auth.uid() = user_id);

drop policy if exists "anyone reads review media" on storage.objects;
create policy "anyone reads review media" on storage.objects
  for select using (bucket_id = 'vendor-reviews');

drop policy if exists "users upload own review media" on storage.objects;
create policy "users upload own review media" on storage.objects
  for insert with check (
    bucket_id = 'vendor-reviews' and auth.uid()::text = (storage.foldername(name))[1]
  );

grant select on vendor_review_stats to anon, authenticated;
