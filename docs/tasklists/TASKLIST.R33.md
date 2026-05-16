# TASKLIST · R33 — Wire the R28 short-link + premium message into the canonical flow

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings in `app/terms/page.tsx`) · `npm run build` ✅ · RSVP preview render = no regression ✅ · production curl checks ↓

> No migration. No env. Pure code consolidation + an OG cache-bust query string.

## Problem

The R28 premium message + `/i/<id>` short link existed, but the logic
lived **only** inside `hooks/useGuestWhatsappLink.ts` — layered on top
of the *legacy* long-URL message that `buildHostInvitationWhatsappLink`
produced. `buildHostInvitationWhatsappLink` (the canonical, exported
builder) still emitted the old long message. Two code paths for the same
job → drift risk + a latent double-`createShortLink` if any other caller
used the canonical builder directly.

## 🅐 Consolidation

- **`lib/invitation.ts` — `buildHostInvitationWhatsappLink` rewritten.**
  It is now the single canonical builder:
  1. builds the long signed `/rsvp?d=…&sig=…` URL,
  2. `createShortLink(pathname+search, event.id)` → `/i/<id>` (deduped
     per (event_id, long_path) since R30),
  3. `buildWhatsappInviteMessage({...})` → premium body with the clean
     short link (WhatsApp renders the static OG card).
  Fail-soft: any shortening error → keep the long URL, still send the
  premium message. Returns `rsvpUrl` = the **short** URL on success so
  every UI (copy-link, etc.) shows the clean link.
  - Removed the now-dead private `formatHebrewDate` + the old hand-rolled
    `lines[]` message. `buildWhatsappInviteMessage` owns the copy +
    Hebrew date (R31 also added the Waze line there).
  - Adapted to the **real** `buildWhatsappInviteMessage` signature — the
    R33 spec snippet passed `eventTime: event.time`, but that field
    doesn't exist on `EventInfo` and the message builder has no
    `eventTime` param; passing it would not compile. Omitted.

- **`hooks/useGuestWhatsappLink.ts` — `buildLink` is now a thin map.**
  Deleted the duplicated R28 upgrade block + the now-unused imports
  (`createShortLink`, `buildWhatsappInviteMessage`,
  `normalizeIsraeliPhone`). It just calls the canonical builder and maps
  `{url,rsvpUrl}` → `{whatsappUrl,rsvpUrl}`. This removes the
  double-short-link round-trip.

- **Callers audited** (`grep -rn buildHostInvitationWhatsappLink`):
  only real caller is `useGuestWhatsappLink` (already `await`s it).
  `app/guests/page.tsx` only `void`-references it for a legacy-import
  lint guard and consumes the hook's `whatsappUrl` — so the production
  "send invite" button now ships the premium short-link message. No
  other caller; nothing else to fix.

## 🅑 Static OG (verified — already correct from R32)

- `app/layout.tsx` has `metadataBase: new URL(SITE_URL)` (absolute
  og:image — the critical bit) + root `openGraph`/`twitter` with the
  static card.
- `app/rsvp/page.tsx` and `app/i/[token]/page.tsx` re-declare the static
  image explicitly (page-level metadata replaces the root openGraph), so
  neither previews image-less. No change needed; confirmed by grep.

## 🅓 Cache-bust

- All `/og-default-1200x630.png` references → `…?v=2` (layout, rsvp,
  /i/[token]). Forces WhatsApp/Facebook to re-scrape instead of serving
  a stale/empty cached card.

**Post-deploy manual step (clears the WhatsApp/FB cache):**
1. Open <https://developers.facebook.com/tools/debug/sharing/>
2. Paste each URL — `/`, `/rsvp`, a real `/i/<id>` — and click
   **"Scrape Again"**. WhatsApp shares the FB-scraped card.

## 🅒 Verification

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ 0 errors · `npm run build` ✅
- Preview: `/rsvp?d=…` still renders fully (regression check —
  `lib/invitation.ts` also powers the guest response/inbox path); only
  the pre-existing CSP-nonce hydration mismatch in the root layout
  theme-boot script (untouched).
- Production curl (post-deploy):
  - `curl -I .../og-default-1200x630.png` → `200`, `content-type: image/png`
  - `curl -s .../rsvp?d=test | grep og:image` → absolute `https://…?v=2` URL
  - real invite URL is the short `…/i/<id>` form
- Not headless-verifiable (needs a logged-in host + guests): the actual
  "send invitation" button output — covered by the audit above (single
  builder, single message path) + the curl checks.
