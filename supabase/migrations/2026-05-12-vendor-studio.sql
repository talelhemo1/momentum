-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Vendor Studio (R20 Phase 9).
--
-- The spec was written assuming a `vendors` table exists in Supabase. The
-- project's vendor catalog lives in `lib/vendors.ts` (static, build-time)
-- + `vendor_applications` (onboarding pipeline). Neither is the right
-- shape for landing-page data.
--
-- Instead we build a NEW self-contained `vendor_landings` table keyed by
-- a public slug + owner uuid. Every approved vendor creates one through
-- /dashboard/vendor-studio.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists vendor_landings (
  id uuid primary key default gen_random_uuid(),
  -- Public-facing URL token: /vendor/<slug>. Unique across all vendors.
  slug text unique,
  owner_user_id uuid references auth.users(id) on delete cascade not null,

  name text not null,
  category text,
  city text,
  phone text,
  email text,
  website text,
  instagram text,
  facebook text,

  tagline text,
  about_long text,
  description text,

  hero_photo_path text,
  gallery_paths text[] default '{}',
  video_url text,

  service_areas text[] default '{}',
  price_range text check (price_range in ('budget', 'mid', 'premium', 'luxury')),
  years_experience int,
  languages text[] default '{}',
  certifications text[] default '{}',

  landing_template text default 'luxurious' check (landing_template in ('luxurious', 'modern', 'rustic')),
  landing_published boolean default false,
  featured boolean default false,

  landing_updated_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists vendor_landings_slug_idx on vendor_landings(slug);
create index if not exists vendor_landings_owner_idx on vendor_landings(owner_user_id);

-- Slug generation: kebab-case the name, fall back to "vendor", append a
-- counter if a clash exists for a different row.
create or replace function generate_vendor_slug(p_name text, p_landing_id uuid)
returns text
language plpgsql
as $$
declare
  base_slug text;
  final_slug text;
  counter int := 0;
begin
  base_slug := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9א-ת]+', '-', 'g'));
  base_slug := substring(base_slug from 1 for 50);
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'vendor';
  end if;

  final_slug := base_slug;
  while exists(
    select 1 from vendor_landings
    where slug = final_slug
      and (p_landing_id is null or id != p_landing_id)
  ) loop
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;

  return final_slug;
end;
$$;

grant execute on function generate_vendor_slug(text, uuid) to authenticated;

-- ─── Analytics ─────────────────────────────────────────────────────
create table if not exists vendor_page_views (
  id uuid primary key default gen_random_uuid(),
  vendor_id text not null,
  viewed_at timestamptz default now(),
  source text,
  referrer text,
  country text,
  city text,
  device_type text,
  is_unique boolean default false
);

create index if not exists vendor_page_views_lookup on vendor_page_views(vendor_id, viewed_at desc);

create table if not exists vendor_page_actions (
  id uuid primary key default gen_random_uuid(),
  vendor_id text not null,
  action_type text not null check (action_type in ('whatsapp', 'phone', 'email', 'website', 'instagram', 'facebook', 'gallery_open', 'review_helpful')),
  action_at timestamptz default now()
);

create index if not exists vendor_page_actions_lookup on vendor_page_actions(vendor_id, action_at desc);

create or replace view vendor_studio_analytics as
select
  vendor_id,
  count(distinct date_trunc('day', viewed_at)) as active_days_30d,
  count(*) filter (where viewed_at > now() - interval '30 days') as views_30d,
  count(*) filter (where viewed_at > now() - interval '7 days') as views_7d,
  count(*) filter (where viewed_at > now() - interval '24 hours') as views_today,
  count(distinct source) filter (where viewed_at > now() - interval '30 days') as unique_sources_30d
from vendor_page_views
group by vendor_id;

grant select on vendor_studio_analytics to anon, authenticated;

-- ─── Storage ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('vendor-studio', 'vendor-studio', true)
on conflict (id) do nothing;

drop policy if exists "anyone reads vendor studio media" on storage.objects;
create policy "anyone reads vendor studio media" on storage.objects
  for select using (bucket_id = 'vendor-studio');

drop policy if exists "vendors upload to own folder" on storage.objects;
create policy "vendors upload to own folder" on storage.objects
  for insert with check (
    bucket_id = 'vendor-studio' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "vendors update own media" on storage.objects;
create policy "vendors update own media" on storage.objects
  for update using (
    bucket_id = 'vendor-studio' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "vendors delete own media" on storage.objects;
create policy "vendors delete own media" on storage.objects
  for delete using (
    bucket_id = 'vendor-studio' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── RLS ───────────────────────────────────────────────────────────
alter table vendor_landings enable row level security;
alter table vendor_page_views enable row level security;
alter table vendor_page_actions enable row level security;

drop policy if exists "anyone reads published landings" on vendor_landings;
create policy "anyone reads published landings" on vendor_landings
  for select using (landing_published = true);

drop policy if exists "owner reads own landing" on vendor_landings;
create policy "owner reads own landing" on vendor_landings
  for select using (auth.uid() = owner_user_id);

drop policy if exists "owner inserts landing" on vendor_landings;
create policy "owner inserts landing" on vendor_landings
  for insert with check (auth.uid() = owner_user_id);

drop policy if exists "owner updates landing" on vendor_landings;
create policy "owner updates landing" on vendor_landings
  for update using (auth.uid() = owner_user_id);

drop policy if exists "owner deletes landing" on vendor_landings;
create policy "owner deletes landing" on vendor_landings
  for delete using (auth.uid() = owner_user_id);

drop policy if exists "anyone inserts page views" on vendor_page_views;
create policy "anyone inserts page views" on vendor_page_views
  for insert with check (true);

drop policy if exists "anyone inserts page actions" on vendor_page_actions;
create policy "anyone inserts page actions" on vendor_page_actions
  for insert with check (true);

drop policy if exists "anyone reads views" on vendor_page_views;
create policy "anyone reads views" on vendor_page_views
  for select using (true);

drop policy if exists "anyone reads actions" on vendor_page_actions;
create policy "anyone reads actions" on vendor_page_actions
  for select using (true);
