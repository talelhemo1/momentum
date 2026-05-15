# TASKLIST · R15 — Defensive event-type lookups + exhaustiveness check

**Date:** 2026-05-15
**Verification:** `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 errors, 5 pre-existing warnings) · `npm run build` ✅ (43 routes)
**Status:** Code complete — **NOT pushed / NOT deployed** per your request. Awaiting green light.

---

## Why this round

Every direct `EVENT_CONFIG[someType]` index is typed as safe (the map is
`Record<EventType, …>`), but at runtime `someType` can be a **stale or
unknown string** — old localStorage from before an event type was
renamed/removed, a tampered RSVP link, a corrupted import. The index then
returns `undefined` and the next property access (`.recommendedVendors`,
`.label`, `.map(...)`) throws — a *silent white-screen crash* the type
system never warned about. R15 makes every such lookup fall back to the
`wedding` config, adds a compile-time guard against future drift, and
improves error visibility so the next "it's not responding" report is
diagnosable.

---

## Block 1 — Defensive lookups

- [x] **A** — `app/vendors/page.tsx:208` → `EVENT_CONFIG[state.event.type] ?? EVENT_CONFIG.wedding`
- [x] **B** — `lib/aiAssistant.ts:63` → `(EVENT_CONFIG[event.type] ?? EVENT_CONFIG.wedding).recommendedVendors.slice(0,5)`
- [x] **C** — full `grep -rn "EVENT_CONFIG\["` sweep. Every direct index now has a `?? EVENT_CONFIG.wedding` (or pre-existing `?.label ?? "אירוע"`) guard:

  | File:line | Fix |
  |---|---|
  | `lib/eventConfig.ts:362` | `getEventConfig()` — canonical accessor now returns `EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding`; **every `getEventConfig` caller is now safe for free** |
  | `lib/rsvpLinks.ts:58` | normalized to wedding-fallback (was soft-guarded by `config?.…??`) |
  | `lib/rsvpLinks.ts:99/109/111` | already safe (`?.label ?? "אירוע"`) — left as-is |
  | `lib/journey.ts:53` | already safe (pre-existing wedding fallback) — left as-is |
  | `lib/eventCardGenerator.ts:171` | + wedding fallback |
  | `lib/whatsapp.ts:19` | + wedding fallback |
  | `app/rsvp/RsvpClient.tsx:186` | + wedding fallback (RSVP type is link-controlled / untrusted) |
  | `app/onboarding/page.tsx:145` | `type ? (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding) : null` |
  | `app/onboarding/page.tsx:346` | same |
  | `app/onboarding/page.tsx:658` | `(… ?? wedding).label` |
  | `app/onboarding/page.tsx:742` | `(… ?? wedding).avgPerGuest` |
  | `app/onboarding/page.tsx:823` | `(… ?? wedding).label` |

## Block 2 — Compile-time exhaustiveness

- [x] **D** — `lib/eventConfig.ts` end of file:
  ```ts
  const _EVENT_CONFIG_EXHAUSTIVE: Record<EventType, EventTypeConfig> = EVENT_CONFIG;
  void _EVENT_CONFIG_EXHAUSTIVE;
  ```
  Adding a new `EventType` to `lib/types.ts` without a matching
  `EVENT_CONFIG` entry now fails `tsc` instead of crashing at runtime.

- [x] **E** — Verified declarations:
  - `lib/checklists.ts:9` — `DEFAULTS: Record<EventType, DefaultTask[]>` ✅ (not `Partial`)
  - `lib/envelope.ts:4` — `TYPICAL_GIFT_PER_GUEST: Record<EventType, number>` ✅ (not `Partial`)
  - **Extra finding from this verification:** `lib/checklists.ts:187`
    did `DEFAULTS[type].map(...)` with no runtime guard — same crash
    class. Added `(DEFAULTS[type] ?? DEFAULTS.wedding).map(...)`.
    `envelope.ts` already had `?? 250` fallbacks at lines 54/258 — left
    as-is.

## Block 3 — Error visibility

- [x] **F** — `app/error.tsx` already logged; **tag aligned** from
  `[momentum/route-error]` → `[momentum/error-boundary]`. Now there is
  ONE consistent string to give a confused user: *"open the Console (⌥⌘I
  → Console tab) and send a screenshot of the red line that starts with
  `[momentum/error-boundary]`."* `app/global-error.tsx` keeps its
  `[momentum/global-error]` tag (distinct boundary, distinct meaning).

- [x] **G** — No reusable `<ErrorBoundary>` existed (only Next's
  route-level `app/error.tsx`, which is all-or-nothing). Created
  `components/ErrorBoundary.tsx` — a class boundary with
  `getDerivedStateFromError` + `componentDidCatch` (logs the same
  `[momentum/error-boundary]` tag + section name + component stack),
  a scoped Hebrew fallback panel, and a local "נסה שוב" reset.
  Wrapped:
  - `app/vendors/page.tsx` — `<ErrorBoundary section="vendors">` around `<Suspense><VendorsInner/></Suspense>`
  - `app/guests/page.tsx` — split into `GuestsPage` (thin wrapper, `<ErrorBoundary section="guests">`) + `GuestsPageInner` (original body) so the boundary sits ABOVE all hooks/early-returns.

---

## Files touched

| Area | Files |
|---|---|
| New component | `components/ErrorBoundary.tsx` |
| Defensive lookups | `lib/eventConfig.ts`, `lib/aiAssistant.ts`, `lib/rsvpLinks.ts`, `lib/eventCardGenerator.ts`, `lib/whatsapp.ts`, `lib/checklists.ts`, `app/vendors/page.tsx`, `app/rsvp/RsvpClient.tsx`, `app/onboarding/page.tsx` |
| Exhaustiveness | `lib/eventConfig.ts` |
| Error visibility | `app/error.tsx` |
| Boundary wiring | `app/vendors/page.tsx`, `app/guests/page.tsx` |
| Docs | `TASKLIST.R15.md` |

---

## Notes / deviations from the spec

1. **§3F** asked to *add* a log "if you have an error boundary" — one
   already existed in `app/error.tsx` with a different tag. Rather than
   add a duplicate, the existing log's tag was renamed to the requested
   `[momentum/error-boundary]` so support has a single grep string.
2. **§3G** said "the `<ErrorBoundary>` you already have" — none existed,
   so it was created from scratch (class component; React error
   boundaries cannot be hooks).
3. **§2E** was scoped to "verify Record not Partial" (both pass). The
   verification surfaced one unguarded `DEFAULTS[type].map` — fixed it
   too since it's the exact crash class this round targets.

**No git push / no Vercel deploy performed.** Say the word and I'll
commit + deploy.
