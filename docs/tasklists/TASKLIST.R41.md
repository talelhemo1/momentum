# TASKLIST · R41 — Hybrid Dashboard Redesign (Intimate Hero + Journey Path)

**Date:** 2026-05-18 · `tsc` ✅ · `lint` ✅ (0 err; 6 pre-existing) · `build` ✅ · `test` ✅ 9/9 · `/dashboard` module loads clean (preview auth-redirects to /signup — no crash). No migration / env.

## Layout (top → bottom)

`IntimateHero` → `TodayCard` → `JourneyPath` → `LiveModeCTA` →
`InvitationActivityCard` (guests>0) → `StatsStrip` → quiet "כל הכלים"
(ToolsSection). Container narrowed to `max-w-3xl` for intimacy; one calm
gold orb (was a big orb + event-type-tinted second orb — trimmed).

## 🅐 `components/dashboard/IntimateHero.tsx` (new)

Type badge (emoji+label) · couple names (clamp 2.5–3.5rem gradient
gold) · Hebrew long date · big `useCountUp` countdown ("עוד N ימים",
reduced-motion-safe) with today / past states. **No cover photo:**
`EventInfo` has no such field — the spec's optional `coverPhotoUrl`
branch was intentionally omitted rather than adding an unused schema
field (gradient-only background). The "no event" state isn't built —
the page redirects to /onboarding when there's no event, so the
dashboard never renders without one.

## 🅑 `components/dashboard/JourneyPath.tsx` (new)

Vertical path from `getJourneyForState(state)`: 64px circle per stage
(✓ done / number active / 🔒 locked) + connector line (gold once a
stage is done) + card (title, desc, "התקדם →" on the active step,
'ייפתח אחרי "{prev}"' when locked). Crossing a milestone (post-mount
`done` increase) fires a small **reduced-motion-aware** `fireConfetti`.
**Active marker is a static gold glow, not a pulse** — `.pulse-gold` is
`display:none` under `prefers-reduced-motion`, which would *hide* the
active circle; a static box-shadow is safe and always visible. No audio
(deliberately quiet on the couple's dashboard; avoids surprise sound +
extra infra).

## 🅒 TodayCard / 🅓 StatsStrip (in page.tsx)

- **TodayCard:** if `0 ≤ daysLeft ≤ 14` and pending guests exist →
  "send invites" (→ /guests); else the active journey step; else
  "הכל מוכן". One gold card, "✨ מה היום?" + "בצע עכשיו ←".
- **StatsStrip:** one slim row — `👥 confirmedHeads/total · 💰 ₪spent
  (pct%) · 🤝 N ספקים · ⚡ N שלבים פתוחים`. No invented denominators
  (R37 honesty); vendors shows just the saved count.

## 🅔 Removed / kept

Deleted the dead `Hero`, `NextActionCard`, `StatCard`, `JourneyCard`
inline components + their now-unused imports (useRef, useCountUp,
formatEventDate, EVENT_TYPE_LABELS, REGION_LABELS, 8 icons) — lint
verified clean. **Kept** `LiveModeCTA` (self-gates ≤14d),
`InvitationActivityCard`, `WelcomeBanner`. `ToolsSection` was **not**
deleted (no `/menu` route exists; removing tool access is a regression)
— moved to a de-emphasized "כל הכלים" section at the very bottom.

## 🅕 Mobile / polish

Hero `min-h: min(60vh,460px)`, fluid `clamp()` type (≥2.5rem mobile),
44px-min "התקדם" target, `tabular-nums` countdown. All animations
reduced-motion-safe (useCountUp honors it; confetti gated; active glow
is static).

## Verification

tsc/lint(0)/build/test(9/9) green; `/dashboard` compiles & runs (auth
redirect proves the module + new components loaded). Full visual check
(hero, journey path, milestone confetti) needs a logged-in host with an
event — manual.
