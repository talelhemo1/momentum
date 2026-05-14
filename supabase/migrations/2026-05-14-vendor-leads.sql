-- ──────────────────────────────────────────────────────────────────────────
-- R14 — Vendor leads + quotes (2026-05-14).
--
-- vendor_leads        — one row per "couple expressed interest" event.
--                       The couple's user_id and the vendor's slug both
--                       live on the row so two RLS policies can each see
--                       their side of the conversation without cross-talk.
-- vendor_quotes       — quote(s) the vendor sends in response to a lead.
--                       1:N — a vendor can revise a quote, each revision
--                       is a new row. The latest by `sent_at` is "active".
--
-- Money in agorot (integer) to match the rest of the project.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists vendor_leads (
  id uuid primary key default gen_random_uuid(),
  -- vendor_id stores the vendor_landings.slug, NOT the landing's uuid.
  -- Matches the convention used by vendor_reviews + the public landing
  -- routes (`/vendor/<slug>`), so a lead is reachable by the same slug
  -- the public site uses.
  vendor_id text not null,
  couple_user_id uuid references auth.users(id) on delete cascade not null,
  couple_name text,
  couple_email text,
  couple_phone text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'quoted', 'won', 'lost')),
  source text check (source in ('saved', 'contact_button', 'whatsapp_click', 'manual')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vendor_leads_vendor_idx on vendor_leads(vendor_id, created_at desc);
create index if not exists vendor_leads_couple_idx on vendor_leads(couple_user_id, created_at desc);
-- One pending lead per (vendor, couple) — re-clicking "I'm interested"
-- shouldn't create dupes. Partial unique index lets re-engagement after
-- a lost/won lead create a fresh row.
create unique index if not exists vendor_leads_no_dup_pending
  on vendor_leads(vendor_id, couple_user_id)
  where status in ('pending', 'contacted', 'quoted');

create table if not exists vendor_quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references vendor_leads(id) on delete cascade not null,
  amount_agorot integer not null check (amount_agorot >= 0),
  valid_until date,
  terms text,
  sent_at timestamptz default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text
);

create index if not exists vendor_quotes_lead_idx on vendor_quotes(lead_id, sent_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────
alter table vendor_leads enable row level security;
alter table vendor_quotes enable row level security;

-- Couple side: they see leads they created.
drop policy if exists "couple sees own leads" on vendor_leads;
create policy "couple sees own leads" on vendor_leads
  for select using (auth.uid() = couple_user_id);

drop policy if exists "couple creates own leads" on vendor_leads;
create policy "couple creates own leads" on vendor_leads
  for insert with check (auth.uid() = couple_user_id);

-- Vendor side: they see leads where the slug matches a landing they own.
drop policy if exists "vendor sees own leads" on vendor_leads;
create policy "vendor sees own leads" on vendor_leads
  for select using (
    exists (
      select 1 from vendor_landings
      where slug = vendor_leads.vendor_id
        and owner_user_id = auth.uid()
    )
  );

-- Vendor updates status / notes on leads addressed to them.
drop policy if exists "vendor updates own leads" on vendor_leads;
create policy "vendor updates own leads" on vendor_leads
  for update
    using (
      exists (
        select 1 from vendor_landings
        where slug = vendor_leads.vendor_id
          and owner_user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from vendor_landings
        where slug = vendor_leads.vendor_id
          and owner_user_id = auth.uid()
      )
    );

-- Couples can mark leads as 'won' / 'lost' after working with the vendor.
drop policy if exists "couple updates own leads" on vendor_leads;
create policy "couple updates own leads" on vendor_leads
  for update
    using (auth.uid() = couple_user_id)
    with check (auth.uid() = couple_user_id);

-- ─── Quotes — both sides see quotes attached to leads they're party to ─
drop policy if exists "parties see quotes" on vendor_quotes;
create policy "parties see quotes" on vendor_quotes
  for select using (
    exists (
      select 1 from vendor_leads l
      where l.id = vendor_quotes.lead_id
        and (
          l.couple_user_id = auth.uid()
          or exists (
            select 1 from vendor_landings vl
            where vl.slug = l.vendor_id
              and vl.owner_user_id = auth.uid()
          )
        )
    )
  );

-- Only the vendor inserts quotes (couples respond by updating accept/decline).
drop policy if exists "vendor inserts quotes" on vendor_quotes;
create policy "vendor inserts quotes" on vendor_quotes
  for insert with check (
    exists (
      select 1 from vendor_leads l
      join vendor_landings vl on vl.slug = l.vendor_id
      where l.id = vendor_quotes.lead_id
        and vl.owner_user_id = auth.uid()
    )
  );

-- Couples flip accepted/declined; vendor can edit terms/amount until accepted.
drop policy if exists "vendor updates quote" on vendor_quotes;
create policy "vendor updates quote" on vendor_quotes
  for update
    using (
      accepted_at is null and exists (
        select 1 from vendor_leads l
        join vendor_landings vl on vl.slug = l.vendor_id
        where l.id = vendor_quotes.lead_id
          and vl.owner_user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from vendor_leads l
        join vendor_landings vl on vl.slug = l.vendor_id
        where l.id = vendor_quotes.lead_id
          and vl.owner_user_id = auth.uid()
      )
    );

drop policy if exists "couple accepts or declines quote" on vendor_quotes;
create policy "couple accepts or declines quote" on vendor_quotes
  for update
    using (
      exists (
        select 1 from vendor_leads l
        where l.id = vendor_quotes.lead_id
          and l.couple_user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from vendor_leads l
        where l.id = vendor_quotes.lead_id
          and l.couple_user_id = auth.uid()
      )
    );

-- ─── Realtime publication ─────────────────────────────────────────────
-- The vendor dashboard subscribes to lead inserts to refresh metrics
-- without polling. Same publication used elsewhere in the project.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table vendor_leads;
    alter publication supabase_realtime add table vendor_quotes;
  end if;
exception when duplicate_object then null;
end $$;

-- Touch trigger so updated_at always reflects the last change.
create or replace function touch_vendor_leads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists vendor_leads_touch on vendor_leads;
create trigger vendor_leads_touch
  before update on vendor_leads
  for each row execute function touch_vendor_leads_updated_at();
