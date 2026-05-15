# TASKLIST · R12 — security + bugs + UX

**Date:** 2026-05-13
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors, 2 pre-existing `<img>` warnings) · `npm run build` ✅
**Status:** All 26 items shipped. **Not yet deployed to Vercel — awaiting manual Supabase migration first.**

---

## ⚠️ ACTION REQUIRED BEFORE VERCEL DEPLOY

Run this in the **Supabase SQL Editor** before re-deploying:

```
supabase/migrations/2026-05-13-vendor-review-fixes.sql
```

The migration is idempotent (`drop if exists` + `create`). Until it runs, the new RLS policies aren't active — anyone could still fake a vendor reply / spam `vendor_cost_reports`.

After running the migration, redeploy with:
```bash
npx vercel --prod --force --yes
```

---

## Block 1 — Security (P0 — must ship before launch)

- [x] **1A** — `lib/jsonLdSafe.ts` helper added; vendor landing now emits JSON-LD via `dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}` so a vendor-controlled name can't break out of the script tag with `</script>`.
- [x] **1B** — New migration `2026-05-13-vendor-review-fixes.sql`:
  - `vendor_review_responses` INSERT/UPDATE now require the responder to own the vendor (`owner_user_id` matches via slug join).
- [x] **1C** — Same migration:
  - `vendor_cost_reports.submitted_by_user_id uuid` added (FK to auth.users).
  - INSERT policy now requires `auth.uid() = submitted_by_user_id`.
  - Unique index `(submitted_by_user_id, category, region, guest_count_band)` caps spam at 1 row per user per bucket.
- [x] **1D** — Same migration:
  - `vendor_page_views` + `vendor_page_actions` SELECT closed to vendor owner only (was world-readable).
  - INSERT remains open (analytics still works) but now backed by a rate-limit trigger capping at **50 inserts/vendor/hour** via the new `vendor_page_views_rate` counter.
- [x] **1E** — Same migration: `vendor_reviews` INSERT now requires the target `vendor_id` to exist as a published `vendor_landings.slug`. WITH CHECK added to UPDATE policies on `vendor_reviews`, `vendor_landings`, `event_managers`.
- [x] **1F** — Raw error leakage closed in:
  - `app/api/admin/stats/route.ts` (catch block)
  - `app/api/cfo/extract/route.ts` (catch block)
  - `app/auth/callback/page.tsx` (3 paths: exchangeCodeForSession, verifyOtp, getSession). Full Postgres / Supabase text now logged to console; user sees static Hebrew.
- [x] **1G** — `/api/cfo/extract` hardened:
  - 5 MB cap on `imageDataUrl.length`
  - MIME prefix gate: `data:image/(png|jpeg|webp);base64,` only
  - Daily quota: 20 receipts/user/day (counts `event_receipts` rows since midnight)
- [x] **1H** — CSP nonce via `middleware.ts`:
  - New `middleware.ts` at project root generates a fresh per-request nonce and sets the full CSP header.
  - `script-src` now uses `'self' 'nonce-<n>' 'strict-dynamic'` (no `unsafe-inline`).
  - `next.config.ts` no longer sets CSP (it became dynamic); other static headers (HSTS, frame-ancestors, etc.) still apply.
  - `app/layout.tsx` reads the nonce via `headers()` and stamps it on the inline theme-bootstrap script.
- [x] **1I** — `connect-src` in CSP now pins to the exact Supabase project URL from `NEXT_PUBLIC_SUPABASE_URL` (no more `*.supabase.co` wildcard).

---

## Block 2 — P0 bugs

- [x] **2J** — `/admin/dashboard` no longer hangs on spinner. Whole load IIFE wrapped in `try/catch/finally`; `setLoading(false)` + `setAuthChecked(true)` are guaranteed in `finally`. Added `AbortController` to cancel the fetch if the user navigates away. `recent_activity` key switched from `label` to a server-supplied unique `id`.
- [x] **2K** — `ShareEventCard` Object-URL leak fixed: every allocated URL now lives in a stable `useRef<Set<string>>`. The cleanup function captures the Set on mount (not via closure), and a dedicated unmount effect sweeps the Set.
- [x] **2L** — `lib/theme.ts` no longer mutates `document.documentElement` during render. The DOM write now lives in a `useEffect` that tracks the theme; the inline bootstrap script in `layout.tsx` still handles the first paint to avoid FOUT.
- [x] **2M** — "השוואת מחירים" tab hidden behind `TRANSPARENCY_TAB_ENABLED = false` flag in `app/budget/page.tsx`. There's no UI to insert into `vendor_cost_reports` yet, so the tab always showed "not enough data". Flip the flag back to `true` when the Phase 8 reporting form ships.

---

## Block 3 — P1 bugs

- [x] **3N** — `signup` OAuth probe now uses `providers.google !== false` etc. A `null`/`undefined` from the probe no longer disables the button.
- [x] **3O** — useEffect dep narrowing:
  - `app/event-day/page.tsx` — `state.event.id` only
  - `components/ShareEventCard.tsx` — `(event.id, event.date, event.hostName, event.partnerName, template, qrTarget)`
  - `app/onboarding/page.tsx` — `state.event?.id` only (prefill is a one-shot anyway)
- [x] **3P** — `AssistantWidget` now pops the orphan user message when the panel closes mid-thinking, using the existing `actions.popLastAssistantMessage` (which pops the last message of any role).
- [x] **3Q** — parseFloat/parseInt clamps:
  - `app/dashboard/vendor-studio` — `years_experience` clamped to 0–80, `Number.isFinite` guarded.
  - `components/vendors/ReviewForm` — `agreed_price` + `initial_quote` strip commas/spaces before parseFloat ("12,500" no longer becomes 12).
  - `components/cfo/CfoSection` — bails with friendly toast if `total_amount <= 0`.
- [x] **3R** — `/auth/callback` now races a 12-second timeout; if Supabase doesn't resolve a session in time, the user sees "האימות לוקח יותר מהרגיל…" instead of an infinite spinner.
- [x] **3S** — `STORAGE_KEYS` extended with six previously-ad-hoc keys. Replaced raw strings in `manage/[eventId]/page.tsx`, `signup/page.tsx`, `start/StartClient.tsx`, `lib/notifications.ts`, `lib/analytics.ts`, `lib/confetti.ts`. Separator unified to `.` (was `:` in two places — these constitute a **one-time breaking change** for existing localStorage values; safe for the pilot since no production users exist yet).
- [x] **3T** — Vendor-studio slug fallback now uses `crypto.randomUUID().slice(0,6)` instead of `Date.now().toString(36)` — unguessable, so an attacker can't squat on upcoming slugs.
- [x] **3U** — `tel:` link normalized via `normalizeIsraeliPhone` in `VendorLandingClient`, passed as `telUrl` prop to all three templates. "050-1234567" / "+972 50-123-4567" now produce identical `tel:+97250...` URLs across templates.

---

## Block 4 — UX

- [x] **4V** — Global `body { padding-bottom: max(env(safe-area-inset-bottom) + 56px, 64px); }` (`md+` resets to 0). Removed redundant `pb-24` / `pb-28` from `app/inbox/page.tsx`, `app/balance/page.tsx`, `app/timeline/page.tsx`.
- [x] **4W** — Header buttons bumped from 36/40px to **44×44px** (WCAG 2.1 SC 2.5.5).
- [x] **4X** — Admin dashboard "no activity" state uses the shared `<EmptyState />` component with `Clock` icon + description. Previously a bare `<p>` made the page look broken.
- [x] **4Y** — `/signup` "check your email" step now has a working **"שלח שוב"** button. Calls `supabase.auth.resend({ type: "signup", email })`. 60-second client-side cooldown mirrors Supabase's rate limit so the user sees a countdown instead of a generic error toast.
- [x] **4Z** — Email submit + resend buttons now show the `<Loader2 />` spinner **inside** the button while busy (no more separate "טוען…" row that shifted the layout).

---

## Files touched

| Area | Files |
|---|---|
| New helpers | `lib/jsonLdSafe.ts`, `middleware.ts` |
| New migration | `supabase/migrations/2026-05-13-vendor-review-fixes.sql` |
| Centralization | `lib/storage-keys.ts`, `lib/analytics.ts`, `lib/notifications.ts`, `lib/confetti.ts`, `lib/theme.ts` |
| Pages | `app/layout.tsx`, `app/signup/page.tsx`, `app/auth/callback/page.tsx`, `app/admin/dashboard/page.tsx`, `app/budget/page.tsx`, `app/event-day/page.tsx`, `app/onboarding/page.tsx`, `app/inbox/page.tsx`, `app/balance/page.tsx`, `app/timeline/page.tsx`, `app/manage/[eventId]/page.tsx`, `app/start/StartClient.tsx`, `app/vendor/[slug]/page.tsx`, `app/dashboard/vendor-studio/page.tsx` |
| API | `app/api/admin/stats/route.ts`, `app/api/cfo/extract/route.ts` |
| Components | `components/Header.tsx`, `components/ShareEventCard.tsx`, `components/AssistantWidget.tsx`, `components/vendors/ReviewForm.tsx`, `components/cfo/CfoSection.tsx`, `components/vendor-studio/VendorLandingClient.tsx`, `components/vendor-studio/templates/LuxuriousTemplate.tsx` |
| Config | `next.config.ts` |
| Styles | `app/globals.css` |
