"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

/**
 * Minimal in-process toast system.
 *
 * Why local state instead of a library:
 *  - Zero dependencies kept (we already have lucide + framer-motion).
 *  - Renders RTL correctly with the rest of the app.
 *  - Auto-dismisses after 3.5s; no provider/context needed because every
 *    invocation goes through the module-level `showToast` function which
 *    fires a CustomEvent that a `<ToastHost />` instance listens to.
 *
 * Usage:
 *   import { ToastHost, showToast } from "@/components/Toast";
 *   // mount <ToastHost /> once near the root (we'll do it in app/layout.tsx)
 *   showToast("הנתונים יובאו בהצלחה", "success");
 */

type ToastKind = "success" | "error" | "info";

interface ToastEvent {
  id: string;
  message: string;
  kind: ToastKind;
}

const EVENT_NAME = "momentum:toast";

export function showToast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  const detail: ToastEvent = {
    id: crypto.randomUUID(),
    message,
    kind,
  };
  window.dispatchEvent(new CustomEvent<ToastEvent>(EVENT_NAME, { detail }));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastEvent>).detail;
      setToasts((prev) => [...prev, detail]);
      // Auto-dismiss after 3.5s
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, 3500);
    };
    window.addEventListener(EVENT_NAME, onToast);
    return () => window.removeEventListener(EVENT_NAME, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      // bottom-spacing: above MobileBottomNav (~58px + safe-area) on mobile
      // since the nav is rendered on the same routes the toast is shown.
      // Desktop: 1.5rem from bottom is plenty.
      className="fixed inset-x-0 mx-auto z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none no-print bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-2xl px-5 py-3 text-sm shadow-2xl flex items-center gap-3 fade-up max-w-md w-full"
          style={{
            background:
              t.kind === "success"
                ? "rgba(52,211,153,0.15)"
                : t.kind === "error"
                  ? "rgba(248,113,113,0.15)"
                  : "var(--input-bg)",
            border: `1px solid ${
              t.kind === "success"
                ? "rgba(52,211,153,0.4)"
                : t.kind === "error"
                  ? "rgba(248,113,113,0.4)"
                  : "var(--border-strong)"
            }`,
            color:
              t.kind === "success"
                ? "rgb(110,231,183)"
                : t.kind === "error"
                  ? "rgb(252,165,165)"
                  : "var(--foreground)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {t.kind === "success" ? (
            <CheckCircle2 size={18} className="shrink-0" />
          ) : t.kind === "error" ? (
            <AlertCircle size={18} className="shrink-0" />
          ) : (
            <Info size={18} className="shrink-0" />
          )}
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
