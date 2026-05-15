# TASKLIST · R25 — Momentum Live Phase 1: Discoverability + Dual-Channel Invite

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 5 pre-existing warnings) · `npm run build` ✅ (45 routes; +1 `/api/manager/invite`) · `npm run test -- managerInvitation` ✅ (6/6)

> **Naming note:** the brief said "TASKLIST.R23.md", but `TASKLIST.R23.md`
> already exists (the calculators round — there are two parallel numbering
> tracks). Written here as `R25-momentum-live` to avoid clobbering it.
> CHANGELOG entry added as **R25** for the same reason.

---

## 🅐 Discoverability

| # | Item | File | Notes |
|---|---|---|---|
| A1 | Bottom-nav slot | `lib/navigation.ts` | Last `NAV_ITEMS` entry (settings/"עוד") → `{ /event-day, "מצב חי", Sparkles }`. Settings still reachable via the header user-menu. |
| A2 | Conditional top-nav link | `components/Header.tsx` | `headerNav` memo appends "מצב חי" → `/event-day` when `daysUntil(event.date) ≤ 21`. Both desktop + mobile maps switched to `headerNav`. |
| A3 | Dashboard CTA | `components/LiveModeCTA.tsx` (new) + `app/dashboard/page.tsx` | Renders only when `0 ≤ daysLeft ≤ 14`. card-gold, Crown 32px, infinite `pulse-gold` glow, copy "האירוע שלך עוד {N} ימים…" + "תן למישהו אמין לנהל איתך את היום ⚡", placed directly above `<ToolsSection />`. |
| A4 | 3-state event-day banner | `app/event-day/page.tsx` | Probe now fetches the full manager row (status/name/phone/token). **none** → original opt-in banner · **invited** → "ממתין לאישור של {name}" + 📤 שלח שוב (re-opens wa.me + POSTs the SMS) + ↻ החלף מנהל (deletes the row, back to setup) · **accepted** → "✅ {name} מנהל/ת" + link to `/manage/[eventId]`. |

## 🅑 Dual-channel invite (WhatsApp + SMS)

| # | Item | File | Notes |
|---|---|---|---|
| B3 | Extract shared body | `lib/managerInvitation.ts` | New `buildInviteText(input)`; `buildManagerInviteWhatsapp` now calls it (single source of truth). |
| B1 | Twilio client | `lib/twilioClient.ts` (new, `server-only`) | `sendSms({to,body})` → `{ok, error?}`, never throws, feature-detects creds (same fetch pattern as `vendorNotificationsRich`). |
| B2 | Invite API | `app/api/manager/invite/route.ts` (new) | POST; builds the same text, sends SMS via `twilioClient`, **always 200** with `{ smsSent, smsError?, waUrl }` so the WhatsApp path is never blocked. |
| B4 | Setup wiring | `app/event-day/manager/setup/page.tsx` | `handleInvite`: kicks off the SMS POST first (not awaited — preserves the popup gesture), then `window.open(waUrl)`. Done screen shows two statuses (WhatsApp opened ✅ / SMS sent ✅ / sending ⏳ / skipped ℹ️). |

## 🅒 Tests + docs

- **C1** — Vitest was **not** installed (brief assumed it existed). Added `vitest` devDep + `vitest.config.ts` (`@/` alias) + `"test": "vitest run"` script + `tests/managerInvitation.test.ts` (6 cases: token/url/names/date present, no "Invalid Date" on empty/garbage date, valid → `wa.me/<phone>`, invalid → recipient-less, text === buildInviteText). All pass.
- **C2** — README "Momentum Live setup": `NEXT_PUBLIC_SITE_URL` (required), Twilio trio (optional, graceful), the two Supabase migrations.

## Scope honored

Phase 1 only — **did not touch** `/manage/[eventId]` dashboard, Crisis Mode, or Auto-Report (Phase 2/3). The accepted-state banner only *links* to the existing `/manage/[eventId]`.

## Deviations (flagged)

1. Tasklist/CHANGELOG numbered **R25** (not R23) — R23 docs already exist for the calculators track.
2. Vitest infra had to be created (brief said it existed).
3. SMS POST is initiated-before-but-not-awaited-before `window.open` — the codebase explicitly documents that awaiting before `window.open` gets the popup blocked; this satisfies "POST first, then WhatsApp" without breaking the primary channel.

## Files

New: `lib/twilioClient.ts`, `app/api/manager/invite/route.ts`, `components/LiveModeCTA.tsx`, `vitest.config.ts`, `tests/managerInvitation.test.ts`, this doc.
Modified: `lib/managerInvitation.ts`, `lib/navigation.ts`, `components/Header.tsx`, `app/dashboard/page.tsx`, `app/event-day/page.tsx`, `app/event-day/manager/setup/page.tsx`, `package.json`, `README.md`, `CHANGELOG.md`.
