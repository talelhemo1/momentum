-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor onboarding — RLS hotfix (Round-5).
-- Run this AFTER 2026-05-10-vendor-applications.sql if you already applied
-- the original. It re-creates only the two policies that changed:
--   1. admin_emails — add a SELECT policy so admins can verify themselves.
--   2. vendor_applications — tighten public-insert so callers can't
--      smuggle status='approved' / reviewed_at / approved_vendor_id.
-- Idempotent: drops any pre-existing version first.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) admin_emails: every admin can see their own row (and only theirs).
drop policy if exists "user can read own admin row" on admin_emails;
create policy "user can read own admin row" on admin_emails
  for select using (auth.jwt() ->> 'email' = email);

-- 2) vendor_applications: public-insert must arrive in `pending` state.
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
