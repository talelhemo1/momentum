/**
 * RSVP real-time sync.
 *
 * Two transports, picked automatically based on configuration:
 *
 * 1) **BroadcastChannel** (always on, free) — relays RSVP events between tabs
 *    of the same device. The /rsvp page lives in one tab, the host's dashboard
 *    in another; both speak the same channel and react to each other.
 *
 * 2) **Supabase realtime** (optional, when SUPABASE_ENABLED) — subscribes the
 *    dashboard to `postgres_changes` on the `rsvps` table. The /rsvp page
 *    upserts a row; the dashboard receives the change and applies it locally.
 *    This is the only path that works across devices (guest's phone → host's
 *    laptop). Without Supabase the cross-device flow degrades to "guest
 *    sends WhatsApp answer back, host imports it via /inbox".
 *
 * Local writes to the AppState always go through `actions.setRsvp`, which
 * already broadcasts a `momentum:update` event consumed by `useAppState`. So
 * the dashboard updates without any explicit polling once an event arrives.
 */

import { actions } from "./store";
import { getSupabase, SUPABASE_ENABLED } from "./supabase";
import type { GuestStatus } from "./types";

const CHANNEL_NAME = "momentum:rsvp:v1";

export interface RsvpUpdate {
  eventId: string;
  guestId: string;
  status: GuestStatus;
  attendingCount: number;
  notes?: string;
  /** ISO timestamp when the guest submitted. */
  respondedAt: string;
  /** Where the update originated, for telemetry / dedup. */
  source: "self" | "broadcast" | "supabase";
}

let channel: BroadcastChannel | null = null;
function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  if (channel) return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

type Handler = (update: RsvpUpdate) => void;
const handlers = new Set<Handler>();
let messageBound = false;

function bindMessageOnce() {
  if (messageBound) return;
  const ch = ensureChannel();
  if (!ch) return;
  messageBound = true;
  ch.addEventListener("message", (ev) => {
    const data = ev.data as RsvpUpdate | null;
    if (!data || typeof data !== "object" || !data.guestId) return;
    // Re-tag so subscribers can tell broadcast vs. self vs. supabase.
    handlers.forEach((h) => h({ ...data, source: "broadcast" }));
  });
}

/**
 * Subscribe to RSVP updates from any transport. Returns an unsubscribe fn.
 * The handler is called for every update — including ones the same tab just
 * published — so the dashboard sees them too.
 */
export function subscribeRsvpUpdates(handler: Handler): () => void {
  bindMessageOnce();
  handlers.add(handler);
  // If Supabase is on, lazily wire postgres_changes once.
  void wireSupabaseRealtime();
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Publish a fresh RSVP across both transports. Always:
 *  1) writes locally via `actions.setRsvp` so the in-tab dashboard reacts via
 *     useAppState.
 *  2) posts a BroadcastChannel message so other tabs see it.
 *  3) attempts a Supabase upsert (best-effort) for cross-device propagation.
 *
 * The /rsvp page is the only producer today. Future: vendor messages, etc.
 */
export async function publishRsvpUpdate(
  input: Omit<RsvpUpdate, "source" | "respondedAt"> & { respondedAt?: string },
): Promise<void> {
  const update: RsvpUpdate = {
    ...input,
    respondedAt: input.respondedAt ?? new Date().toISOString(),
    source: "self",
  };

  // 1) Local store — already writes invitedAt/respondedAt and broadcasts
  // momentum:update for in-tab consumers.
  actions.setRsvp(update.guestId, update.status as "confirmed" | "declined" | "maybe", update.attendingCount);
  if (update.notes) actions.updateGuest(update.guestId, { notes: update.notes });

  // 2) Cross-tab via BroadcastChannel.
  const ch = ensureChannel();
  if (ch) {
    try {
      ch.postMessage(update);
    } catch {
      // Channel closed mid-flight — silent, the local write still landed.
    }
  }

  // Notify same-tab subscribers ourselves; the BroadcastChannel doesn't echo
  // back to the sender by spec.
  handlers.forEach((h) => h({ ...update, source: "self" }));

  // 3) Supabase (best-effort, fire-and-forget).
  void pushToSupabase(update);
}

// ──────────────────────────────────────────────────────────────────────
// Supabase wiring (track A) — only active when SUPABASE_ENABLED.
// We don't import the rest of lib/sync.ts here because the rsvps table is
// a separate, public-write table with its own RLS policy keyed by token.
// ──────────────────────────────────────────────────────────────────────

let supabaseWired = false;

async function wireSupabaseRealtime() {
  if (supabaseWired) return;
  if (!SUPABASE_ENABLED) return;
  const supabase = getSupabase();
  if (!supabase) return;
  supabaseWired = true;
  // Listen for inserts/updates on the rsvps table. We don't filter by
  // event_id at the channel level — the host is on their device, only their
  // event will be sending through here in practice, and filter-by-RLS keeps
  // strangers' rows out of the stream regardless.
  type RsvpRow = {
    event_id?: string;
    guest_id?: string;
    status?: GuestStatus;
    attending_count?: number;
    notes?: string;
    responded_at?: string;
  };
  supabase
    .channel("rsvps")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rsvps" },
      (payload: { new?: RsvpRow }) => {
        const row = payload.new;
        if (!row || !row.guest_id || !row.event_id || !row.status) return;
        const update: RsvpUpdate = {
          eventId: row.event_id,
          guestId: row.guest_id,
          status: row.status,
          attendingCount: typeof row.attending_count === "number" ? row.attending_count : 1,
          notes: row.notes ?? undefined,
          respondedAt: row.responded_at ?? new Date().toISOString(),
          source: "supabase",
        };
        // Reflect in local store (idempotent — setRsvp writes whatever we pass).
        actions.setRsvp(update.guestId, update.status as "confirmed" | "declined" | "maybe", update.attendingCount);
        if (update.notes) actions.updateGuest(update.guestId, { notes: update.notes });
        handlers.forEach((h) => h(update));
      },
    )
    .subscribe();
}

async function pushToSupabase(update: RsvpUpdate): Promise<boolean> {
  if (!SUPABASE_ENABLED) return false;
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("rsvps")
      .upsert(
        {
          event_id: update.eventId,
          guest_id: update.guestId,
          status: update.status,
          attending_count: update.attendingCount,
          notes: update.notes ?? null,
          responded_at: update.respondedAt,
        },
        { onConflict: "guest_id" },
      );
    if (error) {
      console.error("[momentum/rsvpSync] supabase upsert failed:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[momentum/rsvpSync] supabase upsert threw:", e);
    return false;
  }
}

/**
 * Convenience for the /guests dashboard: returns the active sync mode for the
 * UI to show ("✓ סנכרון בענן" vs. "📡 סנכרון בין-טאבים").
 */
export function activeSyncMode(): "supabase" | "broadcast" | "none" {
  if (SUPABASE_ENABLED) return "supabase";
  if (typeof BroadcastChannel !== "undefined") return "broadcast";
  return "none";
}
