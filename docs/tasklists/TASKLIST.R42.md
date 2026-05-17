# TASKLIST · R42 — Premium Landing Page + Launch Pricing (₪99 / ₪199)

**Date:** 2026-05-18 · `tsc` ✅ · `lint` ✅ (0 err; 6 pre-existing) · `build` ✅ · `test` ✅ 9/9 · live `/` verified (all sections render, no crash). No migration / env.

## Pricing — ₪399 → ₪99 (couple, one-time, launch); vendor ₪199/mo

Single source `lib/pricing.ts` premium → `priceILS:99`, `priceLabel
"₪99"`, launch sub-label + CTA. Free tier: "30 אורחים" → "50 אורחים"
(display-only, no enforcement found) and the stale "333 ספקים" claim
softened (post-R37). Hardcoded ₪399 prose fixed in: `app/pricing/page.tsx`
(metadata desc + body), `app/start/StartClient.tsx`,
`app/rsvp/RsvpClient.tsx`, `app/admin/dashboard/page.tsx` (revenue
projection `*399 → *99`; vendor `*199` unchanged). `/pricing` & `/start`
cards read `COUPLE_TIERS`, so they update automatically.

## New components (`components/landing/`)

`Hero` · `PainSection` · `SolutionSection` · `AppShowcase` (CSS-only
phone mock, no asset) · `PricingSection` · `HonestStats` · `FAQ`
(native `<details>` accordion — zero client JS) · `FinalCTA`.
`app/page.tsx` is now a thin composition (Header → Hero → Pain →
Solution → AppShowcase → **Pricing** → HonestStats → FAQ → FinalCTA →
Footer). The ~670-line inline landing (incl. the fabricated
testimonials) was deleted.

## Deliberate deviation (documented)

The spec asked `HonestStats` to show **"280+ ספקים"**. R37 deliberately
removed 332 seeded/fake vendors and you approved honest numbers —
printing "280+" here would directly contradict that and re-introduce a
fabricated figure on the section literally named *Honest*Stats. So the
vendor tile shows the **real dynamic count** (`{VENDORS.length}+ ספקים
מאומתים`, currently "1+", grows as approved vendors come in). The other
three stats (9 event types / 5 calculators / 100% Hebrew-RTL) are true.

## Design / a11y notes

- All headings use fluid `clamp()` (mobile-first; H1 ≥2.75rem on
  phones), generous `py-24 md:py-32`, single calm gold orb per section.
- **No `pulse-gold`** on the FinalCTA button: that utility is
  `display:none` under `prefers-reduced-motion` (R41 finding) — it
  would *hide* the primary CTA. Size + orb glow carry the emphasis,
  reduced-motion-safe.
- Hero secondary CTA + AppShowcase share `#showcase`; PricingSection is
  `#pricing`.

## Verification

tsc/lint(0)/build/test(9/9) green. Live `/` (public, no auth):
H1 / launch banner / ₪99 + struck ₪399 / Pain / Solution / Pricing
title / FAQ / FinalCTA all present, no crash, no error overlay
(only the pre-existing root-layout CSP-nonce hydration warning).
Screenshot confirms the premium hero.
