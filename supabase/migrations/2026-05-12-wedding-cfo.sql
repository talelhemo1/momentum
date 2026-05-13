-- ──────────────────────────────────────────────────────────────────────────
-- Momentum Wedding CFO (R20 Phase 7).
--
-- Two tables + a Supabase Storage bucket for receipt images:
--   event_receipts    — one row per invoice/receipt the couple captures
--   payment_schedule  — installments belonging to a receipt
--
-- All monetary amounts are stored in agorot (integer) to avoid floating-
-- point drift. UI converts to shekels on read.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists event_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  vendor_name text,
  category text,
  total_amount integer not null default 0,
  paid_amount integer not null default 0,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'overdue', 'disputed')),
  raw_text text,
  image_path text,
  notes text,
  ai_confidence smallint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists event_receipts_event_idx on event_receipts(event_id, due_date asc);

create table if not exists payment_schedule (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid references event_receipts(id) on delete cascade not null,
  installment_label text,
  amount integer not null,
  due_date date not null,
  paid_at timestamptz,
  paid_amount integer,
  notes text,
  created_at timestamptz default now()
);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

alter table event_receipts enable row level security;
alter table payment_schedule enable row level security;

drop policy if exists "users own receipts" on event_receipts;
create policy "users own receipts" on event_receipts
  for all using (auth.uid() = user_id);

drop policy if exists "users own schedule" on payment_schedule;
create policy "users own schedule" on payment_schedule
  for all using (
    exists(select 1 from event_receipts r where r.id = payment_schedule.receipt_id and r.user_id = auth.uid())
  );

-- Storage policies — first-segment of object path is the user uuid.
drop policy if exists "users see own receipt images" on storage.objects;
create policy "users see own receipt images" on storage.objects
  for select using (
    bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users upload own receipt images" on storage.objects;
create policy "users upload own receipt images" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
  );
