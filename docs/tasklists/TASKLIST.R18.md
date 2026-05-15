# TASKLIST · R18 — UX polish (Phone OTP, Empty states, Wizards, Polish)

**Date:** 2026-05-16
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; warnings are pre-existing img + the third-party `useVirtualizer`/compiler note) · `npm run build` ✅ (43 routes)
**Commit:** single — `R18 — UX polish (Phone OTP, Empty states, Wizards, Polish)` (per your "commit אחד בסוף" choice). Worked block-by-block with tsc+lint+build green after **each** block.
**Status:** Code complete. Not pushed to GitHub (auth still deferred). Not deployed unless you say so.

---

## 🔴 Block 1 — Signup + Onboarding

| # | Item | Status | Notes |
|---|---|---|---|
| A | Phone OTP resend + 30s countdown | ✅ | `PhoneStep` now mirrors `EmailConfirmationStep`: cooldown arms on first send + every resend; live "לא הגיע? שלח שוב תוך {n}s"; spinner while resending. `onResend={sendOtp}` wired from parent. |
| B | Consent visual feedback | ✅ | New `requireConsent()` helper centralises the 4 duplicated checks; on a blocked tap it fires a 3×600ms `consent-pulse` keyframe (added to globals.css) on the terms card. Auth buttons get `aria-disabled` + dimmed when not consented (kept clickable so the pulse can fire — a truly `disabled` button swallows the click). |
| C | hostPhone autofill | ✅ | Phone signups still seed from `user.identifier`. Google/email now async-probe `supabase.auth.getUser().phone`. If still empty → red `*` + helper "ללא טלפון אורחים לא יוכלו לאשר הגעה" that turns red when blank. |
| D | Date input non-destructive | ✅ | Removed every `setDate("")` clear-on-keystroke. Validation effect now only *pushes* a valid ISO and never wipes the last good value. Added native `<input type="date">` as the primary affordance + "או הקלד ידנית" toggle revealing the 3-field manual entry. |
| E | Bulk invite auto-advance | ✅ | `visibilitychange` listener: tab hidden (→WhatsApp) then visible + current guest opened → 2s → next guest. Opt-out persisted (`momentum.bulk_auto_advance.v1`) with a toggle in the modal footer; hint text adapts. |

## 🟠 Block 2 — Empty states + Vendor join

| # | Item | Status | Notes |
|---|---|---|---|
| F | Guests empty state, import-first | ✅ | Custom card (shared `EmptyState` can't do a primary onClick button). Primary gold "📱 ייבא מאנשי קשר" / secondary "+ הוסיף ידנית" + "ב-30 שניות… 50+ מוזמנים". Browsers without Contacts API get a paste-list textarea (`name, phone` per line, deduped). |
| G | Vendor join 3-step wizard | ✅ | 13 fields split → step 1 עסק (name/contact/category/city), step 2 יצירת קשר (phone/email/website), step 3 פרופיל ואימות (business_id/years/sample/about/socials). Progress bar "שלב X מתוך 3", "⚡ טופס מהיר — 60 שניות" badge, per-step required-field gating on Next, Submit only on step 3. |
| H | VendorCard "add to list" pill | ✅ | Overlay +/✓ badge kept. New in-body gold pill below the price/actions row; disappears once `selected` or after the user's first-ever save (`momentum.has_saved_vendor.v1`). |

## 🟡 Block 3 — UX inconsistencies

| # | Item | Status | Notes |
|---|---|---|---|
| I | Vendor dashboard fresh-vendor branch | ✅ | New `<QrCanvas>` component (no pre-existing one despite the brief — created over `qrcode`, same lib as event-day). Banner when `views7d===0 && activeLeads===0 && profileAgeDays<7`: copy-link button (clipboard + "הקישור הועתק"), QR, IG-story tip. `Date.now()` replaced with `useNow(null)` for React 19 purity. |
| J | Toast position | ✅ | `bottom-[calc(80px…)]` → `96px`. Clears the mobile bottom-nav even with no safe-area inset. |
| K | Virtualize guest list | ✅ | Added `@tanstack/react-virtual`. `<VirtualGuestList>` (measured rows, 70vh scroll container) used only when `filtered.length > 80`; small events keep the plain map. |
| L | Shared MoneyInput + PhoneInput | ✅ | `components/inputs/MoneyInput.tsx` (fixed ₪ chip + `parseMoney`) and `PhoneInput.tsx` (fixed +972 chip). Wired into the quote modal amount + lead-interest phone. **Scope note:** a blanket sweep of every numeric input was deliberately *not* done — only clean, contained replacements — to avoid regressing bespoke inputs. Remaining call-sites can adopt incrementally. |
| M | Generic signup error fallback | ✅ | Every `submitEmail` catch now `console.error("[momentum/signup]", e)` first, maps known cases, shows the raw string only if it starts with a Hebrew letter, else "משהו השתבש. נסה שוב, או צור קשר ב-support@momentum.app". |
| N | `formatEventDate` helper | ✅ | New `lib/format.ts` (`"long"`→"15 במאי 2026", `"short"`→"15/5/26", invalid→""). Migrated the two explicitly-named sites (dashboard:392, guests CSV) + settings join-date + ReviewCard date. **Scope note:** ~25 other `toLocaleDateString` call-sites use bespoke option objects (weekday-prefixed, month:"short", etc.); blindly swapping them to a 2-mode helper would visibly change formatting across report/live/balance/RSVP screens — left intentionally and flagged here rather than risk a silent UX regression (your "stop if it regresses" guidance). |

## 🔵 Block 4 — Polish

| # | Item | Status | Notes |
|---|---|---|---|
| O | Email submit "מתחבר..." | ✅ | Spinner + "מתחבר..." label instead of a bare spinner. |
| P | Modal close consistency | ✅ | AddGuestModal gained a 44×44 ✕ (had none — Esc/click-outside/ביטל only). BulkInviteModal ✕ bumped 32→44px + real `<X>` icon. Both already had Esc + click-outside. Created `components/Modal.tsx` shared primitive (Esc + backdrop + 44px ✕) for future dialogs — the two complex stateful modals were fixed in-place rather than risk a forced refactor. |
| Q | WhatsApp link pre-warming | ✅ | New `prewarmGuestWhatsappLinks()` seeds the module Promise cache. Page effect: `<30` guests → warm all, else first 20. WhatsApp buttons now `disabled` until the link resolves (the old "stay clickable to show a toast" behaviour is obsolete now that prewarm makes the not-ready window near-instant — documented inline). |
| R | Pricing from user menu | ✅ | Option 2 (preferred): new `<UpgradePlanModal>` opens in place from the menu (free / ₪399 one-time, kept truthful to /pricing), with a link out for the full comparison. No more full-page nav. |
| S | Landing social proof | ✅ | Removed fabricated "4,872 events" + "4.9★ from 2,341 reviews" (StatsCounter) and the "4.9 ממשתמשים" trust-bar claim. Now: launch message + only defensible metrics (100+ catalog = real, ₪38M = explicitly *משוער/model*, 9 event types = real). |

---

## Deviations from the brief (called out for review)

1. **Commit strategy** — brief contradicted itself ("commit אחד" vs "לא commit ענק / bisect-friendly"). You chose **one commit at the end**; still validated per-block so any breakage was caught early.
2. **§G/§I/§P "component you already have"** — `<QrCanvas>`, a shared `<Modal>`, and `<ErrorBoundary>` (R15) did **not** pre-exist; created from scratch.
3. **§L / §N partial sweeps** — shared components + helper created and wired into representative spots; full app-wide replace deliberately deferred to avoid regressing bespoke formats/inputs. Documented above so it's a conscious decision, not an omission.
4. **§Q** — overrode a documented R12-era "keep button clickable while loading" choice; safe now because pre-warming removes the slow window. Reasoning left in code comments.

## Files touched

| Area | Files |
|---|---|
| New components | `components/QrCanvas.tsx`, `components/Modal.tsx`, `components/UpgradePlanModal.tsx`, `components/inputs/MoneyInput.tsx`, `components/inputs/PhoneInput.tsx` |
| New lib | `lib/format.ts` |
| New dep | `@tanstack/react-virtual` |
| Modified | `app/signup/page.tsx`, `app/onboarding/page.tsx`, `app/guests/page.tsx`, `app/vendors/join/page.tsx`, `app/vendors/dashboard/page.tsx`, `app/vendors/dashboard/leads/page.tsx`, `app/dashboard/page.tsx`, `app/settings/page.tsx`, `app/page.tsx`, `components/Header.tsx`, `components/Toast.tsx`, `components/vendors/VendorCard.tsx`, `components/vendors/ReviewCard.tsx`, `components/vendor-studio/VendorLandingClient.tsx`, `hooks/useGuestWhatsappLink.ts`, `app/globals.css` |
| Docs | `docs/tasklists/TASKLIST.R18.md`, `CHANGELOG.md` |
