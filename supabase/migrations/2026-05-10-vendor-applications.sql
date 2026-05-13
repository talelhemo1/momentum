-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor onboarding platform — Phase 0
-- Run on Supabase (SQL Editor) after schema.sql is already applied.
-- ─────────────────────────────────────────────────────────────────────────────

-- בקשות הצטרפות של ספקים
create table if not exists vendor_applications (
  id uuid primary key default gen_random_uuid(),
  -- פרטי קשר
  business_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null,
  city text,
  -- פרופיל עסקי
  category text not null,
  about text,
  website text,
  instagram text,
  facebook text,
  sample_work_url text not null,
  -- אימות (3 השאלות שהסכמנו עליהן)
  business_id text not null,
  years_in_field int not null check (years_in_field >= 0 and years_in_field <= 80),
  -- מצב סקירה
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_at timestamptz,
  approved_vendor_id text,
  phone_verified boolean default false,
  -- audit
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists vendor_applications_status_idx on vendor_applications(status, created_at desc);

-- מנגנון admin: רק כתובות מייל ברשימה הזו רואות וזכאיות לאשר
create table if not exists admin_emails (
  email text primary key
);
insert into admin_emails (email) values ('talhemo132@gmail.com') on conflict do nothing;

-- log של התראות שנשלחו
create table if not exists vendor_notifications_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references vendor_applications(id) on delete cascade,
  channel text not null,
  status text not null,
  error text,
  created_at timestamptz default now()
);

-- RLS
alter table vendor_applications enable row level security;
alter table admin_emails enable row level security;
alter table vendor_notifications_log enable row level security;

-- כל אחד יכול להגיש בקשה (חייב למלא את כל השדות הקריטיים).
-- הקפד שהבקשה נכנסת ב-pending ושסטטוסי הביקורת נשארים בערכי ברירת המחדל
-- — כך תוקף לא יוכל להזרים { status: "approved" } דרך ה-anon insert.
drop policy if exists "public can submit applications" on vendor_applications;
create policy "public can submit applications" on vendor_applications
  for insert with check (
    business_name is not null and email is not null
    and phone is not null and business_id is not null
    and category is not null and sample_work_url is not null
    and status = 'pending'
    and reviewed_at is null
    and approved_vendor_id is null
    and phone_verified = false
  );

-- Admins רואים את הרשומה שלהם בטבלת admin_emails (לבדיקה ב-/admin/vendors).
-- בלי זה — supabase.from('admin_emails').select() תחת אנון/יוזר מחזירה null,
-- וה-dashboard נופל ל-403 גם כשהמשתמש בעצם admin.
drop policy if exists "user can read own admin row" on admin_emails;
create policy "user can read own admin row" on admin_emails
  for select using (auth.jwt() ->> 'email' = email);

-- רק admin רואה
drop policy if exists "admin reads applications" on vendor_applications;
create policy "admin reads applications" on vendor_applications
  for select using (
    auth.jwt() ->> 'email' in (select email from admin_emails)
  );

drop policy if exists "admin updates applications" on vendor_applications;
create policy "admin updates applications" on vendor_applications
  for update using (
    auth.jwt() ->> 'email' in (select email from admin_emails)
  );

drop policy if exists "admin reads notifications log" on vendor_notifications_log;
create policy "admin reads notifications log" on vendor_notifications_log
  for select using (
    auth.jwt() ->> 'email' in (select email from admin_emails)
  );

-- log inserts happen from the server (anon key under public-insert RLS).
-- Allow inserts that link to a real application row.
drop policy if exists "log inserts via server" on vendor_notifications_log;
create policy "log inserts via server" on vendor_notifications_log
  for insert with check (application_id is not null);
