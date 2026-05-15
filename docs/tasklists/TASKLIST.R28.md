# TASKLIST · R28 — Premium WhatsApp Invitation (OG image + short URL + polished message)

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ (46 routes; `/i/[token]` + `/i/[token]/opengraph-image` registered)

> ## ⚠️ ACTION REQUIRED BEFORE DEPLOY
> Run this in the **Supabase SQL Editor** before re-deploying:
> ```
> supabase/migrations/2026-05-17-short-links.sql
> ```
> Creates `short_links` (+ RLS, open select/insert — the short id is the
> capability). Idempotent. Without it, short-link creation fails and the
> flow **gracefully falls back to the full URL** (nothing breaks, but you
> won't get the short link / rich preview until it's run).
> *(The R27 `2026-05-17-event-memories.sql` migration was already run.)*

---

## Shipped

| # | Item | File |
|---|---|---|
| A1/A2/A3/D2 | Dynamic OG image — `next/og` `ImageResponse`, Node runtime, **Heebo Hebrew + Latin TTFs** bundled in `assets/`, luxe gold card (logo, type badge, huge host names, date, venue, CTA pill), graceful default when token unknown, `cache-control: max-age=3600, s-maxage=86400` | `app/i/[token]/opengraph-image.tsx`, `assets/Heebo-Bold.ttf`, `assets/Heebo-Latin.ttf` |
| B1 | `short_links` migration | `supabase/migrations/2026-05-17-short-links.sql` |
| B2 | `lib/shortLinks.ts` — base56 `generateShortId` (56^6≈30B, no 1lI0O), `createShortLink` (retry on PK collision, soft-fail→null), `lookupShortLink` (server-safe) | new |
| — | `lib/invitationLookup.ts` — server-safe shortId→event: short_links → `?d=` payload → `decodeInvitation` (no localStorage / no events table needed; the payload is self-contained) | new |
| B3/D1 | `/i/[token]` — server-redirects to the real `/rsvp?d=…&sig=…`; `generateMetadata` sets OG title/desc/locale (the co-located opengraph-image file auto-injects og:image); friendly "פג תוקף" 404. Next 16 async `params` (awaited) | `app/i/[token]/page.tsx` |
| C1 | `lib/invitationMessage.ts` — polished Hebrew body + `EVENT_TYPE_EMOJI`, short URL only | new |
| C2 | Wired into the single guest-invite source (`hooks/useGuestWhatsappLink.ts` → `buildLink`): builds legacy link, then upgrades to short `/i/<id>` + polished message; **any failure → legacy long URL/message** (flow never breaks) | modified |
| D3 | README "How to refresh WhatsApp preview cache" (FB sharing debugger) | `README.md` |

## Deviations / notes (flagged)

1. **Event data source**: the app has **no server `events` table** — event details live in the host's localStorage. An edge/server OG function can't read that. Solved by decoding the **self-contained invitation payload** (`?d=`) the short link points to → real names/date/venue with zero backend changes.
2. **No `event.time` field** exists in the data model — the spec's `🕖 time` is omitted; venue = `synagogue · city` (the real fields).
3. **Runtime**: spec said `runtime="edge"`; Next 16's documented OG pattern uses `node:fs readFile` and edge isn't supported under proxy — used **Node runtime** (correct for this Next version).
4. **Font**: no Hebrew glyphs ship with `next/og`. Bundled Heebo **Hebrew + Latin** subsets (OFL) so Hebrew names *and* digits/Latin render (satori falls back across the family).
5. **F (per-guest personalization)** intentionally **not done** — the brief said finish A–E.

## Manual test checklist

1. Create a test event with guests.
2. From `/guests`, send an invite to your own number — the WhatsApp text should now be the polished message ending in a **`…/i/<6 chars>`** link (short).
3. Open `https://<site>/i/<id>/opengraph-image` directly → the gold invitation PNG renders with correct Hebrew names + date.
4. Paste the `…/i/<id>` link into WhatsApp → preview shows the rich image (first scrape can take ~30s; use the FB debugger to force — see README).
5. Tapping the link redirects to the real `/rsvp` and the RSVP page works as before.
6. Verify on **iPhone** and **Android** WhatsApp.
7. With Supabase short-link insert disabled (or migration not run): the invite still sends with the **full** URL (graceful fallback) — nothing breaks.

## Files

New: `app/i/[token]/page.tsx`, `app/i/[token]/opengraph-image.tsx`, `lib/shortLinks.ts`, `lib/invitationLookup.ts`, `lib/invitationMessage.ts`, `assets/Heebo-Bold.ttf`, `assets/Heebo-Latin.ttf`, `supabase/migrations/2026-05-17-short-links.sql`, this doc.
Modified: `hooks/useGuestWhatsappLink.ts`, `README.md`, `CHANGELOG.md`.
