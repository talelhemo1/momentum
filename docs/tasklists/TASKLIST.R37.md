# TASKLIST · R37 — Remove all seeded vendors except the one real one

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ · `npm run test` ✅ 9/9 · live `/vendors` DOM verified ✅

> No migration. No env. Static-data cleanup + honest launch copy.

## 🅐 lib/vendors.ts — one real vendor

Removed ~332 seeded/demo vendors. `VENDORS` now holds a single
verified entry: **דפוס אומן** (בית דפוס, נהריה).

- **`type` fix vs. spec:** the spec used `type: "invitations"` — that
  is **not** a `VendorType` (it's a budget-category value). The correct
  type for a print house is **`"printing"`** (per the R11 comment in
  `lib/types.ts`; label `"בתי דפוס"`). Used `"printing"`, `region:
  "north"`, `reviews: 0`.
- **Placeholders flagged:** phone `972-4-992-0000` and IG/FB/website are
  `TODO(owner)` — I don't have the real דפוס אומן contact details and
  won't fabricate them. **Please send the real phone + any IG / FB /
  website and I'll fill them in.**

## 🅑 Empty state + card

- **`app/vendors/page.tsx` `SmartEmptyState`** — added a launch-honest
  recruiting block: *"אנחנו בונים את הקטלוג יחד עם הספקים הראשונים
  בישראל"* + a gold CTA **"🎯 אתה ספק? הצטרף אלינו עכשיו"** → `/vendors/join`.
  (Spec said `/vendors/welcome`; that route doesn't exist — `/vendors/join`
  is the real vendor application page. Using a real route avoids a dead
  link.) The existing filter-clear actions were kept.
- **`components/vendors/VendorCard.tsx`** — `reviews === 0` now renders a
  *"ספק חדש"* badge instead of a fabricated rating/`(0)` count.

## 🅒 Homepage honesty

- **CategoryShowcase** — dropped the fake per-category counts
  (`24+`/`22+`); body copy → "אנחנו בהשקה — ומצרפים ספקים אמיתיים בכל
  יום… בלי מספרים מנופחים"; tiles show "בהרחבה — מצטרפים ספקים".
- **StatsCounter** — `100+ ספקים בקטלוג` → **dynamic `{VENDORS.length}`**
  "ספקים מאומתים / גדל מדי יום — הצטרפו" (auto-grows as real vendors
  are added; never stale again).
- Generic, number-free labels ("ספקים בקטלוג" in SocialProof / a
  FeatureCard / a TrustBadge) left as-is — they're capability copy, not
  inflated counts (C2 targets numeric "X+ ספקים").

## 🅓 Robustness audit

Every `VENDORS` consumer uses `.find()` / `.filter()` / `.length` — no
direct index access anywhere (`grep "VENDORS\["` → none). Safe on a
1-element array:
- `store.ts` add-vendor guards `vendor && …` (orphaned saved ids just
  resolve to undefined — no crash, no phantom budget line).
- compare / event-day / crisis / my use `.map(id => find).filter(Boolean)`.
- `lib/aiAssistant.ts` — the region count is already dynamic from
  `VENDORS`; added a graceful 0-case ("הקטלוג בהקמה…") so it never says
  "גישה ל-0 ספקים".

## 🅔 Verification (live)

`/vendors` DOM: `דפוס אומן` renders · "1 ספקים נמצאו" · "ספק חדש" badge ·
"בתי דפוס" · "צפון" · **zero** old seeded names (אולם הכוכב / סטודיו
אלון / גני המלך all gone) · no error boundary. Only the pre-existing
CSP-nonce hydration warning in the root layout (untouched by R37).

## Follow-ups for the owner

1. Real **דפוס אומן** phone + IG/FB/website → I'll update `lib/vendors.ts`.
2. (Still open from R36) Terms §19 legal-entity details.
