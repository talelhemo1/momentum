"use client";

import { useSyncExternalStore } from "react";
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
  window.localStorage.setItem(key, JSON.stringify(value));
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
const broadcast = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("momentum-slots")
  : null;

function dispatchUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("momentum:slots-update"));
  window.dispatchEvent(new CustomEvent("momentum:update"));
  // Notify other tabs of the change.
  broadcast?.postMessage({ type: "slots-update" });
}

// Listen for messages from other tabs and forward them as in-tab events
// so existing subscribers (useEventSlots, useAppState) refresh their snapshots.
if (typeof window !== "undefined" && broadcast) {
  broadcast.addEventListener("message", (e) => {
    if (e.data?.type === "slots-update") {
      window.dispatchEvent(new CustomEvent("momentum:slots-update"));
      window.dispatchEvent(new CustomEvent("momentum:update"));
    }
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
  window.addEventListener("momentum:slots-update", onUpdate);
  window.addEventListener("momentum:update", onUpdate);
  window.addEventListener("storage", onUpdate);
  return () => {
    window.removeEventListener("momentum:slots-update", onUpdate);
    window.removeEventListener("momentum:update", onUpdate);
    window.removeEventListener("storage", onUpdate);
  };
}

const EMPTY_SLOTS: EventSlot[] = [];

export function useEventSlots() {
  const slots = useSyncExternalStore(subscribeSlots, getSlotsSnapshot, () => EMPTY_SLOTS);
  const activeId = useSyncExternalStore<string | null>(subscribeSlots, getActiveIdSnapshot, () => null);

  // Expose state values + the ACTION methods (skip the `activeId()` getter — it
  // would otherwise shadow our reactive `activeId` state above).
  return {
    slots,
    activeId,
    switchTo: eventSlots.switchTo,
    createNew: eventSlots.createNew,
    deleteActive: eventSlots.deleteActive,
    deleteSlot: eventSlots.deleteSlot,
    saveSnapshot: eventSlots.saveSnapshot,
    list: eventSlots.list,
  };
}
