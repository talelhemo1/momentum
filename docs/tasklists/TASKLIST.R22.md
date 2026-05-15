# TASKLIST · R22 — Calculators Reorganization + AI Packages (calculator #5)

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 5 pre-existing warnings) · `npm run build` ✅ (**44 routes**, +1 = `/api/ai/packages`)
**Status:** Code complete. Not committed/pushed/deployed yet (awaiting your go).

---

## What shipped

The 4 R21 calculators were split into **5 separate tabs** inside the budget page's
"מחשבונים" tab, and a 5th brand-new **AI Packages** calculator was added.

| Block | Item | File | Notes |
|---|---|---|---|
| 1A | Hub → tabs | `components/calculators/CalculatorsHub.tsx` (rewritten) | 5 luxury pills (scroll-snap mobile, centered desktop), gold active glow, gold divider, panel `min-h:600px` + `scale-in` fade on switch, tab persisted to **URL hash + localStorage**, `role=tablist/tab/tabpanel` + Arrow/Home roving + `aria-selected/controls`. |
| 2B | AI logic | `lib/aiPackagesCalculator.ts` (new) | Pure deterministic 3-package engine (3 base personalities × priority tilt, exact-sum rounding, pros/cons + vibe score) **+** `getAiPackages()` async wrapper that prefers the API and transparently falls back. |
| 2C | AI endpoint | `app/api/ai/packages/route.ts` (new) | POST, Bearer auth, **503 when no `OPENAI_API_KEY`** (client falls back), gpt-4o-mini + `json_object`, Hebrew system prompt, 5/user/day rate limit, never leaks internals. |
| 2D/E | AI UI | `components/calculators/AiPackagesCalculator.tsx` (new) | ₪ MoneyInput, guest stepper, 6 priority pills (pick exactly 3, ordered badges), big gold generate button, 3-card result (emoji, gradient-gold ₪/guest, ✓pros/✗cons, 10-seg gold vibe meter, select→localStorage), recommendation banner, loading skeleton ("AI חושב…"), error state. |
| 3F | Alcohol extract | `components/calculators/AlcoholCalculator.tsx` (new) | Full alcohol logic extracted from the 748-line page (state, persistence, effects, render, NumberField/SharePctField/ResultCard helpers). `app/alcohol/page.tsx` is now a thin wrapper (chrome + `<AlcoholCalculator/>`) — deep link still works. |
| 3G | Envelope extract | `components/calculators/EnvelopeCalculator.tsx` (new) | EnvelopeCard + ScenarioCard + RelationshipCalculator moved out of `budget/page.tsx`; renders haul + relationship breakdown from live state. |
| 4H | Shared shell | `components/calculators/CalculatorCard.tsx` (new) | Unified emoji+title+subtitle header, gold radial wash, gold 💡 tip footer. |
| 5L | Cleanup | `app/budget/page.tsx` | Removed the inline EnvelopeCard/ScenarioCard/RelationshipCalculator (~385 lines of now-dead code) + their `@/lib/envelope` imports + unused lucide icons + the dead `envelope` useMemo. |

## Deviations from the brief (deliberate, called out)

1. **§H "wrap all 5 in CalculatorCard"** — RealCost & WhatIf (R21) are already self-contained premium `card-gold` cards with their own headers/gold-wash. Wrapping them would double-card/double-title. Cohesion is instead achieved through the **shared design language** (`card-gold` + gold radial wash + `gradient-gold` mega numbers + identical gold 💡 tip footer via `HubTip`). AI/Alcohol/Envelope (shell-less content) DO use `CalculatorCard`. Net effect: every tab looks like one product; no risky surgery on working R21 components.
2. **Rate limit** — `/api/cfo/extract` counts a domain table; AI packages has none. Used an in-memory date-bucketed counter (per-instance, best-effort) instead of a schema migration. Documented in the route.
3. **Money units** — brief's `PackageInputs` uses ₪ (not agorot); kept as ₪ throughout this calculator for consistency with the spec.

## Files

New: `lib/aiPackagesCalculator.ts`, `app/api/ai/packages/route.ts`, `components/calculators/{CalculatorCard,AiPackagesCalculator,AlcoholCalculator,EnvelopeCalculator}.tsx`.
Modified: `components/calculators/CalculatorsHub.tsx` (full rewrite), `app/budget/page.tsx` (cleanup), `app/alcohol/page.tsx` (→ wrapper), docs.

## Cleanup verified

- `tsc` clean, `lint` 0 errors. Removed dead code: ~385 lines of envelope/relationship defs + 5 unused icon imports + dead `envelope` useMemo + 4 unused `@/lib/envelope` imports from `budget/page.tsx`. No duplicate logic remains (envelope lives only in `EnvelopeCalculator`, alcohol only in `AlcoholCalculator`).
- Build bundle did not balloon (44 routes vs 43; the +1 is the new API route, not page weight).
