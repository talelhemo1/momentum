"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Info, CheckCircle2, AlertTriangle, Siren, X } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { playManagerSound } from "@/lib/managerSounds";

export interface AlertToastData {
  id: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const SEV = {
  info: {
    icon: Info,
    color: "rgb(125,180,255)",
    border: "rgba(125,180,255,0.35)",
    bg: "rgba(125,180,255,0.10)",
  },
  success: {
    icon: CheckCircle2,
    color: "rgb(110,231,183)",
    border: "rgba(52,211,153,0.35)",
    bg: "rgba(52,211,153,0.10)",
  },
  warning: {
    icon: AlertTriangle,
    color: "var(--accent)",
    border: "var(--border-gold)",
    bg: "rgba(212,176,104,0.10)",
  },
  critical: {
    icon: Siren,
    color: "rgb(252,176,64)",
    border: "rgba(245,158,11,0.45)",
    bg: "rgba(245,158,11,0.12)",
  },
} as const;

/**
 * R26 — luxury alert toast. Slide-down entrance, glass-lifted card,
 * severity-tinted border + icon, swipe-right to dismiss (framer drag),
 * auto-dismiss after 8s unless critical. Honors reduced-motion (the
 * CSS class no-ops; drag still works).
 */
export function AlertToast({
  alert,
  onDismiss,
}: {
  alert: AlertToastData;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const sev = SEV[alert.severity];
  const Icon = sev.icon;

  useEffect(() => {
    // Subtle feedback on appearance.
    if (alert.severity === "critical") {
      haptic.heavy();
      playManagerSound("crisis");
    } else {
      haptic.light();
      playManagerSound("alert");
    }
    if (alert.severity === "critical") return; // sticky until handled
    const t = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(t);
  }, [alert.id, alert.severity, onDismiss]);

  return (
    <motion.div
      layout
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.9 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 90) onDismiss();
      }}
      initial={reduce ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 120 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`glass-strong rounded-2xl p-3.5 flex items-start gap-3 cursor-grab active:cursor-grabbing ${
        alert.severity === "critical" ? "r26-critical-pulse" : ""
      }`}
      style={{
        border: `1px solid ${sev.border}`,
        background: sev.bg,
        boxShadow: "0 12px 32px -10px rgba(0,0,0,0.45)",
        willChange: "transform",
      }}
      role="status"
    >
      <span
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.06)", color: sev.color }}
        aria-hidden
      >
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold leading-snug">{alert.title}</div>
        {alert.body && (
          <div
            className="text-xs mt-0.5 leading-relaxed"
            style={{ color: "var(--foreground-soft)" }}
          >
            {alert.body}
          </div>
        )}
        {alert.actionLabel && alert.onAction && (
          <button
            type="button"
            onClick={alert.onAction}
            className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.08)", color: sev.color }}
          >
            {alert.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגור"
        className="shrink-0 w-7 h-7 -m-1 flex items-center justify-center rounded-lg hover:bg-white/10"
        style={{ color: "var(--foreground-muted)" }}
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}

/** Fixed top-center stack, max 3 visible (newest first). */
export function AlertToastStack({
  alerts,
  onDismiss,
}: {
  alerts: AlertToastData[];
  onDismiss: (id: string) => void;
}) {
  const visible = alerts.slice(0, 3);
  if (visible.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-3 pointer-events-none"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      {visible.map((a) => (
        <div key={a.id} className="w-full max-w-md pointer-events-auto">
          <AlertToast alert={a} onDismiss={() => onDismiss(a.id)} />
        </div>
      ))}
    </div>
  );
}
