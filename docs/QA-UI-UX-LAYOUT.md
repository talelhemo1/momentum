# QA Report — Layout, UI/UX & End-to-End Flows

**Product:** Momentum (momentumA)  
**Date:** 2026-05-26  
**Scope:** User-reported issues (screenshots + terminal) plus related internal findings  
**Status:** Confirmed in code review — fixes not yet implemented  
**Verification method:** Static analysis (source + user screenshots). Limited live runtime QA in this session.

---

## Disclaimer — environment & testing limits

This report was prepared under constraints that affect what we can claim with certainty:

| Limitation | Implication |
|------------|-------------|
| **Local environment** | We do **not** have full access to run every QA scenario locally (e.g. signed-in flows against live backends, WhatsApp Business send, payment/upgrade checkout, production-like auth, or a device matrix). Findings marked “confirmed” for UI/layout issues are primarily from **code inspection** and **user-provided screenshots**, not from an exhaustive local test pass. |
| **Production** | We **cannot** assume that production behaves the same as local dev. Config, CSP, analytics, PWA install, Supabase/auth, WhatsApp webhooks, rate limits, and CDN/caching may differ. Issues called out here should be **re-verified on staging or production** before sign-off or release. |
| **What this doc is** | A concrete engineering + QA spec: likely root causes, proposed fixes, and retest steps. It is **not** a certificate that all items were manually executed end-to-end in every environment. |
| **What we did not verify here** | Examples (non-exhaustive): actual PDF output in Chrome/Safari print dialog; scroll-lock behavior on real iOS Safari; light mode after hard refresh on production URL; WhatsApp RSVP send success/failure; hydration without browser extensions on a clean profile. |

**For sign-off:** Treat each “QA retest” section below as a **checklist for whoever has access** to the target environment (staging preferred; production only when appropriate), not as completed results from this review.

---

## Executive summary

All six user-reported issues are **confirmed** or **partially confirmed** against the current codebase (static review). Root causes cluster around:

1. **Modal overlay design** — semi-transparent blurred backdrops without scroll lock
2. **Duplicated branding** in the header
3. **Theme system gaps** — CSS tokens exist for light mode, but several components use hardcoded dark values
4. **PDF export** — `window.print()` on pages that lack a print-friendly layout (especially seating)

---

## Issue matrix

| # | Area | User report | Verdict | Severity |
|---|------|-------------|---------|----------|
| 1 | Route upgrade modal | Background too transparent; page text bleeds through | **Confirmed** | High |
| 2 | Terminal + light mode | Console errors; light theme looks wrong | **Partial** (errors mostly extension-related; light mode bugs confirmed) | Medium–High |
| 3 | Header logo | Two “Momentum” labels | **Confirmed** | Medium |
| 4 | Seating — new table modal | Background scrolls; blur distracts | **Confirmed** | High |
| 5 | Seating — PDF export | Export does not work | **Confirmed** (no dedicated print layout) | High |
| 6 | Guests — WhatsApp modal | Modal appears at bottom; user must scroll | **Confirmed** (intentional mobile pattern, poor UX) | High |

---

## 1. Route upgrade modal — backdrop readability

### What the user sees

On **Settings → מסלול ותשלומים** (or avatar menu → upgrade), the “שדרוג מסלול” dialog shows the page hero (“המוצר שלך, השליטה שלך”) and glow effects through the overlay. Text inside and behind the modal competes visually.

### Code evidence

`components/UpgradePlanModal.tsx`:

- Backdrop: `bg-black/75 backdrop-blur-sm` (~75% opacity + blur)
- No `overflow: hidden` on `document.body` while open
- Page behind uses `glow-orb` and large `gradient-text` headings (`app/settings/page.tsx`)

Shared modal primitive `components/Modal.tsx` uses `bg-black/70 backdrop-blur-sm` — same class of problem for any dialog using it.

### Why it happens

- Backdrop opacity is tuned for aesthetics, not for **isolating** foreground content from busy pages.
- `backdrop-blur-sm` keeps background shapes legible instead of obscuring them.
- Decorative layers (`glow-orb`, gradient headings) sit at high visual weight and are not dimmed when a modal opens.

### Recommended changes

| Change | Rationale |
|--------|-----------|
| Increase backdrop opacity to `bg-black/85`–`90` (or opaque `var(--background)` with 90% alpha) | Blocks bleed-through text |
| Reduce or remove backdrop blur on modals (`backdrop-blur-none` or minimal) | Less “ghost” of background content |
| Add `useScrollLock()` when any modal opens (`body { overflow: hidden }`) | Stops background scroll and reduces distraction |
| Optional: hide/dim `glow-orb` and page hero while `role="dialog"` is open (e.g. `body:has([aria-modal="true"]) .glow-orb { opacity: 0 }`) | One CSS rule, global effect |
| Audit all overlays: `Modal`, `UpgradePlanModal`, `TableModal`, settings delete/restart dialogs | Consistent overlay tokens |

### QA retest

1. Open upgrade modal from avatar menu on `/settings`.
2. Confirm hero text is **not** readable through overlay.
3. Confirm modal content (pricing cards, feature list) meets WCAG contrast on its surface.
4. Repeat on `/dashboard` with upgrade entry points if any.

---

## 2. Terminal errors & light mode

### 2a. Terminal / hydration warnings

#### What the user sees

Next.js dev overlay: “A tree hydrated but some attributes of the server rendered HTML didn't match the client.”

#### Code / log evidence

Terminal diff shows attributes injected **only on the client**:

- `data-darkreader-mode`, `data-darkreader-scheme`, `data-darkreader-proxy-injected` on `<html>`
- `cz-shortcut-listen` on `<body>`
- Style normalization differences on `ScrollProgress`, `Header`, `MobileBottomNav` (camelCase vs kebab-case, Dark Reader CSS variables)

#### Verdict

**Not an application bug** when Dark Reader (or similar) is enabled. The app does not set those attributes in `app/layout.tsx` or `lib/theme.ts`.

#### Recommended actions

| Audience | Action |
|----------|--------|
| QA | Retest in a clean profile **without** Dark Reader / style extensions |
| Docs | Note “disable extensions for hydration QA” in test environment |
| Optional hardening | `suppressHydrationWarning` on `<html>` only if product policy allows (already used on theme bootstrap scripts) |

Secondary log lines (`Ignoring Event: localhost` from Plausible) are **expected** on localhost — not failures.

### 2b. Light mode not working as intended

#### What the user sees

After switching to בהיר (light) in Settings, the UI still feels dark: olive/gold glow, low-contrast headings, dark header bar.

#### Code evidence

**Theme plumbing works:**

- `lib/theme.ts` sets `document.documentElement` attribute `data-theme="light"|"dark"`
- `app/layout.tsx` inline script reads `localStorage` key `momentum.theme.v1` before paint
- `app/globals.css` defines `:root[data-theme="light"]` with full token overrides (lines 70–121) and light-mode utility patches (lines 969–1027)

**Gaps that explain broken light mode:**

| Location | Problem |
|----------|---------|
| `components/Header.tsx` | Inline `background: rgba(10,10,15,0.7)` — **hardcoded dark**, ignores `data-theme` |
| `components/Header.tsx` | Avatar dropdown uses `linear-gradient(170deg, #1A1A1F … #0A0A0F)` — dark-only |
| `app/layout.tsx` `viewport.themeColor` | Fixed `#0A0A0B` — mobile browser chrome stays dark |
| Page-level `glow-orb` | Still rendered on settings/guests/seating; only reduced via `[data-theme="light"] .glow-orb { opacity: 0.35 }` |
| Many pages | `hover:text-white`, `text-white/55` — partially patched in CSS but inconsistent vs `var(--foreground-*)` |
| `components/guests/WhatsAppRsvpModal.tsx` | Hardcoded `text-white/55`, `text-white/70` — poor contrast on light cards |

#### Recommended changes

1. Replace Header inline colors with CSS variables, e.g. `var(--glass-strong-bg)` / `color-mix(in srgb, var(--background) 88%, transparent)`.
2. Theme-aware dropdown surfaces using `var(--surface-1)` / `var(--surface-2)`.
3. Dynamic `themeColor` meta (or `useEffect` updating `meta[name=theme-color]`) when theme toggles.
4. In light mode, reduce or disable `glow-orb` on **settings** and form-heavy pages (`opacity-0` or remove element).
5. Migrate page copy from `text-white/*` to semantic tokens (`var(--foreground-soft)`).
6. Add visual regression checklist for light mode on: `/settings`, `/guests`, `/seating`, `/dashboard`.

### QA retest (light mode)

1. Settings → ערכת נושא → בהיר.
2. Header background should match light surfaces (not near-black bar).
3. Page title “המוצר שלך, השליטה שלך” must be clearly readable (contrast ≥ 4.5:1).
4. Account card email row readable without glow behind it.
5. Reload page — theme persists, no flash of wrong theme.

---

## 3. Duplicate “Momentum” in header

### Verdict: **Confirmed**

| Component | Content |
|-----------|---------|
| `components/Logo.tsx` | SVG mark + text **“Momentum”** |
| `components/Header.tsx` | Renders `<Logo />` **and** `<span className="… gradient-gold-shimmer">Momentum</span>` |

### Recommended fix

**Option A (preferred):** Remove the extra `<span>Momentum</span>` in `Header.tsx`; rely on `Logo` alone (optionally pass `showText={false}` on small screens if needed).

**Option B:** Add `showWordmark?: boolean` to `Logo` and use Header only for layout, not duplicate text.

### QA retest

Header shows exactly **one** wordmark on mobile and desktop.

---

## 4. Seating — “New table” modal & background scroll

### Verdict: **Confirmed**

`app/seating/page.tsx` — `TableModal`:

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" …>
```

- Same semi-transparent + blur pattern as issue #1
- **No body scroll lock** in `useEffect`
- Parent `<main className="… overflow-hidden">` does not prevent **document** scroll; user still sees page scrollbar (screenshot 4)

### Recommended changes

1. Introduce shared `useScrollLock(active: boolean)` used by all `fixed inset-0` dialogs.
2. Standardize overlay token: e.g. `modal-overlay` class with `background: color-mix(in srgb, var(--background) 92%, transparent)` and optional light blur.
3. Consider `overscroll-behavior: none` on overlay container.
4. For seating specifically: when modal open, set `aria-hidden="true"` on main content (accessibility).

### QA retest

1. `/seating` → **שולחן חדש**
2. Background must **not** scroll (wheel, trackpad, touch).
3. Only modal panel scrolls if content exceeds viewport.
4. Closing modal restores scroll position.

---

## 5. Seating — PDF export not working

### Verdict: **Confirmed** (design gap, not a single broken click handler)

`components/PrintButton.tsx` only calls `window.print()`.

`app/seating/page.tsx` content is an interactive **3D-style floor** (`floor-3d`, transforms, chairs). Global print CSS (`app/globals.css` `@media print`) hides chrome and styles cards but **does not** provide:

- A table → guest list layout for print
- Flattening of 3D transforms for reliable output
- Hiding of interactive side panels / empty states

Likely user outcomes: blank PDF, cropped visual floor, or unusable layout — reported as “not working.”

### Recommended changes

| Approach | Effort | Outcome |
|----------|--------|---------|
| **A. Print-only block** | Medium | Add `<section className="hidden print:block">` with tables: `#`, name, capacity, guest names per table |
| **B. Dedicated export** | Higher | Generate PDF via server or `jspdf` / print CSS HTML template |
| **C. UX honesty** | Low | Until A/B: toast “ייצוא הושבה זמין בקרוב” or open print preview with instructions |

Guests/budget/balance pages are better candidates for `window.print()` because they are list-oriented; seating needs **A** at minimum.

### QA retest

1. Create ≥2 tables with named guests.
2. Click **ייצא ל-PDF**.
3. Print preview shows **readable Hebrew table list** with all tables and assignments.
4. Save as PDF — content matches preview.

---

## 6. Guests — WhatsApp RSVP modal position

### Verdict: **Confirmed** (by design, poor for desktop and scrolled pages)

`components/guests/WhatsAppRsvpModal.tsx`:

```tsx
className="fixed inset-0 z-[80] flex items-end sm:items-center …"
```

- **Mobile (`< sm`):** bottom sheet (`items-end`) — matches screenshot 5 (modal cut off at bottom)
- **Desktop:** centered — may still appear “low” if user scrolled before open (no scroll lock, no scroll-into-view)

Also missing: `role="dialog"` / `aria-modal`, body scroll lock, shared `Modal` primitive.

### Recommended changes

1. Use shared `Modal` (centered) for consistency, **or** keep bottom sheet only below `md` with safe-area padding.
2. On open: `document.body.style.overflow = 'hidden'` and `modalRef.current?.scrollIntoView({ block: 'center' })`.
3. Replace hardcoded `text-white/*` with theme tokens.
4. Align z-index scale with other modals (document layer order).

### QA retest

1. `/guests` — scroll midway down, open WhatsApp RSVP flow.
2. Modal fully visible without scrolling the page.
3. Works on mobile (375px) and desktop (1280px).

---

## Additional findings (recommended backlog)

| ID | Finding | Location | Suggestion |
|----|---------|----------|------------|
| A1 | **No shared scroll-lock** | All modals | `hooks/useScrollLock.ts` + use in every overlay |
| A2 | **Modal inconsistency** | 10+ custom overlays | Consolidate on `Modal` + variants (`centered`, `sheet`) |
| A3 | **Backdrop blur + low opacity** | Upgrade, Table, Delete account, etc. | Design token `--modal-overlay` |
| A4 | **`hover:text-white`** on back links | guests, budget, vendors, seating | Use `hover:opacity-100` + `var(--foreground)` |
| A5 | **Bottom-sheet pattern on desktop** | `WhatsAppRsvpModal`, `VoiceCampaignModal`, `VendorChatModal` | `items-center` default; `items-end` only `max-sm` |
| A6 | **Print on guests** | May work better than seating but guest table should be verified | Add `print:` table styles if missing |
| A7 | **“1 Issue” dev badge** | Next.js overlay | Not production; document for QA environment |
| A8 | **RTL modal close button** | Mixed `left-4` / logical properties | Prefer `end-4` for RTL consistency |

---

## Suggested implementation order

1. **Quick wins:** Duplicate logo (#3), body scroll lock + darker overlay (#1, #4, #6)
2. **Theme:** Header + themeColor + glow on settings (#2)
3. **Seating PDF:** Print-only seating table (#5)
4. **Hardening:** Modal primitive adoption, light-mode sweep (#A1–A5)

---

## Test environment checklist

*To be executed by someone with access to staging/production (or a fully configured local env). Not completed as part of this document’s authoring.*

- [ ] Chrome/Edge latest, Hebrew RTL
- [ ] Safari iOS (PWA safe areas)
- [ ] Extensions **disabled** for hydration tests
- [ ] Test both `data-theme="dark"` and `data-theme="light"`
- [ ] Viewports: 390×844, 768×1024, 1280×800
- [ ] Flows: settings upgrade, seating add table, guests WhatsApp modal, PDF export
- [ ] **Staging or production URL** (do not infer prod behavior from `localhost` alone)
- [ ] WhatsApp / backend-integrated flows (if in scope for the release)

---

## File reference index

| Topic | Files |
|-------|--------|
| Upgrade modal | `components/UpgradePlanModal.tsx` |
| Shared modal | `components/Modal.tsx` |
| Header / logo | `components/Header.tsx`, `components/Logo.tsx` |
| Theme | `lib/theme.ts`, `app/globals.css`, `app/layout.tsx` |
| Seating modal / page | `app/seating/page.tsx` (TableModal ~L1231) |
| Guests WhatsApp modal | `components/guests/WhatsAppRsvpModal.tsx` |
| PDF button | `components/PrintButton.tsx`, `app/globals.css` (@media print) |
| Settings layout | `app/settings/page.tsx` |

---

*This document is intended for QA sign-off and engineering prioritization. Update status columns as fixes land. Runtime sign-off requires execution of the checklist above in an environment with appropriate access—not assumptions from local dev or production.*
