# TASKLIST · R27 — Momentum Live Phase 3: Live Mode + Crisis + Wrapped

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ (46 routes; +1 `/api/crisis/broadcast`)

## ⚠️ ACTION REQUIRED BEFORE VERCEL DEPLOY

Run this in the **Supabase SQL Editor** first:

```
supabase/migrations/2026-05-17-event-memories.sql
```

Creates `event_memories` (table + open RLS + realtime) and the public
`event-memories` storage bucket. The Memory Album upload + kiosk feed
**will not work** until this runs. Idempotent — safe to re-run.
**Not deployed yet — awaiting your green light that the migration ran.**

---

## 🅐 Live Mode Auto-Switch

- **`components/eventDay/LiveModeView.tsx`** (new) — the couple's day-of view: 3 `StatBubble`s (הגיעו / אחוז+ring / נותרו) fed by `guest_arrivals`, **Supabase realtime** subscription (new arrival → `haptic.success()` + check-in sound + re-render), manager-presence card (green dot when accepted), latest-activity feed (last 10, relative time, staggered entrance), sticky quick actions (Memory Album / guest reminder).
- **`app/event-day/page.tsx`** — `isLiveDay` (event date === today) → renders `<LiveModeView>` instead of the default screen.

## 🅑 Crisis Mode

- **`lib/crisis.ts`** (new) — pure `detectCrises(ctx)`: vendor-late (15+/40+ min), low-arrival-≤30-min-before, payment-unconfirmed. Deterministic ids.
- **`app/api/crisis/broadcast/route.ts`** (new) — POST, Bearer auth, SMS-blasts every event manager via `twilioClient`, always 200 `{ sent, failed }`.
- **`app/manage/[eventId]/crisis/page.tsx`** — overhauled into a control room: amber gradient, live crisis cards (severity badge, "active since" timer, 📞/💬/📢 actions, resolve), `haptic.heavy()` on new critical, the 7 playbooks kept below. (built via sub-agent, verified tsc/lint clean.)

## 🅒 Wrapped Report (the peak)

- **`lib/reportGenerator.ts`** (new) — pure `generateReport(state)` → `EventReport` (duration, arrivals, rate, vendor names, envelope total, memory count, moments). Defensive.
- **`app/manage/[eventId]/report/page.tsx`** — overhauled into a full-screen **auto-advancing slide deck** (8 slides, 5s each, progress bars, tap-zones prev/next, pause): crown-spin intro → hours → arrivals → dance → vendors (chips) → envelopes (if any) → memory notes → thank-you + **share** (1080×1920 canvas → Web Share API / PNG download). Confetti on the final slide. Count-up numbers. Auth gate preserved.
- **`app/manage/[eventId]/page.tsx`** — 24h-after-event one-time modal "🎉 הסיכום שלכם מוכן!" (localStorage `momentum.report.shown.v1.{eventId}`).

## 🅓 Memory Album

- **`supabase/migrations/2026-05-17-event-memories.sql`** (new) — see action box above.
- **D1/D3 already implemented in `app/live/[eventId]/page.tsx`** — `UploadScreen` (client JPEG compression ≤1280px, q0.72 → Supabase storage `event-memories` → `event_memories` insert, friendly errors) reached via `?mode=upload`; `MemoryAlbum` masonry feed with realtime `postgres_changes` slide-in. The new migration is exactly what this existing code expects (table/bucket/columns match) — R27's job here was enabling it via D2.

## Manual test plan

1. Set an event to today → `/event-day` shows LiveModeView (bubbles, manager card, feed).
2. Insert a `guest_arrivals` row → bubble count-ups + haptic/sound, feed prepends.
3. `/manage/[eventId]/crisis` → control room; trigger a vendor with `agreedPrice` & no deposit → payment crisis card; 📢 → SMS broadcast toast.
4. `/manage/[eventId]/report` → 8 slides auto-advance; tap right=prev/left=next; last slide → share sheet / PNG.
5. 24h+ after event, open `/manage/[eventId]` → Wrapped-ready modal (once).
6. `/live/[eventId]?mode=upload` (after migration) → pick photo → compresses + uploads; kiosk feed slides it in live.

## Deviations / notes

- **D1/D3** were already present in the codebase and matched the spec exactly — no rewrite needed; D2 (migration) is what activates them. Flagged so it's a conscious confirmation, not an assumption.
- Wrapped data is **local-AppState-derived** (per the `generateReport(state)` signature); `firstDanceAt` isn't tracked locally so that slide is evocative copy, not a real timestamp. Vendor "logos" = name chips (no logo assets exist).
- Build verification hit a transient Google-Fonts fetch failure once; passed cleanly on retry (environmental, not code).
- Browser-preview verification skipped: these screens require Supabase + a live-day event + manager/arrival rows that don't exist in a bare local preview — tsc/lint/build are the meaningful gates here (consistent with the whole project).

## Files

New: `components/eventDay/LiveModeView.tsx`, `lib/crisis.ts`, `lib/reportGenerator.ts`, `app/api/crisis/broadcast/route.ts`, `supabase/migrations/2026-05-17-event-memories.sql`, this doc.
Modified: `app/event-day/page.tsx`, `app/manage/[eventId]/page.tsx`, `app/manage/[eventId]/report/page.tsx`, `app/manage/[eventId]/crisis/page.tsx`, `CHANGELOG.md`.
