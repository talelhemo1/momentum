"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AppState, EventInfo, Guest, BudgetItem, BudgetCategory, VendorType, ChecklistItem, ChecklistPhase, SeatingTable, VendorMessage, AssistantMessage, Blessing, LivePhoto, SavedVendor } from "./types";
import { VENDORS } from "./vendors";
import { buildDefaultChecklist } from "./checklists";
import { generateRsvpToken, generateSigningKey } from "./crypto";
import { STORAGE_KEYS } from "./storage-keys";

const STORAGE_KEY = STORAGE_KEYS.app;

const emptyState: AppState = {
  event: null,
  guests: [],
  budget: [],
  selectedVendors: [],
  savedVendors: [],
  checklist: [],
  tables: [],
  seatAssignments: {},
  vendorChats: [],
  assistantMessages: [],
  compareVendors: [],
  blessings: [],
  livePhotos: [],
};

function readState(): AppState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = { ...emptyState, ...(JSON.parse(raw) as Partial<AppState>) };
    // Migration: events created before HMAC enforcement may lack a signing key.
    // Without one, /inbox would refuse all responses. We don't mint inline
    // anymore — two tabs hitting this path simultaneously each used to
    // generate their own random key and clobber each other's writes, leaving
    // tokens signed by the loser unverifiable. Defer to mintSigningKeyAtomic,
    // which serializes via Web Locks (or a 50ms re-check fallback).
    if (parsed.event && !parsed.event.signingKey) {
      void mintSigningKeyAtomic();
    }
    // Migration (R7): pre-pipeline events have `selectedVendors` populated
    // but `savedVendors` empty. Rebuild SavedVendor entries with status="lead"
    // for each id we don't have a richer record for. Done in-memory only —
    // the next mutation (toggleVendor / addSavedVendor) writes back the merged
    // shape so the persisted state catches up naturally.
    if (parsed.selectedVendors.length > 0) {
      const known = new Set(parsed.savedVendors.map((v) => v.vendorId));
      const missing = parsed.selectedVendors.filter((id) => !known.has(id));
      if (missing.length > 0) {
        const stamp = new Date().toISOString();
        parsed.savedVendors = [
          ...parsed.savedVendors,
          ...missing.map<SavedVendor>((vendorId) => ({
            vendorId,
            status: "lead",
            addedAt: stamp,
            updatedAt: stamp,
          })),
        ];
      }
    }
    return parsed;
  } catch {
    return emptyState;
  }
}

/**
 * Mint a signing key for the active event under a cross-tab lock so only
 * one tab gets to write. Re-reads localStorage inside the lock so a tab that
 * loses the race notices the winner's key and skips its own write.
 *
 * Tabs that LOSE the race used to bail and continue with a stale read where
 * `event.signingKey` was undefined — until the next reload. Any RSVP token
 * a loser tab generated in that window failed verify on the host. We now
 * await `momentum:update` (with a safety timeout) before resolving on the
 * loser path so callers' subsequent `readState()` already sees the key.
 *
 * Uses navigator.locks (Chromium, Firefox 96+, Safari 15.4+). The fallback
 * is a brief sleep + re-read; not bulletproof, but it shrinks the race
 * window from "anytime in milliseconds" to "<50ms with both tabs racing
 * simultaneously" which is rare enough in practice.
 */
let inflightSigningKeyMint: Promise<void> | null = null;

async function mintSigningKeyAtomic(): Promise<void> {
  if (typeof window === "undefined") return;
  // Coalesce concurrent callers within a single tab — multiple components
  // calling readState() near simultaneously would each kick off their own
  // mint round-trip otherwise. Same pattern mintMissingRsvpTokens uses.
  if (inflightSigningKeyMint) return inflightSigningKeyMint;

  inflightSigningKeyMint = (async () => {
    try {
      const tryWrite = (): boolean => {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        let parsed: Partial<AppState>;
        try {
          parsed = JSON.parse(raw) as Partial<AppState>;
        } catch {
          return false;
        }
        // Re-read inside the lock — another tab may have already minted.
        if (!parsed.event || parsed.event.signingKey) return false;
        const next: AppState = {
          ...emptyState,
          ...parsed,
          event: { ...parsed.event, signingKey: generateSigningKey() },
        };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          cachedSnapshot = null;
          window.dispatchEvent(new CustomEvent("momentum:update"));
          return true;
        } catch {
          // Disk full / private mode — best-effort only.
          return false;
        }
      };

      // Wait up to `timeoutMs` for another tab's `momentum:update` to land.
      // Loser tabs use this to avoid returning before the winner has written.
      const waitForUpdate = (timeoutMs: number) =>
        new Promise<void>((resolve) => {
          let settled = false;
          const handler = () => {
            if (settled) return;
            settled = true;
            window.removeEventListener("momentum:update", handler);
            resolve();
          };
          window.addEventListener("momentum:update", handler);
          window.setTimeout(() => {
            if (settled) return;
            settled = true;
            window.removeEventListener("momentum:update", handler);
            resolve();
          }, timeoutMs);
        });

      type LockManagerLike = {
        request: (
          name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void> | void,
        ) => Promise<void>;
      };
      const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
      if (locks?.request) {
        let isWinner = false;
        try {
          await locks.request("momentum-signingkey", { ifAvailable: true }, async (lock) => {
            // ifAvailable: lock===null when another tab already owns it. The
            // winner of the lock writes the key; the loser falls through and
            // waits below for the broadcast.
            if (!lock) return;
            isWinner = tryWrite();
          });
        } catch {
          // Lock API rejected — fall through to the polling fallback below.
        }
        if (!isWinner) {
          // Loser path: wait briefly for the winner's broadcast, then check
          // localStorage one more time in case we missed the event (different
          // tab + storage event semantics).
          await waitForUpdate(3000);
          tryWrite();
        }
        return;
      }

      // Older browsers (pre-Web-Locks): wait one frame so any concurrently-
      // mounted tab gets a chance to write first, then re-read and mint
      // only if still missing.
      await new Promise((resolve) => setTimeout(resolve, 50));
      tryWrite();
    } finally {
      inflightSigningKeyMint = null;
    }
  })();

  return inflightSigningKeyMint;
}

function writeState(state: AppState) {
  if (typeof window === "undefined") return;
  // Wrap the write so a quota-exceeded error (private mode, very full
  // storage, browser eviction) doesn't take down the calling action and
  // leave the UI in a half-applied state. We still update the in-memory
  // cache and dispatch the event — the UI stays consistent with what the
  // user just did, even if the persisted copy fell behind.
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("[momentum/store] localStorage write failed (state held in memory only):", e);
  }
  // Cache invalidation so the next getSnapshot() picks up the change.
  // useSyncExternalStore tears if getSnapshot returns a new object reference
  // for unchanged data, so we read-through a stable cache.
  cachedSnapshot = state;
  window.dispatchEvent(new CustomEvent("momentum:update"));
}

// Memoized snapshot — invalidated on every write or external "momentum:update".
let cachedSnapshot: AppState | null = null;
function getSnapshot(): AppState {
  if (cachedSnapshot) return cachedSnapshot;
  cachedSnapshot = readState();
  return cachedSnapshot;
}
function getServerSnapshot(): AppState {
  return emptyState;
}
function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onUpdate = () => {
    cachedSnapshot = null;
    callback();
  };
  window.addEventListener("momentum:update", onUpdate);
  window.addEventListener("storage", onUpdate);
  return () => {
    window.removeEventListener("momentum:update", onUpdate);
    window.removeEventListener("storage", onUpdate);
  };
}

export function useAppState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `hydrated` flips to true once we're rendering with the real client snapshot
  // rather than the SSR fallback. useSyncExternalStore makes this trivial: the
  // server snapshot is `false`, the client snapshot is `true`.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const update = useCallback((updater: (s: AppState) => AppState) => {
    const next = updater(readState());
    writeState(next);
  }, []);

  return { state, hydrated, update };
}

export const actions = {
  setEvent(event: EventInfo) {
    const s = readState();
    // SECURITY: every event MUST carry a signing key — /inbox rejects RSVP
    // responses for events without one. Mint one if the caller didn't.
    const eventWithKey: EventInfo = event.signingKey
      ? event
      : { ...event, signingKey: generateSigningKey() };
    // Seed the default checklist on first event creation. Don't overwrite if user already has a checklist.
    // Pass the event date so each task gets a sensible default dueDate.
    const checklist = s.checklist.length > 0
      ? s.checklist
      : buildDefaultChecklist(event.type, event.date);
    writeState({ ...s, event: eventWithKey, checklist });
  },
  /** Update the due date on a single checklist item — used by the inline date picker. */
  setChecklistDueDate(id: string, dueDate: string | undefined) {
    const s = readState();
    writeState({
      ...s,
      checklist: s.checklist.map((c) => (c.id === id ? { ...c, dueDate } : c)),
    });
  },
  resetAll() {
    writeState(emptyState);
  },
  toggleChecklistItem(id: string) {
    const s = readState();
    writeState({
      ...s,
      checklist: s.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    });
  },
  addChecklistItem(title: string, phase: ChecklistPhase) {
    const s = readState();
    const item: ChecklistItem = { id: crypto.randomUUID(), title, phase, done: false, isCustom: true };
    writeState({ ...s, checklist: [...s.checklist, item] });
    return item;
  },
  removeChecklistItem(id: string) {
    const s = readState();
    writeState({ ...s, checklist: s.checklist.filter((c) => c.id !== id) });
  },

  // ─────────────── Seating ───────────────
  addTable(name: string, capacity: number, number?: number) {
    const s = readState();
    // Auto-pick the next number (max existing + 1, defaulting to 1) so the
    // host doesn't have to keep track manually. Caller can still pass an
    // explicit number to override — used by the modal when the user types one.
    const nextNumber =
      number ??
      (s.tables.reduce((max, t) => Math.max(max, t.number ?? 0), 0) + 1);
    const table: SeatingTable = {
      id: crypto.randomUUID(),
      name: name.trim() || `שולחן ${nextNumber}`,
      capacity: Math.max(1, capacity),
      number: nextNumber,
    };
    writeState({ ...s, tables: [...s.tables, table] });
    return table;
  },
  updateTable(id: string, patch: Partial<SeatingTable>) {
    const s = readState();
    writeState({ ...s, tables: s.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  },
  removeTable(id: string) {
    const s = readState();
    const newAssignments: Record<string, string> = {};
    for (const [gid, tid] of Object.entries(s.seatAssignments)) {
      if (tid !== id) newAssignments[gid] = tid;
    }
    writeState({ ...s, tables: s.tables.filter((t) => t.id !== id), seatAssignments: newAssignments });
  },
  assignSeat(guestId: string, tableId: string | null) {
    const s = readState();
    const next = { ...s.seatAssignments };
    if (tableId === null) delete next[guestId];
    else next[guestId] = tableId;
    writeState({ ...s, seatAssignments: next });
  },

  // ─────────────── Compare vendors ───────────────
  toggleCompareVendor(id: string) {
    const s = readState();
    const has = s.compareVendors.includes(id);
    if (has) {
      writeState({ ...s, compareVendors: s.compareVendors.filter((v) => v !== id) });
    } else if (s.compareVendors.length < 3) {
      writeState({ ...s, compareVendors: [...s.compareVendors, id] });
    }
  },
  clearCompare() {
    const s = readState();
    writeState({ ...s, compareVendors: [] });
  },

  // ─────────────── Vendor chat ───────────────
  sendVendorMessage(vendorId: string, text: string, fromUser = true) {
    const s = readState();
    const msg: VendorMessage = {
      id: crypto.randomUUID(),
      vendorId,
      fromUser,
      text: text.trim(),
      at: new Date().toISOString(),
    };
    writeState({ ...s, vendorChats: [...s.vendorChats, msg] });
    return msg;
  },

  // ─────────────── AI assistant ───────────────
  pushAssistantMessage(text: string, fromUser: boolean) {
    const s = readState();
    const msg: AssistantMessage = {
      id: crypto.randomUUID(),
      fromUser,
      text: text.trim(),
      at: new Date().toISOString(),
    };
    writeState({ ...s, assistantMessages: [...s.assistantMessages, msg] });
    return msg;
  },
  clearAssistant() {
    const s = readState();
    writeState({ ...s, assistantMessages: [] });
  },
  /**
   * R19 P1#4: remove the most recent assistant message. Used when a chat
   * request fails before the model produces a reply (e.g. quota exhausted),
   * so we don't leave the user's question hanging without context. The
   * widget pushes the user turn optimistically before the network call —
   * this lets us roll that turn back if needed.
   * Returns the popped message, or null if the transcript was empty.
   */
  popLastAssistantMessage() {
    const s = readState();
    if (s.assistantMessages.length === 0) return null;
    const popped = s.assistantMessages[s.assistantMessages.length - 1];
    writeState({
      ...s,
      assistantMessages: s.assistantMessages.slice(0, -1),
    });
    return popped;
  },

  // ─────────────── Live mode: blessings + photos ───────────────
  /** Append a guest blessing. Truncates `text` at 280 chars to match the UI cap. */
  addBlessing(text: string, fromName?: string) {
    const s = readState();
    const blessing: Blessing = {
      id: crypto.randomUUID(),
      text: text.trim().slice(0, 280),
      fromName: fromName?.trim() || undefined,
      at: new Date().toISOString(),
    };
    writeState({ ...s, blessings: [...(s.blessings ?? []), blessing] });
    return blessing;
  },
  removeBlessing(id: string) {
    const s = readState();
    writeState({ ...s, blessings: (s.blessings ?? []).filter((b) => b.id !== id) });
  },
  /**
   * Append a live photo. `src` is expected to be a `data:` URL or `https://`
   * URL. We trim oldest photos (FIFO) when localStorage quota is hit.
   */
  addLivePhoto(src: string, opts?: { fromName?: string; caption?: string }) {
    const s = readState();
    const photo: LivePhoto = {
      id: crypto.randomUUID(),
      src,
      fromName: opts?.fromName?.trim() || undefined,
      caption: opts?.caption?.trim() || undefined,
      at: new Date().toISOString(),
    };
    const next = { ...s, livePhotos: [...(s.livePhotos ?? []), photo] };
    try {
      writeState(next);
    } catch {
      // Quota exceeded — drop the 5 oldest photos and retry once.
      const trimmed = { ...next, livePhotos: next.livePhotos.slice(5) };
      try { writeState(trimmed); } catch {}
    }
    return photo;
  },
  removeLivePhoto(id: string) {
    const s = readState();
    writeState({ ...s, livePhotos: (s.livePhotos ?? []).filter((p) => p.id !== id) });
  },

  addGuest(guest: Omit<Guest, "id" | "status" | "attendingCount"> & {
    attendingCount?: number;
    status?: Guest["status"];
  }) {
    const s = readState();
    const attending = guest.attendingCount ?? 1;
    const newGuest: Guest = {
      id: crypto.randomUUID(),
      name: guest.name,
      phone: guest.phone,
      attendingCount: attending,
      plusOnes: Math.max(0, attending - 1),
      status: guest.status ?? "pending",
      side: guest.side,
      notes: guest.notes,
      group: guest.group,
      ageGroup: guest.ageGroup,
      gender: guest.gender,
      conflictsWith: guest.conflictsWith,
      mustSitWith: guest.mustSitWith,
      // RSVP token is minted async by `mintMissingRsvpTokens()` (see below)
      // because crypto.subtle.sign returns a Promise and addGuest is sync.
    };
    writeState({ ...s, guests: [...s.guests, newGuest] });
    // Kick off async minting in the background — non-blocking.
    void mintMissingRsvpTokens();
    return newGuest;
  },
  updateGuest(id: string, patch: Partial<Guest>) {
    const s = readState();
    writeState({
      ...s,
      guests: s.guests.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
  },
  removeGuest(id: string) {
    const s = readState();
    writeState({ ...s, guests: s.guests.filter((g) => g.id !== id) });
  },
  markInvited(id: string) {
    const s = readState();
    writeState({
      ...s,
      guests: s.guests.map((g) =>
        g.id === id
          ? { ...g, status: "invited", invitedAt: new Date().toISOString() }
          : g,
      ),
    });
  },
  setRsvp(id: string, status: "confirmed" | "declined" | "maybe", attendingCount: number) {
    const s = readState();
    writeState({
      ...s,
      guests: s.guests.map((g) =>
        g.id === id
          ? {
              ...g,
              status,
              attendingCount,
              respondedAt: new Date().toISOString(),
            }
          : g,
      ),
    });
  },
  setGuestEnvelope(id: string, amount: number | undefined) {
    const s = readState();
    writeState({
      ...s,
      guests: s.guests.map((g) => (g.id === id ? { ...g, envelopeAmount: amount } : g)),
    });
  },
  addBudgetItem(item: Omit<BudgetItem, "id">) {
    const s = readState();
    const newItem: BudgetItem = { id: crypto.randomUUID(), ...item };
    writeState({ ...s, budget: [...s.budget, newItem] });
    return newItem;
  },
  updateBudgetItem(id: string, patch: Partial<BudgetItem>) {
    const s = readState();
    writeState({
      ...s,
      budget: s.budget.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  },
  removeBudgetItem(id: string) {
    const s = readState();
    writeState({ ...s, budget: s.budget.filter((b) => b.id !== id) });
  },
  toggleVendor(id: string) {
    const s = readState();
    const has = s.selectedVendors.includes(id);

    if (has) {
      // Removing the vendor: also remove the auto-linked budget item if present.
      writeState({
        ...s,
        selectedVendors: s.selectedVendors.filter((v) => v !== id),
        savedVendors: s.savedVendors.filter((v) => v.vendorId !== id),
        budget: s.budget.filter((b) => b.vendorId !== id),
      });
    } else {
      // Adding: create a budget line item from the vendor's price (if not already there).
      const vendor = VENDORS.find((v) => v.id === id);
      const alreadyHasBudgetItem = s.budget.some((b) => b.vendorId === id);
      const newBudget: BudgetItem[] = vendor && !alreadyHasBudgetItem
        ? [
            ...s.budget,
            {
              id: crypto.randomUUID(),
              vendorId: vendor.id,
              category: VENDOR_TO_BUDGET_CATEGORY[vendor.type] ?? "other",
              title: vendor.name,
              estimated: vendor.priceFrom,
            },
          ]
        : s.budget;
      const stamp = new Date().toISOString();
      const alreadyInSaved = s.savedVendors.some((v) => v.vendorId === id);
      writeState({
        ...s,
        selectedVendors: [...s.selectedVendors, id],
        savedVendors: alreadyInSaved
          ? s.savedVendors
          : [
              ...s.savedVendors,
              { vendorId: id, status: "lead", addedAt: stamp, updatedAt: stamp },
            ],
        budget: newBudget,
      });
    }
  },

  // ─── R7: saved-vendor pipeline ──────────────────────────────────────────
  // Add a vendor to the saved list. Internally calls the same code path as
  // `toggleVendor` so the budget auto-linker stays the single source of truth.
  // No-op when the vendor is already saved (idempotent — safe to call from a
  // toggle handler that just lost track of the previous state).
  addSavedVendor(id: string) {
    const s = readState();
    if (s.selectedVendors.includes(id)) return;
    actions.toggleVendor(id);
  },

  // Remove a vendor from the saved list. Mirrors the toggleVendor remove
  // branch (drops budget line + selectedVendors + savedVendors atomically).
  removeSavedVendor(id: string) {
    const s = readState();
    if (!s.selectedVendors.includes(id)) return;
    actions.toggleVendor(id);
  },

  // Update the SavedVendor row WITHOUT touching the legacy id list or budget.
  // Pipeline-only fields (status, agreed price, meeting, notes, rating).
  updateSavedVendor(
    id: string,
    updates: Partial<Omit<SavedVendor, "vendorId" | "addedAt">>,
  ) {
    const s = readState();
    const idx = s.savedVendors.findIndex((v) => v.vendorId === id);
    if (idx === -1) return;
    const next = [...s.savedVendors];
    next[idx] = { ...next[idx], ...updates, updatedAt: new Date().toISOString() };
    writeState({ ...s, savedVendors: next });
  },

  isSavedVendor(id: string): boolean {
    return readState().selectedVendors.includes(id);
  },
};

// Map each vendor type to the closest budget category, so saved vendors land in the right bucket.
const VENDOR_TO_BUDGET_CATEGORY: Record<VendorType, BudgetCategory> = {
  venue: "venue",
  photography: "photography",
  videography: "photography",
  dj: "music",
  band: "music",
  social: "photography",
  alcohol: "catering",
  catering: "catering",
  florist: "flowers",
  designer: "decoration",
  rabbi: "other",
  makeup: "attire",
  dress: "attire",
  entertainment: "music",
  transportation: "transportation",
  sweets: "catering",
  fx: "decoration",
  // 2026 expansion — keep ALL VendorTypes mapped so the budget linker never
  // falls back to "other" silently.
  drone: "photography",
  kids: "other",
  security: "other",
  magician: "music",
  lighting: "decoration",
  stationery: "invitations",
  signage: "decoration",
  cocktail: "catering",
  photobooth: "photography",
  hosting: "music",
  // R11 — print houses bucket into "invitations" alongside stationery.
  printing: "invitations",
};

export function getStateSnapshot(): AppState {
  return readState();
}

// ─────────────────────────────────────────────────────────────────────────
// RSVP token backfill — async, idempotent, safe to call repeatedly.
// Mints HMAC tokens for any guest that doesn't have one yet, using the
// active event's signing key. Re-renders subscribers via the usual update
// event so the dashboard sees the new tokens immediately.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Inflight promise so concurrent callers (e.g. several `addGuest` calls in
 * a tight loop) coalesce into a single backfill pass.
 */
let mintingInflight: Promise<void> | null = null;

export function mintMissingRsvpTokens(): Promise<void> {
  if (mintingInflight) return mintingInflight;
  mintingInflight = (async () => {
    try {
      const s = readState();
      if (!s.event?.signingKey) return;
      const eventId = s.event.id;
      const signingKey = s.event.signingKey;
      const needs = s.guests.filter((g) => !g.rsvpToken);
      if (needs.length === 0) return;
      const updates = await Promise.all(
        needs.map(async (g) => [g.id, await generateRsvpToken(eventId, g.id, signingKey)] as const),
      );
      const tokenById = new Map(updates);
      // Re-read in case the user mutated guests while we were minting.
      const fresh = readState();
      writeState({
        ...fresh,
        guests: fresh.guests.map((g) =>
          tokenById.has(g.id) && !g.rsvpToken ? { ...g, rsvpToken: tokenById.get(g.id) } : g,
        ),
      });
    } finally {
      mintingInflight = null;
    }
  })();
  return mintingInflight;
}
