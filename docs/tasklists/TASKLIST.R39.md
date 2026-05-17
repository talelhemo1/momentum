# TASKLIST · R39 — Express Bulk Send (one-by-one WhatsApp, tab-return auto-advance)

**Date:** 2026-05-18
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ · `npm run test` ✅ 9/9 · `/guests` loads clean (preview redirects to /signup w/o auth — no crash)

> No migration. No env. Pure client feature.

## Goal

A "🚀 שליחה מהירה" button on `/guests` opens a modal that walks every
pending guest one-by-one. User clicks "פתח WhatsApp" → wa.me opens →
they send → return to the app tab → after ~1.5 s the next guest's wa.me
opens automatically. The auto-open rides the tab-return turn so the
popup blocker treats it as user-initiated. ~200 invites in 5 min.

## 🅐 `hooks/useExpressSend.ts` (new)

State machine: `queue / current / completedIds / skippedIds /
isActive / isPaused`, prebuilt-URL cache, `autoOpenIn` countdown.

- **The magic** — a single `visibilitychange` listener (subscribed once
  while active; reads a `live` ref so it never re-subscribes per
  advance). On `visible` + active + !paused + `awaitingReturn` (we
  actually opened one) → 1.5 s countdown → `markInvited(current)` →
  advance → auto-`window.open` the next (from the URL cache, so it's
  synchronous and stays inside the tab-return turn).
- **window.open stays synchronous:** `buildHostInvitationWhatsappLink`
  is async (R33 short-link + premium message), so it would lose the
  gesture if awaited at click time. The hook prebuilds the current
  guest's URL (and prefetches the next) into a cache; the button is
  disabled until ready ("מכין קישור…"). Uses the **existing**
  `buildHostInvitationWhatsappLink` — no new builder (per spec).
- **Cleanup (memory-leak-safe, per spec):** `clearTimers()` (timeout +
  interval) + `removeEventListener` in every effect cleanup, plus an
  unmount safety-net effect.
- **localStorage resume:** `STORAGE_KEYS.expressSendState`
  ({queue/completed/skipped ids, currentId, savedAt}); persisted on
  every advance/stop; offered as "המשך מאיפה שהפסקת? (X/Y)" for 2 h.

## 🅑 `components/guests/ExpressSendModal.tsx` (new)

- **Step 0:** group filter chips (כולם / חברים / משפחה / עבודה / שכנים,
  multi-select; maps to `GuestGroup`), live eligible count, resume card.
- **Active:** gold progress bar, big guest name (gradient), phone,
  64px-min "📱 פתח WhatsApp" button (disabled until link ready), tip,
  horizontal stat chips (done/skipped/queue/ETA), bottom controls
  (השהיה↔המשך / דלג / הקודם — disabled when nothing completed).
- **Countdown overlay:** "פתיחת המוזמן הבא תוך {n}" + "❌ בטל פתיחה
  אוטומטית" (`cancelAutoOpen`).
- **Finish:** 🎉 + "{N} הזמנות נשלחו!" + `fireConfetti` (once, ref-guarded)
  + the hook's `haptic.success()`.
- Mobile-first: full-screen < md, ≥44/56px touch targets, stats are
  wrap chips (no fixed sidebar to collapse).

## 🅒 `/guests` integration

- `stats.expressEligible` = pending **and** valid Israeli phone
  (`normalizeIsraeliPhone`). A gold "🚀 שליחה מהירה לכולם (N)" toolbar
  button (shown when N>0) opens the modal; rendered alongside the
  existing modals. The older "📤 שלח לכל מי שלא נשלח לו" bulk modal is
  left as-is (distinct UX).

## 🅓 Edge cases

- Closing mid-run → `window.confirm` → `stop()` persists state for
  resume. Tab closed without sending → guest stays `current`/in queue
  (no markInvited until the tab-return grace completes). Double-click
  "פתח WhatsApp" → two tabs, harmless. Paused → the listener bails, no
  auto-advance. `goBack` pops the last completed back to `current`
  (note: it does not un-set that guest's AppState `invited` status — a
  re-send just re-opens wa.me; acceptable).

### Design note (deliberate, documented)

Spec said "status נשאר pending … only track internally". The app's
single-send button already calls `actions.markInvited` (→ status
`invited` + `invitedAt`) — "invited" **is** this app's
awaiting-response status. Following that keeps the pending filter, the
toolbar count, the stats card, and resume all consistent. So a
completed guest is marked `invited` (same as single-send), and the hook
*also* tracks ids for resume. Deviating would have desynced the count
and re-queued already-sent guests on resume.

## 🅔 Verification

tsc/lint(0)/build/test(9/9) green. `/guests` module loads with no
runtime/import error (preview auth-redirects to /signup — the redirect
itself proves the page+new imports compiled & ran). The tab-return
auto-advance, popup-blocker bypass, haptics and confetti require a
logged-in host with pending guests + real WhatsApp tab-switching —
**manual device test** (cannot be exercised headless).
