"use client";

import { useEffect, useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "./storage-keys";

export type Theme = "dark" | "light";

const STORAGE_KEY = STORAGE_KEYS.theme;

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("momentum:theme-update", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("momentum:theme-update", callback);
  };
}

export function useTheme() {
  // Server snapshot defaults to "dark" — must match what the inline
  // theme-bootstrap script in layout.tsx assumes when storage is empty.
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    () => readTheme(),
    () => "dark",
  );
  // `mounted` is true once we're rendering the real client value. Lets callers
  // hide theme-dependent UI until after hydration to avoid icon flash.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  // R12 §2L — apply the data-theme attribute from a useEffect, not during
  // render. Mutating the DOM in render is a React-strict-mode anti-pattern
  // and can cause double-application in dev. The inline theme-bootstrap
  // script in layout.tsx handles the FIRST paint before hydration; this
  // effect keeps the attribute in sync afterward.
  useEffect(() => {
    if (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") !== theme) {
      applyTheme(theme);
    }
  }, [theme]);

  const setTheme = (next: Theme) => {
    if (typeof window === "undefined") return;
    // Apply the visual change first, then try to persist. A storage failure
    // should never block the user from seeing the theme they just clicked.
    applyTheme(next);
    window.dispatchEvent(new CustomEvent("momentum:theme-update"));
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      console.error("[momentum/theme] localStorage write failed:", e);
    }
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, mounted, setTheme, toggle };
}
