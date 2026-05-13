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

  // Whenever local state changes, debounce-push to the cloud.
  const onLocalChange = () => {
    if (pushTimer) clearTimeout(pushTimer);
    setStatus("syncing");
    pushTimer = setTimeout(() => {
      void pushToCloud();
    }, 800);
  };
  window.addEventListener("momentum:update", onLocalChange);
  window.addEventListener("storage", onLocalChange);

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
        const localState = JSON.parse(localRaw) as AppState & { updatedAt?: string };
        const localUpdatedRaw = localState.updatedAt
          ?? localState.event?.createdAt
          ?? null;
        const localUpdated = localUpdatedRaw ? new Date(localUpdatedRaw).getTime() : 0;
        const cloudUpdated = cloudUpdatedAtIso ? new Date(cloudUpdatedAtIso).getTime() : 0;
        // If the local copy is newer than the cloud copy by more than the
        // grace window, the user almost certainly has offline edits. Keep
        // them and push instead of overwriting.
        if (localUpdated > cloudUpdated + SYNC_CONFLICT_GRACE_MS) {
          shouldOverwrite = false;
          // Mark a flag so the user (and devtools) can see we kept local.
          try {
            window.localStorage.setItem(PENDING_UPSERT_FLAG_KEY, String(localUpdated));
          } catch {
            // private mode / quota — non-fatal.
          }
          scheduleCloudUpsert();
          console.warn(
            "[sync] local edits newer than cloud — kept local, scheduled upsert",
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
