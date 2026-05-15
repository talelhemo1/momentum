# TASKLIST · R14 — Vendor Dashboard + Lead/Quote workflow

**Date:** 2026-05-14
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors, 5 pre-existing warnings) · `npm run build` ✅ (43 routes)
**Status:** Code complete — **NOT yet deployed to Vercel** per your request. Awaiting manual Supabase migration first.

---

## ⚠️ ACTION REQUIRED BEFORE VERCEL DEPLOY

Run this in the **Supabase SQL Editor** before re-deploying:

```
supabase/migrations/2026-05-14-vendor-leads.sql
```

The migration creates two new tables (`vendor_leads`, `vendor_quotes`), their RLS policies, a touch-trigger for `updated_at`, and adds both tables to the `supabase_realtime` publication so the dashboard live-updates on new leads. Idempotent — safe to re-run.

After confirming the migration ran cleanly, give the green light and I'll run:
```bash
npx vercel --prod --yes
```

---

## Block 1 — Vendor Dashboard MVP

- [x] **A** — Migration `2026-05-14-vendor-leads.sql`:
  - `vendor_leads` table keyed by `vendor_id` (slug, matches existing convention from `vendor_reviews`)
  - `vendor_quotes` table with `lead_id` FK
  - 8 RLS policies — vendor sees only their leads via `vendor_landings.owner_user_id` join, couple sees only their own. Quotes visible to both parties.
  - Indexes on `(vendor_id, created_at desc)` + partial unique on `(vendor_id, couple_user_id)` for pending/contacted/quoted so re-clicks don't dupe.
  - Touch trigger on `updated_at`.
  - Realtime publication entries.

- [x] **B** — `lib/useVendorContext.ts`:
  - Returns `{ isVendor, vendorLanding, hasPaidTier, isLoading }`
  - Module-scope + localStorage cache (TTL 5min) so navigations don't re-query
  - `clearVendorContextCache()` export for signOut paths

- [x] **C** — `/app/vendors/dashboard/page.tsx`:
  - 4 metric cards (views 7d / clicks 7d / active leads / new reviews 30d)
  - Profile completeness progress bar with missing-fields checklist (7 axes — hero, gallery≥3, about≥100chars, areas, languages, certs, video)
  - 4 quick-action buttons (highlighted ones if action needed)
  - Activity feed (10 latest leads+reviews)
  - Try/catch/finally + 12s hard timeout (R12 §2J pattern)
  - Empty state if user signed in but has no landing

- [x] **D** — `/app/vendors/dashboard/leads/page.tsx`:
  - Status filter chips (all/pending/contacted/quoted/won/lost) with counts
  - Lead cards with one-tap status updates
  - Send-quote modal — amount + valid-until + terms
  - Inserts into `vendor_quotes` + bumps lead status to `quoted`

- [x] **E** — `components/vendors/VendorNav.tsx`:
  - Desktop right-side rail (RTL) with 5 items
  - Mobile bottom nav with safe-area-inset
  - Honors `--accent` for the active route

## Block 2 — Lead workflow + Notifications

- [x] **F** — `app/api/vendors/lead/route.ts`:
  - POST creates lead, looks up vendor via slug, blocks self-leads
  - 23505 unique violation mapped to "כבר שלחת התעניינות לספק הזה"
  - Fires notifications best-effort (doesn't await) so latency stays low

- [x] **G** — "שלח התעניינות" button in `LuxuriousTemplate`:
  - Primary CTA in hero, ABOVE WhatsApp
  - WhatsApp demoted to secondary glass-style button
  - Auto-applies to Modern + Rustic templates (they wrap Luxurious)
  - Modal in `VendorLandingClient` — pre-fills name from auth user metadata, requires sign-in (redirects to /signup with returnTo)

- [x] **H** — `lib/vendorNotificationsRich.ts`:
  - SMS via Twilio REST API (no SDK; uses fetch like the rest of the project)
  - HTML email via Resend
  - Both channels feature-detect env vars (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`); missing = silent skip
  - `Promise.allSettled` — one channel's failure doesn't kill the other
  - HTML email escapes user-controlled fields (XSS protection)

- [x] **I** — Realtime subscription on `/vendors/dashboard`:
  - Channel filtered by `vendor_id=eq.<slug>`
  - On INSERT → re-runs `loadMetrics()` so cards + feed refresh

## Block 3 — Routing + Auth + Polish

- [x] **J** — Smart `/auth/callback` routing:
  - After successful auth: check `vendor_landings.owner_user_id` → if found, redirect to `/vendors/dashboard`
  - Else fallback to existing logic (`/dashboard` if hasEvent, `/onboarding?gate=ok` otherwise)

- [x] **K** — Footer link on homepage:
  - New "ספקים" column with: Dashboard / Join / Vendor Studio
  - Grid bumped to `md:grid-cols-5` to accommodate

- [x] **L** — `STORAGE_KEYS.vendorContext` added (`momentum.vendor.context.v1`)

- [x] **M** — All checks green (tsc + lint + build)

## Required env vars (optional but recommended)

For notifications to actually fire, add to Vercel:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_SMS_FROM=+972533625007  (optional; default is this number)
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM_EMAIL=Momentum <noreply@momentum.app>  (optional)
```

Without these, leads still get created and visible in the dashboard — only the SMS+email push is skipped. The API logs a warning per channel.

---

## Files touched

| Area | Files |
|---|---|
| New migration | `supabase/migrations/2026-05-14-vendor-leads.sql` |
| New types | `lib/types.ts` (VendorLead, VendorQuote, status/source labels) |
| New libs | `lib/useVendorContext.ts`, `lib/vendorNotificationsRich.ts` |
| New pages | `app/vendors/dashboard/page.tsx`, `app/vendors/dashboard/leads/page.tsx` |
| New API | `app/api/vendors/lead/route.ts` |
| New components | `components/vendors/VendorNav.tsx` |
| Modified | `lib/storage-keys.ts`, `components/vendor-studio/VendorLandingClient.tsx`, `components/vendor-studio/templates/LuxuriousTemplate.tsx`, `app/auth/callback/page.tsx`, `components/Footer.tsx` |
