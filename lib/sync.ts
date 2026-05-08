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

async function pullFromCloud(): Promise<AppState | null> {
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
    return (data?.payload as AppState | undefined) ?? null;
  } catch (e) {
    console.error("[momentum/sync] pullFromCloud threw:", e);
    return null;
  }
}

/** Pull the cloud state into localStorage on login. Used by the auth handler. */
export async function syncOnLogin(): Promise<{ source: "cloud" | "local" | "none" }> {
  if (!SUPABASE_ENABLED) return { source: "none" };
  const cloudState = await pullFromCloud();
  if (cloudState) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudState));
    window.dispatchEvent(new CustomEvent("momentum:update"));
    setStatus("synced");
    return { source: "cloud" };
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
