# TASKLIST · R24 — Brand bottle catalog + deepen the other 3 calculators

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 5 pre-existing warnings) · `npm run build` ✅ (44 routes)
**Status:** Code complete. Not committed/deployed yet.

---

## 1. Alcohol — selection by company/brand (the reported gap)

The R23 catalog used generic names ("יין שולחן אדום") so brand selection
wasn't visible. Fixed:

| Item | File | Notes |
|---|---|---|
| Branded catalog | `lib/alcoholCatalog.ts` | Rebuilt `BOTTLE_CATALOG` with **~45 real Israeli-market bottles** carrying a `brand` field — wine (ברקן/כרמל/רקנאטי/ירדן/תבור…), beer (גולדסטאר/מכבי/טובורג/קרלסברג/Heineken… incl. kegs), spirits (Smirnoff/Absolut/Grey Goose/Johnnie Walker/Chivas/Jameson/Jack/Gordon's/Bombay/Olmeca…), soft (Coca-Cola/Pepsi/Sprite/פריגת/Schweppes/נביעות/מי עדן). New `catalogByBrand()` grouping helper; `brand?` added to `SelectedBottle`. |
| Brand-grouped picker | `components/calculators/AlcoholCalculator.tsx` | Picker now renders **grouped by brand** ("בחר לפי חברה:" → brand heading → that brand's bottles). Section header reworded ("בחירת בקבוקים לפי חברה" + brand examples) and now **defaults open** so it's discoverable. "בקבוק / חברה משלי" for anything not listed. |

## 2. Deepened the other 3 calculators (more manual control)

| Calc | File | Added |
|---|---|---|
| 💎 כמה אורח עולה | `RealCostPerGuestCard.tsx` | "מה אם יהיו __ מוזמנים?" inline override — recomputes ₪/guest live from the same total; reset link. |
| 🤖 3 הצעות AI | `AiPackagesCalculator.tsx` | On the **selected** package: an editable budget split — every category ₪ is editable, total + ₪/guest recompute live, "מותאם" marker + reset. |
| 💌 מעטפה | `EnvelopeCalculator.tsx` | "בדיקת תרחיש" panel — override event cost and/or guest count; recomputes the full recommendation via `calcEnvelope()` without touching the real budget; clear "מדומה" notice + revert. |

## Notes / decisions

- Brand prices are deliberately round 2026 estimates — still individually editable per line (R23 behaviour preserved).
- Envelope what-if uses the already-exported `calcEnvelope(type,total,guests)`; overrides are component-local state, never written to the app budget.
- AI package edits are card-local (don't mutate the generated result); resettable.
- Tab ids / storage keys unchanged → no migration, deep links intact.

## Files

Modified: `lib/alcoholCatalog.ts`, `components/calculators/AlcoholCalculator.tsx`, `components/calculators/RealCostPerGuestCard.tsx`, `components/calculators/AiPackagesCalculator.tsx`, `components/calculators/EnvelopeCalculator.tsx`, docs.

All 5 calculators now have meaningful manual controls; alcohol selection is by company as requested.
