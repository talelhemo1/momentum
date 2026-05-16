-- R38 — make APPROVED vendor applications visible in the public
-- catalog, the moment the admin approves them.
--
-- vendor_applications is admin-read-only (R36/earlier RLS). We do NOT
-- open a public SELECT policy on the table — that would leak applicant
-- PII (phone, email, business_id, ip_address, user_agent). Instead a
-- SECURITY DEFINER RPC returns ONLY the public-safe, vendor-supplied
-- columns for status='approved' rows. (Same pattern as R36's
-- lookup_short_link.)
--
-- Idempotent — safe to re-run.

create or replace function list_approved_vendors()
returns table (
  id uuid,
  business_name text,
  category text,
  city text,
  about text,
  website text,
  instagram text,
  facebook text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    id,
    business_name,
    category,
    city,
    about,
    website,
    instagram,
    facebook,
    created_at
  from vendor_applications
  where status = 'approved'
  order by created_at desc
  limit 1000;
$$;

-- Anon (the public /vendors catalog uses the anon key) + authenticated.
grant execute on function list_approved_vendors() to anon, authenticated;
