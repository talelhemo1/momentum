# TASKLIST · R32 — Static OG default + invitation click-tracking

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ (54 routes) · live: `/api/invitation/view` → **200 OK**, RSVP page renders & fires the view ping ✅

> ⚠️ **RUN IN SUPABASE:** `supabase/migrations/2026-05-17-invitation-views.sql`
> (SQL editor). Creates `invitation_views` + RLS (open insert/select,
> same capability model as short_links/event_memories) + realtime
> publication (idempotency-guarded). The code is safe to deploy first —
> until the table exists the view ping just no-ops (route returns
> `{ok:true,skipped:true}`); the dashboard card shows "no opens yet".
> Idempotent — safe to re-run.

## Goal

1. Every invitation/preview shows the static brand card
   `public/og-default-1200x630.png`.
2. Every time a guest opens the link, the couple sees it **live** on
   the dashboard.

## 🅐 Static OG as the project default

- `app/layout.tsx` — added `metadataBase` (so og:image is **absolute**;
  WhatsApp/social reject relative), root `openGraph` (type/siteName/
  locale/images) + `twitter` (summary_large_image). Every route inherits
  this; only routes with their own metadata override it.
- `app/i/[token]/opengraph-image.tsx` — **deleted**. The dynamic next/og
  image was fragile under the serverless font/edge path (see R29 §F
  history). The static card is now the single source of truth. *Can be
  reinstated later with a correct bundled-font setup; not worth the
  recurring 500-risk on the WhatsApp preview now.*
- `app/i/[token]/page.tsx` `generateMetadata` — a page-level metadata
  block **replaces** the root `openGraph`, so it now re-declares the
  static image explicitly in **both** branches (event found / not found).
- `app/rsvp/page.tsx` — same: re-declares the static image so a direct
  `/rsvp` link never previews image-less. Upgraded `twitter.card` to
  `summary_large_image`.

## 🅑 Migration

`supabase/migrations/2026-05-17-invitation-views.sql` — `invitation_views`
table, two indexes, RLS (open insert + open select), realtime
publication wrapped in the R30 `pg_publication_tables` idempotency guard
(the spec's bare `alter publication … add table` is not re-runnable).

## 🅒 Recording a view

- `app/api/invitation/view/route.ts` *(new)* — `POST {eventId, shortId?,
  guestId?, guestName?}`. `server-only`, anon Supabase client (RLS
  permits the open insert). **Always 200** — a tracking failure must
  never break RSVP. `user_agent` truncated to 200.
- `app/rsvp/RsvpClient.tsx` — fires the ping once per load, in the
  existing `trackedRef` view effect (fire-and-forget, `.catch(()=>{})`).

  **Design decision (C2):** the spec also asked for a fire-and-forget
  ping from the `/i/[token]` *server component*. That was intentionally
  **not** implemented there: an un-awaited `fetch` in a serverless
  server component that immediately `redirect()`s does not reliably
  execute (the function unwinds on the redirect throw), so it would be a
  silent no-op giving false confidence. `/rsvp` is the reliable
  catch-all — **every** guest lands there whether they came via the
  `/i/<id>` short link (which redirects to `/rsvp`) or a direct link. So
  recording once on `/rsvp` covers 100% of entry paths with zero added
  redirect latency.

## 🅓 Live dashboard

- `lib/useInvitationViews.ts` *(new)* — initial fetch (latest 100) +
  realtime INSERT subscription filtered to the event; id-deduped;
  no-ops without Supabase. Same channel pattern as `LiveModeView`.
- `components/dashboard/InvitationActivityCard.tsx` *(new)* — luxury
  gold card: animated total (`useCountUp`), "בשעה האחרונה" stat, feed of
  the 5 latest (✨ named vs 👤 anonymous) with relative time, `r26-rise-sm`
  slide-in. Uses `useNow(60_000)` for display (not `Date.now()` in
  render — that trips `react-hooks/purity`). **D4:** every genuinely-new
  open (unseen id, <45 s old, computed with `Date.now()` inside the
  effect where it's allowed) fires a `showToast` + `haptic.light()`; the
  initial fetch batch is skipped so it doesn't toast history.
- `app/dashboard/page.tsx` — rendered above `ToolsSection`, gated on
  `state.guests.length > 0` (no guest list ⇒ nothing could have been
  opened).

## 🅔 Dedup + privacy

- **E1 dedup:** the route skips the insert if the same `guest_id`
  recorded a view for this event in the last 10 min → `{ok:true,
  skipped:true}`.
- **E2 privacy:** raw IP is never stored — only `sha256(salt:ip)` hex
  (Web Crypto `crypto.subtle`, server-side; `IP_HASH_SALT` env override,
  static fallback). Enough to answer "same device?" without holding PII.

## 🅕 Verification

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ 0 errors (6 pre-existing
  warnings in `app/terms/page.tsx`, unrelated) · `npm run build` ✅
  54 routes; new `ƒ /api/invitation/view`; `/i/[token]` still builds
  after the opengraph-image deletion; no `metadataBase`/OG warnings.
- **Live:** forged legacy `?d=` RSVP URL in the preview → page renders,
  `POST /api/invitation/view` → **200 OK**, no new console errors (only
  the pre-existing CSP-nonce hydration mismatch in the root layout's
  theme-boot script, untouched by R32).
- Not headless-verifiable (documented for manual/device check): the
  WhatsApp static-image preview after a real share; the dashboard
  realtime card + toast (needs the migration run + a logged-in host with
  a guest list + Supabase env).
