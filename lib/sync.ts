"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase, SUPABASE_ENABLED } from "./supabase";
import { STORAGE_KEYS } from "./storage-keys";
import type { AppState } from "./types";

const STORAGE_KEY = STORAGE_KEYS.app;

/**
 * Cloud sync layer that sits ON TOP OF localStorage.
 *
 * Strategy:
 *   - localStorage stays the immediate source of truth (fast, offline-friendly).
 *   - Every write triggers a debounced "push" to Supabase.
 *   - On login / mount, we "pull" from Supabase and overwrite localStorage if
 *     the cloud copy is newer.
 *   - If Supabase isn't configured, the app behaves exactly like before.
 */

export type SyncStatus = "disabled" | "signed-out" | "syncing" | "synced" | "offline" | "error";

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let listenerSetup = false;

// Module-level status that drives the UI. The hook subscribes to changes.
let currentStatus: SyncStatus = SUPABASE_ENABLED ? "syncing" : "disabled";
let lastError: string | null = null;
const statusListeners = new Set<() => void>();

function setStatus(next: SyncStatus, error: string | null = null) {
  if (currentStatus === next && lastError === error) return;
  currentStatus = next;
  lastError = error;
  for (const fn of statusListeners) fn();
}

export function getLastSyncError(): string | null {
  return lastError;
}

export function setupCloudSync() {
  if (!SUPABASE_ENABLED || typeof window === "undefined" || listenerSetup) return;
  listenerSetup = true;

  // R147 — tightened from 800ms to 250ms. The old 800ms debounce was wide
  // enough that a user adding a guest and immediately closing the tab lost
  // the change: the setTimeout died with the page and the push never fired.
  // 250ms is still long enough to coalesce a burst of typing/clicks into one
  // upsert, but short enough that a "type → cmd-w" pattern still squeezes
  // the push through.
  const onLocalChange = () => {
    if (pushTimer) clearTimeout(pushTimer);
    setStatus("syncing");
    pushTimer = setTimeout(() => {
      void pushToCloud();
    }, 250);
  };
  window.addEventListener("momentum:update", onLocalChange);
  window.addEventListener("storage", onLocalChange);

  // R147 — GUARANTEED save on tab close / navigate-away. The async
  // pushToCloud() through supabase-js may not complete after the page is
  // gone; the browser cancels in-flight fetches on unload. `keepalive: true`
  // on a direct POST tells the browser to finish the request even after the
  // page is dismissed (the standard "send-on-unload" pattern, same as
  // navigator.sendBeacon but with custom headers).
  //
  // `pagehide` fires when the tab is closed OR navigated away OR put into
  // bfcache. `visibilitychange → hidden` fires when the user switches tabs
  // / minimizes — extra insurance for mobile/tablet where the OS may kill
  // the tab in the background.
  const onUnload = () => {
    beaconFlush();
  };
  window.addEventListener("pagehide", onUnload);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onUnload();
  });

  // React to network online/offline transitions.
  window.addEventListener("online", () => setStatus("syncing"));
  window.addEventListener("offline", () => setStatus("offline"));

  // React to auth changes — sign-out should immediately reflect in the badge.
  const supabase = getSupabase();
  supabase?.auth.onAuthStateChange((_evt, session) => {
    if (!session?.user) setStatus("signed-out");
    else setStatus("synced");
  });

  // Initial probe.
  void refreshStatus();
}

/**
 * R147 — fire-and-forget upsert that the browser GUARANTEES to finish even
 * after pagehide / tab close. Bypasses supabase-js (which doesn't expose
 * fetch's `keepalive` option) and POSTs directly to the Supabase REST API.
 *
 * Reads the access token straight out of storage (R146's ITP-resistant
 * adapter wrote it to localStorage + cookie); parses the user_id from the
 * JWT; sends the upsert with `keepalive: true`. If anything's missing
 * (signed out, no local state, env unset) it just returns silently.
 *
 * The request has a 64KB body limit per the keepalive spec — the entire
 * AppState is well under that.
 */
function beaconFlush(): void {
  if (typeof window === "undefined" || !SUPABASE_ENABLED) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  // Local state to push.
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  // Access token — supabase-js stores its session under "sb-<ref>-auth-token"
  // (localStorage + cookie, see R146). Grab the first one that matches.
  let accessToken: string | null = null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
      const v = window.localStorage.getItem(k);
      if (!v) continue;
      try {
        const parsed = JSON.parse(v) as { access_token?: string } | null;
        if (parsed?.access_token) {
          accessToken = parsed.access_token;
          break;
        }
      } catch {
        /* not JSON */
      }
    }
  } catch {
    return;
  }
  if (!accessToken) return;

  // user_id from the JWT's `sub` claim.
  let userId: string | null = null;
  try {
    const parts = accessToken.split(".");
    if (parts.length === 3) {
      // base64url → base64 → string. The JWT lib would do this but we want
      // zero extra cost on the unload path.
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const decoded = JSON.parse(atob(b64 + pad)) as { sub?: string };
      userId = decoded?.sub ?? null;
    }
  } catch {
    return;
  }
  if (!userId) return;

  // Parse payload (we send as JSON so this must succeed).
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  // R152 — same eventless guard as pushToCloud: don't beacon an empty
  // (pre-restore) state over a populated cloud row.
  if (
    !payload ||
    typeof payload !== "object" ||
    !(payload as { event?: unknown }).event
  ) {
    return;
  }

  const body = JSON.stringify({
    user_id: userId,
    payload,
    updated_at: new Date().toISOString(),
  });

  try {
    void fetch(`${url}/rest/v1/app_states?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body,
      keepalive: true,
    }).catch(() => {
      /* fire-and-forget */
    });
  } catch {
    /* non-fatal */
  }
}

async function refreshStatus() {
  if (!SUPABASE_ENABLED) return setStatus("disabled");
  const supabase = getSupabase();
  if (!supabase) return setStatus("disabled");
  if (typeof navigator !== "undefined" && !navigator.onLine) return setStatus("offline");
  const { data: { user } } = await supabase.auth.getUser();
  setStatus(user ? "synced" : "signed-out");
}

/**
 * Permanently delete the current user's row from the cloud.
 * Best-effort: returns true if the delete succeeded OR the user was already
 * signed out / no row existed. Returns false on a hard error.
 *
 * Note: this does NOT delete the auth user itself — Supabase requires admin
 * privileges for that and we'd need a server-side endpoint. The auth user
 * stays but their data row is gone, and we sign them out locally.
 */
export async function deleteCloudData(): Promise<boolean> {
  if (!SUPABASE_ENABLED) return true;
  const supabase = getSupabase();
  if (!supabase) return true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return true;
    const { error } = await supabase
      .from("app_states")
      .delete()
      .eq("user_id", user.id);
    if (error) {
      console.error("[momentum/sync] deleteCloudData failed:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[momentum/sync] deleteCloudData threw:", e);
    return false;
  }
}

/**
 * Awaited, one-shot flush of the current localStorage AppState to the cloud.
 * Exposed so the logout path can GUARANTEE the latest local edits are saved
 * before localStorage is purged (otherwise an event/guests/seating created in
 * the last few hundred ms — before the debounced push fired — would be lost).
 * Must be called while the user is still authenticated (before auth signOut).
 */
export function flushToCloud(): Promise<boolean> {
  return pushToCloud();
}

async function pushToCloud(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus("signed-out");
      return false;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    let payload: AppState;
    try {
      payload = JSON.parse(raw);
    } catch {
      setStatus("error", "פגום: לא ניתן לפרסר את המצב המקומי לפני סנכרון");
      return false;
    }
    // R152 — NEVER overwrite the cloud with an eventless state. On a fresh
    // page load (or after Safari ITP wiped localStorage) the store briefly
    // holds the empty default before syncOnLogin restores; a stray
    // `momentum:update` could otherwise push that emptiness over a populated
    // cloud row and erase everything. No event = nothing worth saving — skip.
    if (!payload || !payload.event) {
      return false;
    }
    const { error } = await supabase
      .from("app_states")
      .upsert({ user_id: user.id, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      // Surface the failure rather than silently swallowing it.
      console.error("[momentum/sync] pushToCloud failed:", error);
      setStatus("error", error.message);
      return false;
    }
    setStatus("synced");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[momentum/sync] pushToCloud threw:", e);
    setStatus("error", msg);
    return false;
  }
}

async function pullFromCloud(): Promise<{ state: AppState; updatedAt: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("app_states")
      .select("payload, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[momentum/sync] pullFromCloud failed:", error);
      setStatus("error", error.message);
      return null;
    }
    if (!data?.payload) return null;
    return {
      state: data.payload as AppState,
      updatedAt: (data.updated_at as string | null | undefined) ?? null,
    };
  } catch (e) {
    console.error("[momentum/sync] pullFromCloud threw:", e);
    return null;
  }
}

/**
 * Schedule a cloud upsert for state held only locally. Called when
 * `syncOnLogin` detects the local copy is newer than the cloud row by more
 * than the conflict threshold — we keep the local edits and push them up
 * once auth is settled. Failure here is logged but never throws; the local
 * state is the source of truth in conflict mode.
 *
 * No `localState` parameter: `pushToCloud` reads the freshest copy from
 * localStorage so we don't risk a stale snapshot being uploaded.
 */
function scheduleCloudUpsert(): void {
  queueMicrotask(() => {
    void pushToCloud().catch((e) => {
      console.error("[momentum/sync] scheduleCloudUpsert push failed:", e);
    });
  });
}

const SYNC_CONFLICT_GRACE_MS = 30_000;
const PENDING_UPSERT_FLAG_KEY = "momentum.sync.pendingUpsert";

/**
 * Pull the cloud state into localStorage on login. Detects offline-edit
 * conflicts: if the local `updatedAt` is more than 30 seconds newer than
 * the cloud row, we keep the local copy and schedule an upsert instead of
 * blindly overwriting offline edits.
 */
export async function syncOnLogin(): Promise<{ source: "cloud" | "local" | "none" }> {
  if (!SUPABASE_ENABLED) return { source: "none" };
  const pulled = await pullFromCloud();
  if (pulled) {
    const { state: cloudState, updatedAt: cloudUpdatedAtIso } = pulled;
    const localRaw = window.localStorage.getItem(STORAGE_KEY);
    let shouldOverwrite = true;
    if (localRaw) {
      try {
        const localState = JSON.parse(localRaw) as AppState;
        const localGuests = localState.guests?.length ?? 0;
        const cloudGuests = cloudState.guests?.length ?? 0;
        const localUpdatedRaw = localState.updatedAt
          ?? localState.event?.createdAt
          ?? null;
        const localUpdated = localUpdatedRaw ? new Date(localUpdatedRaw).getTime() : 0;
        const cloudUpdated = cloudUpdatedAtIso ? new Date(cloudUpdatedAtIso).getTime() : 0;
        // Never let an empty (or sparser) cloud row wipe a richer local guest list.
        // Common case: user added guests locally but cloud push hadn't landed yet,
        // or syncOnLogin runs before the debounced push completes on reload.
        if (localGuests > cloudGuests) {
          shouldOverwrite = false;
        } else if (localGuests > 0 && cloudGuests === 0) {
          shouldOverwrite = false;
        } else if (localUpdated > cloudUpdated + SYNC_CONFLICT_GRACE_MS) {
          shouldOverwrite = false;
        }
        if (!shouldOverwrite) {
          try {
            window.localStorage.setItem(PENDING_UPSERT_FLAG_KEY, String(localUpdated));
          } catch {
            // private mode / quota — non-fatal.
          }
          scheduleCloudUpsert();
          console.warn(
            "[sync] kept local state over cloud",
            { localGuests, cloudGuests, localUpdated, cloudUpdated },
          );
        }
      } catch {
        // Local copy is corrupt; let the cloud overwrite it.
      }
    }
    if (shouldOverwrite) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudState));
      window.dispatchEvent(new CustomEvent("momentum:update"));
      setStatus("synced");
      return { source: "cloud" };
    }
    // We kept local; treat the result as a local-source sync.
    setStatus("synced");
    return { source: "local" };
  }
  // No cloud row yet → push current local state up so the user starts fresh in cloud.
  const ok = await pushToCloud();
  return { source: ok ? "local" : "none" };
}

// ────────────────────────────────────────────────────────────────────────────
// React hook — useSyncExternalStore-based, no setState-in-effect
// ────────────────────────────────────────────────────────────────────────────

function subscribe(callback: () => void) {
  statusListeners.add(callback);
  return () => {
    statusListeners.delete(callback);
  };
}

export function useSyncStatus(): SyncStatus {
  // Make sure the singleton is wired up at least once. Safe to call repeatedly.
  useEffect(() => {
    setupCloudSync();
  }, []);
  return useSyncExternalStore<SyncStatus>(
    subscribe,
    () => currentStatus,
    () => (SUPABASE_ENABLED ? "syncing" : "disabled"),
  );
}
