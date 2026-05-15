# TASKLIST · R29 — Hotfix: /i/[token] resilience to a missing short_links row

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ (46 routes)

---

## Problem

If the `short_links` table/row was missing or Supabase hiccuped, a
thrown error escaped `generateMetadata` / the OG path and surfaced as a
generic "משהו השתבש" crash page instead of the friendly "expired" state.

## Fix

| # | File | Change |
|---|---|---|
| A | `app/i/[token]/page.tsx` | `generateMetadata`: `lookupEventByToken(token).catch(() => null)` so a lookup failure degrades to the default invitation metadata. |
| B | `lib/shortLinks.ts` | `lookupShortLink`: `getSupabase()` + the query now fully inside one `try/catch` → returns `null`, logs, never throws. |
| C | `lib/shortLinks.ts` | `createShortLink`: whole body wrapped in `try/catch` → `null` on any failure. Return type already `Promise<string \| null>`; the invite flow (`hooks/useGuestWhatsappLink.ts`) already falls back to the full long URL when it gets `null` (verified — legacy link is built first as the safety net, short-link upgrade is best-effort). |
| D | `lib/invitationLookup.ts` | `lookupEventByToken`: entire body wrapped in `try/catch` so `decodeInvitation` / URL parsing can't throw out of the server/OG path either. |

Net: **zero errors can escape the `/i/[token]` server path** — every
Supabase / decode call fails soft to `null`, and the page renders the
friendly expired card; the OG image renders its default fallback.

## Manual verification

1. **Fake token** — visit `/i/zzzzzz` (no such row): shows the friendly
   "💌 ההזמנה הזאת פגה תוקף" card (NOT a crash / "משהו השתבש"). ✅ logic
   verified: `lookupShortLink` → `null` → page renders the expired
   branch; `generateMetadata` → default metadata (no throw).
2. **Real invite** — create a new invite from `/guests`, open the short
   `…/i/<id>` link → resolves and redirects to the real `/rsvp` page.
   (Requires the `short_links` migration to have been run in Supabase —
   it was, in R28.)
3. OG image for a fake token → renders the default "הזמנה לאירוע
   יוקרתי" fallback, no 500.

## 🅕 OG font resilience (follow-up in same R29)

| File | Change |
|---|---|
| `app/i/[token]/opengraph-image.tsx` | `readFile` of the two Heebo TTFs wrapped in `try/catch`. On failure `fonts` is `undefined` and `ImageResponse` is built **without** the `fonts` option → returns a valid 200 image (next/og built-in font) instead of a 500 that would break the WhatsApp preview. |
| `next.config.ts` | Added `outputFileTracingIncludes: { "/**": ["./assets/**/*"] }` so Vercel actually bundles `assets/Heebo-*.ttf` into the OG serverless function (without this the catch above would silently render Hebrew as boxes). ~33KB, broad glob for matching-safety. |

Manual check 3 (updated): OG for any token renders an image even if the
font assets are missing from the bundle (no 500); with tracing in place
Hebrew renders correctly.

## Notes

- No schema change (R28's `short_links` migration already applied).
- No behavior change for the happy path — purely defensive hardening.
- Preview not used to verify: the failure mode is "Supabase
  missing/erroring", which a fresh local preview can't reproduce
  meaningfully; tsc/lint/build + code-path review cover it.
