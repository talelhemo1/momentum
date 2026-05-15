# TASKLIST · R20 — Performance Phase 1 (zero visual changes)

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; pre-existing warnings only) · `npm run build` ✅ (43 routes)
**Scope:** internal optimizations only — **no blur / orb / animation / layout changes**. (An earlier R20 draft that touched those was reverted before this work; `globals.css` + `page.tsx` are back to R19 except the image swaps below.)

---

## Patches

| # | Item | Status | Notes |
|---|---|---|---|
| pre | `next.config.ts` | ✅ | Added `images.remotePatterns` for `images.unsplash.com` only (tight host scope, not an open proxy). Required for `next/image` on our catalog/gallery imagery. |
| A | `VendorCard.tsx:141` `<img>` → `next/image` | ✅ | `fill` + `sizes="(max-width:768px) 100vw,(max-width:1024px) 50vw,33vw"` + `quality={70}`. Existing hover-scale / ken-burns classes preserved → pixel-identical. |
| B | `page.tsx` InspirationGallery (8 imgs) → `next/image` | ✅ | `width={400} height={400}` + `sizes="(max-width:768px) 50vw,25vw"` + `quality={70}` + `priority={i<2}`. `.gallery-card img` CSS (100%/cover) keeps it visually identical. |
| C | Remaining `<img>` sweep | ✅ (scoped) | Converted every **Unsplash-backed** `<img>`: `compare/page.tsx:144`, `VendorQuickLook.tsx` ×2 (hero + similar). **Deliberately skipped** (converting would break them or need an open-proxy wildcard — violates the no-break / zero-visual rule): user-upload domains `dashboard/vendor-studio` ×2 + `LuxuriousTemplate` ×3 + `ReviewCard` (Supabase storage / arbitrary hosts), `data:`/`blob:` URLs `QrCanvas`, `event-day` QR, `ShareEventCard` preview, `live/[eventId]` ×2 (user live photos). |
| D | `vendors/page.tsx` Set membership | ✅ | `selectedIds`/`compareIds` `useMemo(new Set(...))`; cards now use `.has()` / `.size` instead of `Array.includes()` per-card per-render. `VendorCard` already accepted the props — no component change needed. |
| E | `ScrollProgress.tsx` no per-frame setState | ✅ | Dropped `useState`/`setScaleX`; `innerRef` + direct `innerRef.current.style.transform = scaleX(pct)` inside the rAF callback. Zero React re-renders while scrolling. Visual/transition unchanged (initial `scaleX(0)`). |

## Why some `<img>` stayed `<img>` (not an omission)

`next/image` needs the host whitelisted in `remotePatterns`. User-uploaded vendor/review/live media comes from Supabase storage or arbitrary domains we can't safely whitelist (open-proxy / breakage risk). `data:`/`blob:` URLs gain nothing from the optimizer. Per the "zero visual changes, don't break anything" directive these were left as-is — each already had a documented `eslint-disable` from a prior round.

## Files touched

`next.config.ts`, `app/page.tsx`, `app/compare/page.tsx`, `app/vendors/page.tsx`, `components/vendors/VendorCard.tsx`, `components/vendors/VendorQuickLook.tsx`, `components/ScrollProgress.tsx`, docs (`TASKLIST.R20.md`, `CHANGELOG.md`).

## Expected impact

- Catalog/gallery images: responsive `srcset` + WebP/AVIF + lazy → smaller first paint, less bandwidth.
- Vendors grid: O(1) selected/compare lookups instead of O(n·m) per render.
- Scrolling: ScrollProgress no longer re-renders ~60×/sec.
