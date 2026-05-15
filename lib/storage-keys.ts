/**
 * Single source of truth for every localStorage / sessionStorage key the app uses.
 *
 * Why centralize:
 *  - Prevents typos like "momentum.app.v1" vs. "momentum.app_v1" causing
 *    silent data loss.
 *  - Makes future schema bumps (v1 → v2) a one-line change.
 *  - Easy to grep — `STORAGE_KEYS.app` is unmistakable.
 *
 * Convention: `momentum.<area>.v<schema-version>`. Bump the version suffix
 * when the JSON shape changes incompatibly so old data is ignored on read.
 */
export const STORAGE_KEYS = {
  /** Full AppState — guests, budget, checklist, etc. */
  app: "momentum.app.v1",
  /** Local-only UserAccount summary (mirrors Supabase auth user when synced). */
  user: "momentum.user.v1",
  /** Theme preference: "dark" | "light". */
  theme: "momentum.theme.v1",
  /** Rate limiter timestamp for /inbox imports (sessionStorage). */
  lastInboxImport: "momentum.lastInboxImport",
  /** Rate limiter timestamp for /rsvp submissions (sessionStorage). */
  lastRsvpSubmit: "momentum.lastRsvpSubmit",
  /** Multi-event registry: array of EventSlot snapshots. */
  slots: "momentum.app.slots",
  /** ID of the currently active slot (matches one of the slots' ids). */
  activeSlotId: "momentum.app.activeSlotId",

  // R12 §3S — added 6 keys that had been written ad-hoc across the
  // codebase. Each one now has a single, grep-able home.

  /** Prefix used by the manager dashboard to remember when the event
   *  "started" so the AI co-pilot timing rules survive a refresh. The
   *  full key is `${eventStartedPrefix}:${eventId}`. */
  eventStartedPrefix: "momentum.eventStarted",
  /** ISO timestamp of when the user accepted the terms of service. */
  termsAcceptedAt: "momentum.terms_accepted_at",
  /** Pricing tier selected on /start (`"free" | "pro" | …`). */
  selectedTier: "momentum.selectedTier",
  /** Queue of in-app notifications waiting for the next safe paint. */
  notificationsQueue: "momentum.notifications.queue.v1",
  /** Local-only analytics events ring buffer. */
  analyticsEvents: "momentum.analytics.events.v1",
  /** Prefix for "have I already shown the confetti for X?" flags. */
  confettiPrefix: "momentum.confetti",

  // R13 — added a 7th key for the admin-cache lookup that R12 missed.
  /** Cached "is this user an admin" flag — avoid a Supabase round-trip
   *  on every Header/Sidebar mount. Cleared on sign-out. */
  adminCache: "momentum.isAdmin.v1",

  // R14 — vendor identity cache. Stores {isVendor, vendorSlug, lastChecked}
  // so the Header / nav / router decisions don't need a fresh Supabase
  // query on every page navigation.
  vendorContext: "momentum.vendor.context.v1",
  // R26 — Momentum Live alert-sound opt-in (default off).
  managerSounds: "momentum.manager.sounds.v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
