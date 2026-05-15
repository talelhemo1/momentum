"use client";

import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Phone, MessageSquare, MapPin } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * R26 — bottom action sheet. Drag-down (or backdrop / Esc) to close.
 * Partial backdrop blur (doesn't fully obscure the live screen behind).
 * transform/opacity only; will-change set while interactive.
 */
export function ActionSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[85]"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[86]"
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            drag={reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110) onClose();
            }}
            style={{ willChange: "transform" }}
            role="dialog"
            aria-modal
            aria-label={title}
          >
            <div
              className="glass-strong rounded-t-3xl px-5 pb-8 pt-3 max-w-md mx-auto"
              style={{
                border: "1px solid var(--border-strong)",
                paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
              }}
            >
              <div
                className="mx-auto mb-4 rounded-full"
                style={{ width: 40, height: 4, background: "var(--border-strong)" }}
                aria-hidden
              />
              <h3 className="text-lg font-bold text-center mb-4">{title}</h3>
              <div style={{ minHeight: 120 }}>{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SheetAction({
  href,
  icon,
  label,
  onClick,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const cls =
    "w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-start text-sm font-medium transition hover:translate-y-[-1px]";
  const style = {
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
  } as const;
  const inner = (
    <>
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(212,176,104,0.14)", color: "var(--accent)" }}
        aria-hidden
      >
        {icon}
      </span>
      {label}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className={cls}
        style={style}
        onClick={() => haptic.medium()}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={() => {
        haptic.medium();
        onClick?.();
      }}
    >
      {inner}
    </button>
  );
}

/**
 * Vendor convenience: call / SMS / navigate. `address` opens Waze
 * (falls back to Google Maps if Waze isn't installed — the geo intent
 * handles that on most phones; we use the Waze deep link first).
 */
export function VendorActionSheet({
  open,
  onClose,
  vendor,
}: {
  open: boolean;
  onClose: () => void;
  vendor: { name: string; phone?: string; address?: string };
}) {
  const tel = vendor.phone ? `tel:${vendor.phone}` : undefined;
  const sms = vendor.phone ? `sms:${vendor.phone}` : undefined;
  const nav = vendor.address
    ? `https://waze.com/ul?q=${encodeURIComponent(vendor.address)}&navigate=yes`
    : undefined;
  return (
    <ActionSheet open={open} title={vendor.name} onClose={onClose}>
      <div className="space-y-2.5">
        {tel && <SheetAction href={tel} icon={<Phone size={17} />} label="התקשר" />}
        {sms && (
          <SheetAction href={sms} icon={<MessageSquare size={17} />} label="שלח SMS" />
        )}
        {nav && (
          <SheetAction href={nav} icon={<MapPin size={17} />} label="ניווט (Waze)" />
        )}
        {!tel && !nav && (
          <p className="text-sm text-center" style={{ color: "var(--foreground-muted)" }}>
            אין פרטי קשר זמינים לספק זה.
          </p>
        )}
      </div>
    </ActionSheet>
  );
}
