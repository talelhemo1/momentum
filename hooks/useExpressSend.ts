"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventInfo, Guest } from "@/lib/types";
import { actions } from "@/lib/store";
import { buildHostInvitationWhatsappLink } from "@/lib/invitation";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { haptic } from "@/lib/haptic";

/**
 * R39 — Express Bulk Send state machine.
 *
 * The "magic": the user clicks "open WhatsApp" for guest A (a real user
 * gesture → no popup block). They send in WhatsApp, return to the app
 * tab → `visibilitychange: visible`. After a 1.5 s grace window we mark
 * A invited, advance to B, and auto-open B's wa.me — that open happens
 * inside the tab-return turn, so the browser still treats it as
 * user-initiated. 200 invites in ~5 min instead of 30.
 *
 * Never mutates the captured queue's Guest objects. Completion is
 * tracked by id here AND mirrored to AppState via actions.markInvited
 * (same as the single-send button — "invited" is this app's
 * awaiting-response status, so the pending filter / counts stay
 * correct and resume works).
 */

const AUTO_OPEN_MS = 1500;
const RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h

interface SavedState {
  queueIds: string[];
  completedIds: string[];
  skippedIds: string[];
  currentId: string | null;
  savedAt: number;
}

export interface ExpressSendApi {
  isActive: boolean;
  isPaused: boolean;
  current: Guest | null;
  currentUrl: string | null;
  queueCount: number;
  completedIds: string[];
  skippedIds: string[];
  total: number;
  /** Seconds left on the auto-open countdown, or null when idle. */
  autoOpenIn: number | null;
  start: (filtered: Guest[]) => void;
  resumeSaved: (allGuests: Guest[]) => void;
  sendCurrent: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  goBack: (allGuests: Guest[]) => void;
  cancelAutoOpen: () => void;
  stop: () => void;
  reset: () => void;
  /** {completed,total} of a <2h saved run, or null. */
  peekResumable: (allGuests: Guest[]) => { completed: number; total: number } | null;
}

function readSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.expressSendState);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedState;
    if (!s || typeof s.savedAt !== "number") return null;
    if (Date.now() - s.savedAt > RESUME_MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function useExpressSend(
  origin: string,
  event: EventInfo | null,
): ExpressSendApi {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [current, setCurrent] = useState<Guest | null>(null);
  const [queue, setQueue] = useState<Guest[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [autoOpenIn, setAutoOpenIn] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  // Prebuilt wa.me URLs (buildHostInvitationWhatsappLink is async — must
  // be ready BEFORE window.open so the open stays synchronous).
  const urlCache = useRef<Map<string, string>>(new Map());
  // We opened wa.me for `current` and are waiting for the tab return.
  const awaitingReturn = useRef(false);
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  // Latest snapshot for the visibilitychange handler (avoids
  // re-subscribing the listener on every advance).
  const live = useRef({
    isActive: false,
    isPaused: false,
    current: null as Guest | null,
    queue: [] as Guest[],
    completedIds: [] as string[],
  });
  useEffect(() => {
    live.current = { isActive, isPaused, current, queue, completedIds };
  });

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const persist = useCallback(
    (q: Guest[], cur: Guest | null, comp: string[], skip: string[]) => {
      try {
        const s: SavedState = {
          queueIds: q.map((g) => g.id),
          completedIds: comp,
          skippedIds: skip,
          currentId: cur?.id ?? null,
          savedAt: Date.now(),
        };
        localStorage.setItem(
          STORAGE_KEYS.expressSendState,
          JSON.stringify(s),
        );
      } catch {
        /* storage full / disabled — resume just won't be offered */
      }
    },
    [],
  );

  // Build the wa.me URL for `current` (and prefetch the next one) so
  // sendCurrent()/auto-open can window.open synchronously.
  useEffect(() => {
    if (!event || !current) return;
    let cancelled = false;
    const cached = urlCache.current.get(current.id);
    if (cached) {
      setCurrentUrl(cached);
    } else {
      setCurrentUrl(null);
      void buildHostInvitationWhatsappLink(origin, event, current)
        .then(({ url }) => {
          urlCache.current.set(current.id, url);
          if (!cancelled) setCurrentUrl(url);
        })
        .catch(() => {
          /* leave null — the button stays disabled / shows retry */
        });
    }
    // Prefetch the next guest's link in the background.
    const next = queue[0];
    if (next && !urlCache.current.has(next.id)) {
      void buildHostInvitationWhatsappLink(origin, event, next)
        .then(({ url }) => urlCache.current.set(next.id, url))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [origin, event, current, queue]);

  const openUrl = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    awaitingReturn.current = true;
    haptic.light();
  }, []);

  const sendCurrent = useCallback(() => {
    const url = current ? urlCache.current.get(current.id) : null;
    if (!url) return; // link not ready yet — UI keeps the button disabled
    openUrl(url);
  }, [current, openUrl]);

  // advance: mark the outgoing guest, move to the next, optionally
  // auto-open it (only on the complete path, from cache).
  const advance = useCallback(
    (mark: "complete" | "skip", autoOpenNext: boolean) => {
      clearTimers();
      setAutoOpenIn(null);
      awaitingReturn.current = false;
      const cur = live.current.current;
      const q = live.current.queue;
      const comp = live.current.completedIds;
      const nextCompleted =
        mark === "complete" && cur ? [...comp, cur.id] : comp;
      if (mark === "complete" && cur) actions.markInvited(cur.id);
      if (mark === "skip" && cur) {
        setSkippedIds((s) => (s.includes(cur.id) ? s : [...s, cur.id]));
      }
      if (mark === "complete") setCompletedIds(nextCompleted);

      const next = q[0] ?? null;
      const restQueue = q.slice(1);
      setQueue(restQueue);
      setCurrent(next);
      persist(restQueue, next, nextCompleted, skippedIds);

      if (!next) {
        haptic.success();
        return;
      }
      if (autoOpenNext) {
        const url = urlCache.current.get(next.id);
        if (url) openUrl(url); // still inside the tab-return turn
      }
    },
    [clearTimers, persist, skippedIds, openUrl],
  );

  // The visibilitychange "magic". Subscribed once while active; reads
  // `live` for the latest state so it never needs re-subscribing.
  useEffect(() => {
    if (!isActive) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const L = live.current;
      if (!L.isActive || L.isPaused || !L.current) return;
      if (!awaitingReturn.current) return; // we didn't open one yet
      if (timerRef.current !== null) return; // countdown already running
      let remaining = Math.ceil(AUTO_OPEN_MS / 1000);
      setAutoOpenIn(remaining);
      tickRef.current = window.setInterval(() => {
        remaining -= 1;
        setAutoOpenIn(remaining > 0 ? remaining : 0);
      }, 1000);
      timerRef.current = window.setTimeout(() => {
        clearTimers();
        setAutoOpenIn(null);
        advance("complete", true);
      }, AUTO_OPEN_MS);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
    };
  }, [isActive, advance, clearTimers]);

  // Unmount safety net.
  useEffect(() => () => clearTimers(), [clearTimers]);

  const start = useCallback(
    (filtered: Guest[]) => {
      clearTimers();
      awaitingReturn.current = false;
      urlCache.current.clear();
      const first = filtered[0] ?? null;
      const rest = filtered.slice(1);
      setQueue(rest);
      setCurrent(first);
      setCompletedIds([]);
      setSkippedIds([]);
      setTotal(filtered.length);
      setAutoOpenIn(null);
      setIsPaused(false);
      setIsActive(true);
      persist(rest, first, [], []);
    },
    [clearTimers, persist],
  );

  const peekResumable = useCallback(
    (allGuests: Guest[]) => {
      const s = readSaved();
      if (!s) return null;
      const knownIds = new Set(allGuests.map((g) => g.id));
      const queueIds = s.queueIds.filter((id) => knownIds.has(id));
      const completed = s.completedIds.length;
      const totalKnown =
        completed +
        s.skippedIds.length +
        queueIds.length +
        (s.currentId && knownIds.has(s.currentId) ? 1 : 0);
      if (totalKnown === 0) return null;
      return { completed, total: totalKnown };
    },
    [],
  );

  const resumeSaved = useCallback(
    (allGuests: Guest[]) => {
      const s = readSaved();
      if (!s) return;
      const byId = new Map(allGuests.map((g) => [g.id, g]));
      const q = s.queueIds
        .map((id) => byId.get(id))
        .filter((g): g is Guest => !!g);
      const cur = s.currentId ? byId.get(s.currentId) ?? null : null;
      clearTimers();
      awaitingReturn.current = false;
      urlCache.current.clear();
      setQueue(q);
      setCurrent(cur);
      setCompletedIds(s.completedIds);
      setSkippedIds(s.skippedIds);
      setTotal(
        s.completedIds.length +
          s.skippedIds.length +
          q.length +
          (cur ? 1 : 0),
      );
      setAutoOpenIn(null);
      setIsPaused(false);
      setIsActive(true);
    },
    [clearTimers],
  );

  const pause = useCallback(() => {
    clearTimers();
    setAutoOpenIn(null);
    setIsPaused(true);
  }, [clearTimers]);

  const resume = useCallback(() => setIsPaused(false), []);

  const cancelAutoOpen = useCallback(() => {
    clearTimers();
    setAutoOpenIn(null);
    awaitingReturn.current = false;
  }, [clearTimers]);

  const skip = useCallback(() => {
    advance("skip", false);
  }, [advance]);

  const goBack = useCallback(
    (allGuests: Guest[]) => {
      clearTimers();
      setAutoOpenIn(null);
      awaitingReturn.current = false;
      const comp = live.current.completedIds;
      if (comp.length === 0) return;
      const prevId = comp[comp.length - 1];
      const prev = allGuests.find((g) => g.id === prevId);
      if (!prev) return;
      const cur = live.current.current;
      setCompletedIds(comp.slice(0, -1));
      setCurrent(prev);
      setQueue((q) => (cur ? [cur, ...q] : q));
    },
    [clearTimers],
  );

  const stop = useCallback(() => {
    clearTimers();
    setAutoOpenIn(null);
    awaitingReturn.current = false;
    persist(
      live.current.queue,
      live.current.current,
      live.current.completedIds,
      skippedIds,
    );
    setIsActive(false);
  }, [clearTimers, persist, skippedIds]);

  const reset = useCallback(() => {
    clearTimers();
    awaitingReturn.current = false;
    urlCache.current.clear();
    try {
      localStorage.removeItem(STORAGE_KEYS.expressSendState);
    } catch {
      /* ignore */
    }
    setIsActive(false);
    setIsPaused(false);
    setCurrent(null);
    setQueue([]);
    setCompletedIds([]);
    setSkippedIds([]);
    setCurrentUrl(null);
    setAutoOpenIn(null);
    setTotal(0);
  }, [clearTimers]);

  return {
    isActive,
    isPaused,
    current,
    currentUrl,
    queueCount: queue.length,
    completedIds,
    skippedIds,
    total,
    autoOpenIn,
    start,
    resumeSaved,
    sendCurrent,
    pause,
    resume,
    skip,
    goBack,
    cancelAutoOpen,
    stop,
    reset,
    peekResumable,
  };
}
