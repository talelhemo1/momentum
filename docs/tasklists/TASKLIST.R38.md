# TASKLIST · R38 — Approved vendors enter the public catalog automatically

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ · `npm run test` ✅ 9/9 · `/vendors` verified live (pre-migration fail-soft) ✅

> ⚠️ **RUN IN SUPABASE:** `supabase/migrations/2026-05-17-approved-vendors-public.sql`
> Until it runs, approved vendors won't appear (the catalog just shows
> the static seed — verified: no crash, no error). The code is safe to
> deploy first. Idempotent.

## The ask

"Every vendor who fills the join form comes to me for approval, and
only then enters the app."

## What already existed (verified, no change needed)

The whole approve pipeline was already built in earlier rounds:
- `/vendors/join` → `POST /api/vendors/apply` → inserts
  `vendor_applications` (`status='pending'`, validated, rate-limited,
  status-fields locked by RLS so nobody can self-approve).
- Owner notified by **email** (Resend → `ADMIN_EMAIL`,
  `talhemo132@gmail.com`) + optional WhatsApp (CallMeBot), logged to
  `vendor_notifications_log`.
- `/admin/vendors` (gated by the `admin_emails` table, already seeded
  with `talhemo132@gmail.com`) lists pending apps with Approve / Reject
  → `POST /api/vendors/admin/decide` (admin-verified, race-protected).

**The only missing link:** approving did nothing visible — the catalog
(`lib/vendors.ts`) is a static array and `vendor_applications` is
admin-read-only, so an approved vendor never reached `/vendors`. The
admin page even had a permanent "approved but not in catalog" warning
block for exactly this gap.

## What R38 added

1. **`supabase/migrations/2026-05-17-approved-vendors-public.sql`** —
   a `SECURITY DEFINER` RPC `list_approved_vendors()` returning **only
   public, vendor-supplied columns** (business_name, category, city,
   about, website, instagram, facebook, created_at) for
   `status='approved'` rows. **Deliberately excludes** phone / email /
   business_id / ip_address / user_agent — opening a blanket public
   SELECT on the table would have been a 4th PII leak (we just closed 3
   in R36). Same secure pattern as R36's `lookup_short_link`. Granted to
   `anon` + `authenticated`. No table RLS change.

2. **`lib/approvedVendors.ts`** — pure mapper: an approved row →
   `Vendor`. Category → `VendorType` per the mapping documented in the
   decide route (`music-dj`→`dj`, `bridal`/`groomswear`→`dress`,
   `makeup-hair`→`makeup`, `invitations`→`stationery`,
   `transport`→`transportation`, `chuppah`→`designer`, `other`→
   `entertainment`, else 1:1). Free-text `city` → `Region` via a
   substring heuristic (region is a soft sort key; unknown → `tel-aviv`,
   the broadest "מרכז" bucket). `id` = `app-<uuid>`; `reviews:0` so the
   R37 "ספק חדש" badge shows; `phone:""` (never expose applicant PII).

3. **`app/vendors/page.tsx`** — loads the RPC once on mount, maps, and
   merges `[...VENDORS, ...approved]` into a single `allVendors` feeding
   the filter / count / quick-look memos. Fail-soft: RPC missing or
   error → keeps the static catalog (verified live pre-migration: still
   "1 ספקים נמצאו", no crash, no console error).

4. **`app/api/vendors/admin/decide/route.ts`** — on approve, stamps
   `approved_vendor_id = 'app-<id>'`. The row IS the catalog source now,
   so this clears the admin "approved but not synced" warning with no
   separate vendors table.

## Flow, end to end (after the migration runs)

vendor fills `/vendors/join` → row in `vendor_applications` (pending) →
you get an email → you open `/admin/vendors` (logged in as
`talhemo132@gmail.com`) → **Approve** → the vendor appears in `/vendors`
on the next load. Rejected / pending never appear.

## Notes / follow-ups

- **You must be logged into the app with `talhemo132@gmail.com`** to
  open `/admin/vendors` (admin gate). Email notifications need
  `RESEND_API_KEY` set in Vercel env — without it the row is still
  saved and visible in `/admin/vendors`, you just won't get the email.
- Saved-vendor-by-id resolution on *other* pages (compare / event-day /
  store budget line) still only knows the static seed; an approved
  vendor a couple saves won't resolve its catalog entry there. Catalog
  *browsing/filtering* (the "enters the app" surface) fully works.
  Documented as a follow-up — not in this scope.
- Approved-vendor cards expose website/IG/FB for contact (no phone, by
  design). A richer contact path can come later via the lead flow.
