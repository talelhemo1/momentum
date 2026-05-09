"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 to `target` using `requestAnimationFrame` and an
 * easeOutQuart curve. Returns the current frame's value so the caller can
 * render it directly.
 *
 * Respects `prefers-reduced-motion` — when set, returns `target` immediately.
 *
 * The animation kicks off on every change to `target`. We always animate
 * FROM the previous displayed value so a confirmed-guest count going from
 * 12 → 13 doesn't snap back to 0.
 */
export function useCountUp(target: number, durationMs: number = 1200): number {
  const [value, setValue] = useState<number>(target);
  const fromRef = useRef<number>(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Honor reduced-motion: snap to target.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      fromRef.current = target;
      return;
    }
    // Animate from the current displayed value.
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / durationMs);
      // easeOutQuart — fast start, gentle finish.
      const eased = 1 - Math.pow(1 - p, 4);
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      if (p < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}
