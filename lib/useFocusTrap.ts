"use client";

import { useEffect } from "react";

/**
 * Focus trap for modals/dialogs. While `active` is true:
 *  - On mount: focus moves to the first focusable child of `containerRef`.
 *  - Tab / Shift+Tab cycle focus inside the container.
 *  - Esc calls `onClose` (if provided).
 *  - On unmount / deactivation: focus returns to the previously-focused element.
 *
 * The hook is hands-off about which descendant gets focused first — it just
 * picks the first focusable. Pass `initialFocusRef` if you need a specific
 * starting point (not yet implemented; YAGNI).
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap({ containerRef: ref, active: open, onClose: () => setOpen(false) });
 */
interface UseFocusTrapOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  active: boolean;
  onClose?: () => void;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap({ containerRef, active, onClose }: UseFocusTrapOptions): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus first focusable child after a tick so the DOM is stable.
    const initialFocus = window.setTimeout(() => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(initialFocus);
      window.removeEventListener("keydown", onKey);
      // Return focus to wherever we stole it from.
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, onClose]);
}
