# TASKLIST · R23 — Deepen Alcohol + "מעבדת התקציב" (was What If)

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 5 pre-existing warnings) · `npm run build` ✅ (44 routes)
**Scope (per your choices):** deep on the 2 first calculators now; the other 3 in later rounds.

---

## 1. Alcohol calculator — specific bottle selection

| Item | File | Notes |
|---|---|---|
| Preset catalog | `lib/alcoholCatalog.ts` (new) | 18 real Israeli bottles across wine/beer/spirits/soft, each with est. ₪ price, servings, container label. `summarizeSelection()` computes per-category coverage + cost. Pure. |
| Bottle picker UI | `components/calculators/AlcoholCalculator.tsx` | New collapsible "🍾 בחירת בקבוקים ספציפית": per category — a coverage bar (provided/needed servings, turns green when covered), catalog pills to add, "בקבוק משלי" for custom, and per-line **manual edit of name / price / servings / quantity**. Per-category subtotal + grand selection total. |
| Use-for-cost toggle | same | "השתמש בבחירה הספציפית לחישוב העלות" — when on (and ≥1 bottle picked) the main gold total switches from the heuristic to the actual chosen bottles; label changes accordingly. |
| Persistence | same | `bottleSelection` + `useBottleSelection` added to the existing `momentum.alcohol.v2` localStorage payload (hydrate + persist). |

This also satisfies "manual change of drink types": the host can now fully drive each category with explicit bottles + editable quantities/prices, on top of the existing advanced share editing.

## 2. "What If Simulator" → **מעבדת התקציב**

| Item | File | Notes |
|---|---|---|
| Rename | `WhatIfSimulator.tsx` (title), `CalculatorsHub.tsx` (tab label) | Displayed name is now **מעבדת התקציב**. Tab id stays `what-if` so existing `#what-if` deep links / saved tab still work. |
| +3 levers | `lib/whatIfSimulator.ts` | `decorTier` (בסיסי/סטנדרטי/מפואר, per-guest), `invitationTier` (דיגיטלי/מודפס/יוקרה, fixed), `photoExtras` (אלבום/רחפן/מגנטים/Same-Day, multi-select). `priceOf` extended; `impactHint` + label maps added. |
| UI | `WhatIfSimulator.tsx` | Two new PillRows + a multi-select extras row, each with its impact hint. `deriveBaseline` seeds sensible defaults so the delta-vs-now stays meaningful. |

## Deviations / notes

- Tab **id** intentionally kept `what-if` (only the label/title changed) to preserve URL-hash + localStorage continuity from R22.
- Bottle "needed servings" is derived from the existing heuristic result (`wine.glasses`, `beer` servings, `spirits.servings`, soft liters ÷ 0.33) so the coverage bars stay consistent with the top recommendations.

## Files

New: `lib/alcoholCatalog.ts`.
Modified: `components/calculators/AlcoholCalculator.tsx`, `components/calculators/WhatIfSimulator.tsx`, `components/calculators/CalculatorsHub.tsx`, `lib/whatIfSimulator.ts`, docs.

## Next rounds (not done this round, by your choice)

Deepen the remaining 3 — RealCost (💎), AI Packages (🤖), Envelope (💌) — same bar: more manual controls, clearer copy.
