"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AppState, EventInfo, Guest, BudgetItem, BudgetCategory, VendorType, ChecklistItem, ChecklistPhase, SeatingTable, VendorMessage, AssistantMessage, Blessing, LivePhoto } from "./types";
import { VENDORS } from "./vendors";
import { buildDefaultChecklist } from "./checklists";
import { generateSigningKey } from "./crypto";
import { STORAGE_KEYS } from "./storage-keys";

const STORAGE_KEY = STORAGE_KEYS.app;

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

function readState(): AppState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = { ...emptyState, ...(JSON.parse(raw) as Partial<AppState>) };
    // Migration: events created before HMAC enforcement may lack a signing key.
    // Without one, /inbox would refuse all responses. Mint one lazily so legacy
    // local data keeps working safely.
    if (parsed.event && !parsed.event.signingKey) {
      parsed.event = { ...parsed.event, signingKey: generateSigningKey() };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } catch {}
    }
    return parsed;
  } catch {
    return emptyState;
  }
}

function writeState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Cache invalidation so the next getSnapshot() picks up the change.
  // useSyncExternalStore tears if getSnapshot returns a new object reference
  // for unchanged data, so we read-through a stable cache.
  cachedSnapshot = null;
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
  addTable(name: string, capacity: number) {
    const s = readState();
    const table: SeatingTable = { id: crypto.randomUUID(), name: name.trim() || `שולחן ${s.tables.length + 1}`, capacity: Math.max(1, capacity) };
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
    const newGuest: Guest = {
      id: crypto.randomUUID(),
      name: guest.name,
      phone: guest.phone,
      attendingCount: guest.attendingCount ?? 1,
      status: guest.status ?? "pending",
      side: guest.side,
      notes: guest.notes,
    };
    writeState({ ...s, guests: [...s.guests, newGuest] });
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
      writeState({
        ...s,
        selectedVendors: [...s.selectedVendors, id],
        budget: newBudget,
      });
    }
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
};

export function getStateSnapshot(): AppState {
  return readState();
}
