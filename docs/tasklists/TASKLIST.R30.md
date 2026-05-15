# TASKLIST · R30 — Bug-scan hardening (3-agent review of R18–R29)

**Date:** 2026-05-18
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ (46 routes) · `npm run test` ✅ (6/6)

> ⚠️ **RUN BEFORE/AFTER DEPLOY:** `supabase/migrations/2026-05-18-r30-hardening.sql`
> in the Supabase SQL editor. It dedupes `short_links`, adds the
> `(event_id,long_path)` unique index, the per-event hourly rate-limit
> triggers for `short_links` + `event_memories`, and the size/mime caps
> on the public `event-memories` bucket. The code change is safe to
> deploy first (it only *improves* security); the migration is the hard
> guarantee for the abuse caps. Idempotent — safe to re-run.

Three parallel review agents scanned: (1) Momentum Live/OG/short-links,
(2) calculators/guests/signup, (3) security/data-integrity.

## Security (fixed in code now)

| Sev | Where | Fix |
|---|---|---|
| P0 | `app/i/[token]/page.tsx` | **Open redirect**: `redirect(longPath)` used an attacker-influencable DB value (open-INSERT `short_links`). Now strictly whitelisted: must match `^/rsvp\?[A-Za-z0-9\-_=&%.]+$`, no `://`/`\`. |
| P0/P1 | `app/api/manager/invite/route.ts` | Was **fully unauthenticated SMS** (Twilio cost/phishing amplification). Now requires a valid Supabase session + per-user rate limit (30/h). 200+waUrl contract preserved (client opens WhatsApp itself) — only the SMS is gated. Both callers (setup, event-day resend) now send the Bearer token; resend reordered so `window.open` stays in the gesture. |
| P1 | `app/api/crisis/broadcast/route.ts` | Auth was theatre (`startsWith("Bearer ")` only). Now `getUser()`-validated + per-user+event rate limit (5 / 15 min). |
| P1 | `app/api/ai/packages/route.ts` | Bespoke rate Map leaked one entry/user forever. Replaced with shared self-pruning `lib/serverRateLimit.ts`. |
| P2→ | `lib/shortLinks.ts` | `createShortLink` now selects an existing `(event_id,long_path)` row before inserting → stops unbounded row bloat (the migration adds the unique index as the hard guarantee). |

New: `lib/serverRateLimit.ts` (server-only, self-pruning sliding window).

## Correctness (fixed)

- `lib/realCostPerGuest.ts` — insight savings could render **negative** ("יחסוך ₪-3,210") just over the trigger %. `Math.max(0, …)`.
- `app/budget/page.tsx` — `reduce(s + b.estimated)` → `₪NaN` on legacy items with `estimated: undefined`. Now `?? 0`.
- `app/guests/page.tsx` — `confirmedHeads` used `g.attendingCount` (NaN for legacy guests). Now `?? 1`.
- `components/calculators/AlcoholCalculator.tsx` — `needByCategory` could be `NaN` (empty head/hour inputs) → `width:NaN%` bars. All values coerced via `Number.isFinite`.
- `components/eventDay/LiveModeView.tsx` — realtime race: an event before the initial load fired spurious haptic/sound + bad baseline. Gated behind an `initialDone` ref.
- `app/manage/[eventId]/page.tsx` — the 24h Wrapped prompt wrote its "shown" localStorage flag in the effect (burned if unmounted before commit → never shown again). Now written only in the dismiss/CTA handlers.
- `components/managerLive/AlertToast.tsx` — parent passed a fresh `onDismiss` each render; the 8s auto-dismiss timer reset on every dashboard re-render so non-critical toasts never auto-dismissed. `onDismiss` kept in a ref (mutated in an effect, per React 19), timer armed once per alert.
- `components/calculators/AiPackagesCalculator.tsx` — inputs were stuck on the 80000/150 fallbacks if `state.event` hydrated after first paint (no re-sync, unlike the other calculators). One-shot adopt-on-hydration that won't clobber user edits.

## Migrations

- `2026-05-17-event-memories.sql` — the `alter publication … add table` line was **not** idempotent (contradicting the file header); wrapped in a `pg_publication_tables` existence guard.
- `2026-05-18-r30-hardening.sql` (new) — see the banner above.

## Reviewed-and-OK (no change needed)

- XSS in kiosk memory feed — React auto-escapes; no `dangerouslySetInnerHTML`. Safe.
- CSP/middleware — supabase ws + public storage img already covered; OG is server-rendered PNG. Safe.
- Secrets — all new server libs have `import "server-only"`; no env leaks; generic error bodies. Clean.
- `TASKLIST.R23.md` — single file, no doc-name collision (R24/R25 only reference R23 in prose).
- Short-id entropy (~34.6 bits) vs old HMAC token — accepted tradeoff now that the R30 rate-limit cap blocks enumeration.

## Manual verification

1. `/i/zzzzzz` → friendly "expired" card (not crash). A `short_links` row with `long_path=https://evil` (or `//evil`) → NOT redirected (falls to expired card).
2. Invite SMS without a session → no SMS sent (WhatsApp still opens from the client). With session → SMS sent, capped 30/h.
3. Calculators with empty/zero inputs → no `₪NaN` / `NaN%` anywhere.
4. Busy manager dashboard → non-critical alert toasts auto-dismiss after ~8s.
