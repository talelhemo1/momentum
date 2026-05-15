# TASKLIST · R26 — Momentum Live Phase 2: Manager Experience Polish

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ (45 routes) · `npm run test` ✅ (6/6)
**Principle honored:** redesigned existing screens — **no new features**, all motion `transform`/`opacity` only, every animation force-disabled under `prefers-reduced-motion`, mobile-first.

---

## Shipped

| # | Item | Files |
|---|---|---|
| E2 | `lib/haptic.ts` — guarded `navigator.vibrate` wrapper (light/medium/heavy/success/error), never throws | new |
| E1 | `lib/managerSounds.ts` — Web-Audio synthesized subtle tones (no .mp3 assets), localStorage opt-in + **Settings toggle** "🔔 צלילי התראה במצב חי" | new + `settings/page.tsx`, `storage-keys.ts` |
| E3 | R26 keyframes block in `globals.css` — crown drop/spin, rise, cta-pulse, confetti, toast-in, critical-pulse, scanline, flash-ok/err, bubble-glow, caret — all behind one `prefers-reduced-motion` reset | `globals.css` |
| A1/A2 | **Accept page reveal**: deep gold bg + 3 tiny float orbs, crown drop→infinite slow spin, staggered rise sequence (greeting → "היי {firstName} 👋" 56px → subtitle → benefit cards), pulsing "אני בעניין ✨". On accept: gold **CSS confetti** + `haptic.success()` + sound + "🎉 ברוך הבא לצוות הניהול" → redirect 1.5s | `manage/accept/page.tsx`, `Confetti.tsx` |
| B1 | `StatBubble.tsx` — 120px gold disc, `useCountUp` number, optional SVG progress ring, one-shot glow on growth | new |
| B2 | Manager dashboard: 3 `StatBubble`s (הגיעו / אחוז+ring / נותרו) + giant 64px gradient-gold "פתח QR Scanner"; removed the old StatBox grid | `manage/[eventId]/page.tsx` |
| B3/B4 | `AlertToast.tsx` + `AlertToastStack` — slide-down, glass-lifted, severity-tinted, framer **swipe-right to dismiss**, auto-dismiss 8s (critical sticky + pulse), max-3 stack; wired to the existing smart-alerts (replaces the inline panel; onAction still dispatches the vendor action) | new + `manage/[eventId]/page.tsx` |
| D1 | `ActionSheet.tsx` + `VendorActionSheet` — framer drag-down/backdrop/Esc close, drag-handle, call/SMS/Waze actions | new |
| C1/C2 | Check-in screen (existing **search/manual** flow — no camera built, that'd be a new feature): cyan corner-bracket frame + looping scan-line, count-up arrivals, `haptic.success/error` + sound + green/red row flash + luxe toasts, "✏️ צ׳ק-אין ידני" heading, staggered row entrance | `manage/[eventId]/checkin/page.tsx` (via agent) |

## Manual test plan

1. `/manage/accept?token=…` — crown drops & spins, name/benefits rise in sequence, CTA pulses. ✅ build-verified; visually verify on device.
2. Tap "אני בעניין ✨" → gold confetti + welcome toast + redirect after 1.5s.
3. `/manage/[eventId]` — 3 StatBubbles count up from 0; the "אחוז" ring fills to the arrival %.
4. Trigger a smart alert (e.g. `setDismissedAlerts(new Set())` in console, or empty/overcrowded table) → slides down from top as a tinted toast.
5. Swipe a toast right → it flies off and dismisses; critical ones stay + pulse.
6. `/manage/[eventId]/checkin` — scan-line loops in the cyan frame; a successful check-in flashes the row green, vibrates, counts up.
7. `<ActionSheet>` drags down to close; backdrop/Esc close too.
8. On a phone with vibration: haptic felt on accept, check-in, alert.
9. OS "reduce motion" on → all R26 animations are static (content still visible), confetti hidden.
10. Settings → toggle "צלילי התראה" → a soft ding plays; check-in/alerts now audible.

## Deviations (flagged)

1. **Accept reveal data**: the `get_manager_invitation` RPC only returns invitee name/role/status — **no host first-names / date / guests / location**. Surfacing those needs an RPC change = backend feature = out of Phase-2 scope. The reveal uses the available data + the role-benefit cards as the staggered cards. (Documented; an RPC enrichment is a clean Phase-3 follow-up.)
2. **Check-in "scanner"**: the page is intentionally a search/manual list (documented in-file). A real camera/QR scanner is a **new feature**, explicitly out of scope — polished the existing manual flow with scanner *aesthetics* instead of faking a camera.
3. **Sounds**: synthesized via Web Audio (no `.mp3` binaries to add); same UX, zero assets.
4. **No `canvas-confetti` dep** → CSS confetti (`Confetti.tsx`) keyed off the existing keyframes.
5. **`VendorActionSheet`** is built + exported; the dashboard's existing vendor buttons keep their telemetry-logging behavior (rewiring them to contact actions would change behavior, not just redesign) — sheet is ready for adoption.

## Files

New: `lib/haptic.ts`, `lib/managerSounds.ts`, `components/managerLive/{StatBubble,AlertToast,ActionSheet,Confetti}.tsx`, this doc.
Modified: `app/globals.css`, `app/manage/accept/page.tsx`, `app/manage/[eventId]/page.tsx`, `app/manage/[eventId]/checkin/page.tsx`, `app/settings/page.tsx`, `lib/storage-keys.ts`, `CHANGELOG.md`.
