# TASKLIST · R31 — Navigation links in invitations (Waze + Google + Apple)

**Date:** 2026-05-17
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors; 6 pre-existing warnings) · `npm run build` ✅ · `npm run test` ✅ (9/9 — +3 new) · live RSVP render verified in preview ✅

> No migration. No env. Pure client/helper change — safe to deploy on its own.

## Goal

Every invitation that goes out, and every screen the host/manager/guest
sees, gets a one-tap **"navigate"** affordance. Waze is the Israel
default (its deep link auto-opens the app if installed, offers install
if not); Google Maps + Apple Maps are offered alongside so the guest
picks. `&navigate=yes` starts navigation immediately instead of just
dropping a pin.

## What shipped

| Block | File | Change |
|---|---|---|
| A | `lib/navigationLinks.ts` *(new)* | `buildNavigationLinks(address)` → `{ waze, googleMaps, appleMaps, primary }` or `null`. Pure + isomorphic. `encodeURIComponent` makes Hebrew / quotes / commas / parens link-safe. Empty/whitespace/nullish → `null`. |
| B | `lib/invitationMessage.ts` | After the `📍 venue` line, a `🚗 ניווט ב-Waze: <url>` line **on its own line** so WhatsApp linkifies it (a URL mid-sentence isn't tappable). Only when a venue exists. |
| C | `app/rsvp/RsvpClient.tsx` | "איך מגיעים?" gold card under the event hero: venue text + a 3-button grid (🚗 Waze / 🗺️ Google Maps / 🍎 Apple Maps) + hint. Address = `synagogue · city`. Hidden entirely when neither is set (`venueText && navLinks`). |
| D1 | `app/dashboard/page.tsx` | Small "פתח ב-Waze" link in the hero location row (non-dominant). |
| D2 | `app/event-day/page.tsx` | Prominent gold "ניווט לאולם" button in the event-day live header. |
| D3 | `components/eventDay/LiveModeView.tsx` | "ניווט לאולם" pill under the couple's live-mode title. |
| D4 | `app/manage/[eventId]/page.tsx` | Small round Waze icon in the sticky manager header (time is precious on event day → immediate access). `DashboardEvent` extended with `synagogue?`/`city?`, populated from the host's local state. |

All link UIs render only when `buildNavigationLinks` returns non-null,
so an event with no venue/city never shows a broken button (E2).

## Edge cases (E1/E2 — verified)

- `"אולם הוורד, יד אליהו, תל אביב"` → comma → `%2C`, spaces → `%20`, Hebrew percent-encoded. ✅
- `"גן האחוזה (בני ברק)"` → parentheses preserved (valid in URLs; Waze/Maps handle them). ✅
- `""` / `"   "` / `null` / `undefined` → `buildNavigationLinks` returns `null` → card hidden. ✅
- Covered by `tests/navigationLinks.test.ts` (3 cases, 9/9 suite green).

## Automated verification (E3)

- `npx tsc --noEmit` ✅
- `npm run lint` ✅ (0 errors)
- `npm run build` ✅
- `npm run test` ✅ 9/9

## Manual verification (E4)

1. **Live RSVP render** — forged legacy `?d=` invitation (synagogue
   "אולם הוורד" + city "תל אביב") in the preview server:
   the "איך מגיעים?" card renders below the hero with the three links;
   hrefs verified: `https://waze.com/ul?q=…&navigate=yes`,
   `https://www.google.com/maps/dir/?api=1&destination=…`,
   `https://maps.apple.com/?q=…` — all `target="_blank"
   rel="noopener noreferrer"`. ✅ (screenshot taken)
2. **WhatsApp invite body** — `buildWhatsappInviteMessage` adds the
   `🚗 ניווט ב-Waze: …` line on its own line when a venue is present.
   *(Send a real invite from the guests screen and confirm WhatsApp
   shows the Waze URL as a tappable link — phone-only, manual.)*
3. **iPhone tap** — open the Waze link from a real iPhone → Waze opens
   with the address pre-loaded and navigation started. *(Device-only,
   manual — cannot be verified headless.)*
4. **Manager screens** — dashboard "פתח ב-Waze", event-day "ניווט
   לאולם" button, live-mode pill, manager-header Waze icon. *(Require a
   logged-in host with event state — manual smoke on a seeded device.)*

## Notes

- The venue address passed to the helper is the existing
  `[synagogue, city].filter(Boolean).join(" · ")` string (same one the
  WhatsApp 📍 line and the dashboard already display). Maps engines
  tokenize the `·` fine; kept consistent with the displayed venue rather
  than introducing a separate geocoder string.
- Apple Maps button is shown to everyone (incl. Android). In Israel
  almost all Apple-Maps users are on iPhone; 3 buttons = user chooses,
  no UA sniffing, no broken-button risk (Android users tap Waze/Google).
