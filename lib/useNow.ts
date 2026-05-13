"use client";

import { useSyncExternalStore } from "react";

/**
 * Returns a millisecond timestamp that updates on a fixed interval, returning
 * `null` during SSR / before first mount.
 *
 * Built on `useSyncExternalStore` — the canonical React pattern for syncing
 * with an external clock. This avoids the `set-state-in-effect` lint warning
 * (calling setState directly inside an effect causes cascading renders) and
 * also prevents hydration mismatches: the server snapshot is always `null`,
 * the client snapshot is `Date.now()`.
 */

// Cached "now" — useSyncExternalStore requires getSnapshot() to return a
// referentially stable value between subscribe-fires. Returning Date.now()
// directly causes infinite re-renders (each render reads a different number,
// React thinks the store has torn, schedules another render, repeat).
let cachedNow: number | null = null;

function bumpNow() {
  cachedNow = Date.now();
}

const subscribe60s = makeIntervalSubscribe(60_000);
const subscribe1s = makeIntervalSubscribe(1_000);
const subscribeOnce = (callback: () => void) => {
  // No polling — just nudge React once after mount so the component re-reads.
  if (typeof queueMicrotask !== "undefined") {
    queueMicrotask(() => {
      bumpNow();
      callback();
    });
  }
  return () => {};
};

function makeIntervalSubscribe(intervalMs: number) {
  return (callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    // Initialize the cache on first subscribe so getSnapshot has a value.
    if (cachedNow === null) bumpNow();
    const id = window.setInterval(() => {
      bumpNow();
      callback();
    }, intervalMs);
    return () => window.clearInterval(id);
  };
}

const getSnapshot = (): number | null => {
  if (cachedNow === null) cachedNow = Date.now();
  return cachedNow;
};
const getServerSnapshot = (): number | null => null;

/**
 * @param intervalMs how often to refresh. Default 60s — fine for "days until"
 *   countdowns. Pass 1000 for a live clock, or `null` to refresh only on mount.
 *   Note: only the literal values 60_000, 1_000, and `null` are supported as
 *   stable subscribers — caller should not pass arbitrary numbers.
 */
export function useNow(intervalMs: number | null = 60_000): number | null {
  const subscribe =
    intervalMs == null ? subscribeOnce : intervalMs === 1_000 ? subscribe1s : subscribe60s;
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot);
}

/** Days remaining between `now` and `target`, never negative. Null when not yet hydrated. */
export function daysUntil(target: string | number | Date, now: number | null): number | null {
  if (now == null) return null;
  const t = target instanceof Date ? target.getTime() : new Date(target).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 86_400_000));
}
