"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { AppState } from "./types";
import { STORAGE_KEYS } from "./storage-keys";

/**
 * Multi-event support — lets a user keep several event plans in parallel and
 * switch between them.
 *
 * Storage layout:
 *   STORAGE_KEYS.app           — the ACTIVE event (preserved key for back-compat)
 *   STORAGE_KEYS.slots         — EventSlot[] : registry of all events, including
 *                                 snapshots of the inactive ones.
 *   STORAGE_KEYS.activeSlotId  — which slot id is currently the active one.
 *
 * On "switch": we save the current active state as a snapshot in slots, then
 * load the chosen slot's snapshot into the active key. The rest of the app
 * keeps reading from the active key exactly as before.
 */

const ACTIVE_KEY = STORAGE_KEYS.app;
const SLOTS_KEY = STORAGE_KEYS.slots;
const ACTIVE_ID_KEY = STORAGE_KEYS.activeSlotId;

export interface EventSlot {
  id: string;
  /** Display label — derived from the event hosts when possible. */
  label: string;
  /** Snapshot of the full AppState for this slot. */
  snapshot: AppState;
  /** Last time this slot was active (for sorting / display). */
  updatedAt: string;
}

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

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  // Quota-exceeded / private-mode writes throw; swallow so a single failed
  // snapshot doesn't bring down the calling slot operation.
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("[momentum/eventSlots] localStorage write failed:", e);
  }
}

function readActive(): AppState {
  return read<AppState>(ACTIVE_KEY, emptyState);
}

function readSlots(): EventSlot[] {
  return read<EventSlot[]>(SLOTS_KEY, []);
}

function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ID_KEY);
}

function writeActiveId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(ACTIVE_ID_KEY, id);
  else window.localStorage.removeItem(ACTIVE_ID_KEY);
}

function buildLabel(state: AppState): string {
  const ev = state.event;
  if (!ev) return "אירוע ללא שם";
  const subjects = ev.partnerName ? `${ev.hostName} & ${ev.partnerName}` : ev.hostName;
  const date = ev.date ? new Date(ev.date).toLocaleDateString("he-IL", { day: "2-digit", month: "short", year: "numeric" }) : "";
  return date ? `${subjects} · ${date}` : subjects;
}

// Cross-tab synchronization channel. When tab A writes to slots, tab B
// gets a "refresh" message and re-reads from localStorage — so the two
// tabs converge instead of clobbering each other's writes.
//
// By design, the channel is opened once at module-eval time and never
// closed: it's a singleton that should live for the lifetime of the page.
// This is the (slightly unusual) "module-scope BroadcastChannel" pattern;
// closing it on the last hook unmount would also need a refcount AND would
// silently drop messages during route transitions when no subscriber is
// briefly mounted. The slight cost: dev HMR may stack channels across
// reloads — that's a hot-reload artifact, not a production leak.
const broadcast = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("momentum-slots")
  : null;

function dispatchUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("momentum:slots-update"));
  window.dispatchEvent(new CustomEvent("momentum:update"));
  // Notify other tabs of the change. We include the activeId we just wrote
  // so receivers can decide whether the change affects their visible event
  // or only the slots registry.
  broadcast?.postMessage({
    type: "slots-update",
    activeId: readActiveId(),
    source: "tab-self",
  });
}

// Listen for messages from other tabs. Until this fix, the listener
// invalidated the cached active id on every message — which caused tab A
// (working on event X) to silently flip to event Y when tab B switched
// active. We now check whether the inbound activeId matches the one this
// tab is showing; if not, only the slots list is refreshed, and a custom
// `eventSlots:remoteChange` event lets the UI notify the user without
// hijacking their workspace.
if (typeof window !== "undefined" && broadcast) {
  broadcast.addEventListener("message", (e) => {
    const data = e.data as { type?: string; activeId?: string | null } | null;
    if (!data?.type || data.type !== "slots-update") return;
    const localActive = cachedActiveId !== undefined ? cachedActiveId : readActiveId();
    if (data.activeId && localActive && data.activeId !== localActive) {
      // Another tab switched away to a different event. Don't hijack this
      // tab's view — only refresh the slots list (so the dropdown stays
      // current) and emit a soft event for any banner that wants to react.
      cachedSlots = null;
      window.dispatchEvent(new CustomEvent("momentum:slots-update"));
      window.dispatchEvent(
        new CustomEvent("eventSlots:remoteChange", { detail: data }),
      );
      return;
    }
    // Same active event (or no active id locally) — refresh everything.
    cachedSlots = null;
    cachedActiveId = undefined;
    window.dispatchEvent(new CustomEvent("momentum:slots-update"));
    window.dispatchEvent(new CustomEvent("momentum:update"));
  });
}

/**
 * Snapshot the live `app.v1` into the current active slot. Called before any
 * switch / create / delete to keep slots in sync.
 */
function snapshotActive(): EventSlot[] {
  const active = readActive();
  let slots = readSlots();
  let activeId = readActiveId();

  // If we have an active state but no active slot id, this is the very first
  // session — create a slot for the existing event.
  if (active.event && !activeId) {
    activeId = active.event.id;
    writeActiveId(activeId);
  }

  if (activeId) {
    const updated: EventSlot = {
      id: activeId,
      label: buildLabel(active),
      snapshot: active,
      updatedAt: new Date().toISOString(),
    };
    const idx = slots.findIndex((s) => s.id === activeId);
    if (idx >= 0) slots[idx] = updated;
    else slots = [...slots, updated];
    write(SLOTS_KEY, slots);
  }

  return slots;
}

export const eventSlots = {
  /** All saved events (active + inactive). The active one matches `activeSlotId`. */
  list(): EventSlot[] {
    snapshotActive();
    return readSlots();
  },

  activeId(): string | null {
    return readActiveId();
  },

  /** Switch to a different event. Saves the current state first, then loads the target. */
  switchTo(slotId: string): boolean {
    snapshotActive();
    const slots = readSlots();
    const target = slots.find((s) => s.id === slotId);
    if (!target) return false;
    write(ACTIVE_KEY, target.snapshot);
    writeActiveId(target.id);
    dispatchUpdate();
    return true;
  },

  /** Start a brand-new blank event. Saves the current event into slots. */
  createNew(): void {
    snapshotActive();
    write(ACTIVE_KEY, emptyState);
    writeActiveId(null);
    dispatchUpdate();
  },

  /** Delete the active event entirely (cancel/restart). Auto-switches to another slot if any exist. */
  deleteActive(): void {
    // Flush in-flight edits to the slots registry FIRST. Without this, any
    // unsaved guests/budget rows on the active event are gone forever once we
    // overwrite ACTIVE_KEY below — and if the user later confirms a "are you
    // sure?" dialog (added at the call site) the side effects are still
    // recoverable from the slot.
    snapshotActive();
    const slots = readSlots();
    const activeId = readActiveId();
    const remaining = activeId ? slots.filter((s) => s.id !== activeId) : slots;
    write(SLOTS_KEY, remaining);

    if (remaining.length > 0) {
      // Auto-switch to the most recently updated remaining slot.
      const next = [...remaining].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      write(ACTIVE_KEY, next.snapshot);
      writeActiveId(next.id);
    } else {
      write(ACTIVE_KEY, emptyState);
      writeActiveId(null);
    }
    dispatchUpdate();
  },

  /** Delete a specific slot by id. */
  deleteSlot(slotId: string): void {
    const activeId = readActiveId();
    if (slotId === activeId) {
      eventSlots.deleteActive();
      return;
    }
    // Snapshot the active slot before mutating the registry so unsaved edits
    // on the (still-active) slot survive a non-active deletion.
    snapshotActive();
    const slots = readSlots().filter((s) => s.id !== slotId);
    write(SLOTS_KEY, slots);
    dispatchUpdate();
  },

  /** Snapshot the current state — call after meaningful edits (debounced upstream). */
  saveSnapshot(): void {
    const active = readActive();
    let activeId = readActiveId();
    if (active.event && !activeId) {
      activeId = active.event.id;
      writeActiveId(activeId);
    }
    if (activeId) snapshotActive();
  },
};

// ────────────────────────────────────────────────────────────────────────────
// React hook — useSyncExternalStore-based, no setState-in-effect
// ────────────────────────────────────────────────────────────────────────────

// Stable cached snapshot — invalidated on every relevant DOM event.
let cachedSlots: EventSlot[] | null = null;
let cachedActiveId: string | null | undefined = undefined;

function getSlotsSnapshot(): EventSlot[] {
  if (cachedSlots) return cachedSlots;
  cachedSlots = eventSlots.list();
  return cachedSlots;
}
function getActiveIdSnapshot(): string | null {
  if (cachedActiveId !== undefined) return cachedActiveId;
  cachedActiveId = eventSlots.activeId();
  return cachedActiveId;
}
function subscribeSlots(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onUpdate = () => {
    cachedSlots = null;
    cachedActiveId = undefined;
    callback();
  };
  // Filter "storage" events to the keys we own. Without this filter, every
  // localStorage write on the same origin (theme toggle, user prefs, third-
  // party widgets) would invalidate the cache and force every consumer of
  // useEventSlots to re-render.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SLOTS_KEY || e.key === ACTIVE_KEY || e.key === ACTIVE_ID_KEY) {
      onUpdate();
    }
  };
  window.addEventListener("momentum:slots-update", onUpdate);
  window.addEventListener("momentum:update", onUpdate);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("momentum:slots-update", onUpdate);
    window.removeEventListener("momentum:update", onUpdate);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY_SLOTS: EventSlot[] = [];

export function useEventSlots() {
  const slots = useSyncExternalStore(subscribeSlots, getSlotsSnapshot, () => EMPTY_SLOTS);
  const activeId = useSyncExternalStore<string | null>(subscribeSlots, getActiveIdSnapshot, () => null);

  // Memoize the returned object so each render hands consumers a stable
  // reference. Without this, putting the result into a downstream
  // useEffect/useMemo deps array would loop forever — the action fns are
  // already stable (module-level), so we only invalidate when slots/activeId
  // change.
  return useMemo(
    () => ({
      slots,
      activeId,
      switchTo: eventSlots.switchTo,
      createNew: eventSlots.createNew,
      deleteActive: eventSlots.deleteActive,
      deleteSlot: eventSlots.deleteSlot,
      saveSnapshot: eventSlots.saveSnapshot,
      list: eventSlots.list,
    }),
    [slots, activeId],
  );
}
