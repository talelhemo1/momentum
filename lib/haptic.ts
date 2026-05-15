"use client";

/**
 * R26 — tiny haptic feedback wrapper for Momentum Live.
 *
 * `navigator.vibrate` is a no-op on desktop and unsupported iOS Safari
 * (it silently does nothing), so every call is guarded with `?.` and we
 * never throw. Patterns are deliberately *subtle* — luxury, not arcade.
 */
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(pattern);
    }
  } catch {
    /* some embedded webviews throw on vibrate — ignore */
  }
}

export const haptic = {
  /** A whisper — taps, toggles. */
  light: () => vibrate(10),
  /** A confirm — primary button, sheet open. */
  medium: () => vibrate(50),
  /** A thud — destructive / important. */
  heavy: () => vibrate([50, 30, 50]),
  /** Soft double — a good thing happened (check-in, accept). */
  success: () => vibrate([20, 30, 20]),
  /** Staccato — something failed. */
  error: () => vibrate([30, 50, 30, 50, 30]),
};
