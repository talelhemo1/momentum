# TASKLIST · R21 — Smart Calculators Hub

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 4 pre-existing warnings) · `npm run build` ✅ (43 routes)
**Status:** Code complete. Not committed/pushed/deployed yet (awaiting your go).

---

## What shipped

A unified **🧮 מחשבונים חכמים** tab on `/budget` with 4 calculators:
2 brand-new + the 2 existing (alcohol, envelope) folded into the same luxury hub.

| Block | Item | File | Notes |
|---|---|---|---|
| 1A | Real-cost logic | `lib/realCostPerGuest.ts` | Pure, agorot-based. 7-bucket breakdown. Uses real budget lines when ≥3 exist, else Israeli benchmarks (4 tiers). Smart insight generator (food/alcohol/photo anomalies + "תקורה" education). |
| 1B | Real-cost card | `components/calculators/RealCostPerGuestCard.tsx` | Huge count-up ₪/guest (gradient-gold, clamp 48–76px), sorted horizontal bars w/ tap/hover popovers, insights, WhatsApp share, benchmark-tier picker, empty state w/ CTA. |
| 2C | Simulator logic | `lib/whatIfSimulator.ts` | Pure. **Non-linear venue** (fixed base + per-head), per-head meal/bar, fixed photo tiers. Delta vs baseline + savings-equivalents. |
| 2D | Simulator UI | `components/calculators/WhatIfSimulator.tsx` | Gold range slider (50–400) + 4 pill groups, live count-up total, green/red delta pill, gold/red flash on change, savings-equivalents w/ icons, save-snapshot (localStorage `momentum.whatif.snapshot.v1`) + reset. |
| 3F | Hub wrapper | `components/calculators/CalculatorsHub.tsx` | Header (icon/title/auto-update tip), responsive 1-col↔2×2 grid, alcohol link-card + live envelope summary card, per-calculator 💡 tip lines (Block I copy). |
| 3E | Integration | `app/budget/page.tsx` | New `"calculators"` tab between תקציב and AI CFO. |
| 4 | Luxury design | `app/globals.css` | `.r21-range` (gold glow thumb, 44px touch wrap), `.r21-flash-save/-cost` keyframes. card-gold + soft gold radial washes, gradient-gold mega numbers. |
| 5 | Integrations | — | Both new calcs read live `useAppState` via the page. Empty state (no guests → CTA), benchmark fallback notice, count-up animations, delta flash. |

## Deviations from the brief (deliberate, called out)

1. **Data shape** — the brief's pseudo-code used `state.budget.total / state.budget.items`. The real AppState is `budget: BudgetItem[]` with the cap on `event.budgetTotal`. All logic was mapped onto the **real** types. There is no `alcohol` BudgetCategory, so an explicit alcohol/bar line is detected by keyword and pulled into its own bucket; otherwise alcohol shows via the benchmark path.
2. **Mobile layout** — brief §F said "tab selector on mobile", §H said "stack vertically". These conflict; chose **single responsive grid** (1-col mobile → 2×2 desktop, all visible) to avoid double-mounting the stateful simulator. The `/budget` page already has a top-level tab system, so the Hub itself doesn't need a second one.
3. **Alcohol card** — embedding the full `/alcohol` calculator inline would duplicate a 700-line page; instead a polished link-card routes to it (full calc unchanged).
4. **SAVINGS_THRESHOLDS** — brief amounts were off by 100× vs. agorot; corrected to true agorot (₪50K = 5,000,000 agorot) while keeping the brief's labels.

## Files

New: `lib/realCostPerGuest.ts`, `lib/whatIfSimulator.ts`, `components/calculators/{RealCostPerGuestCard,WhatIfSimulator,CalculatorsHub}.tsx`.
Modified: `app/budget/page.tsx`, `app/globals.css`, docs.
