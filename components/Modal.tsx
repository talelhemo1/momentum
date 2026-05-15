"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * R18 §P — shared modal shell so every dialog gets the same close
 * affordances for free:
 *   • a 44×44 "×" button (WCAG 2.5.5 touch target)
 *   • Esc to close
 *   • click-outside (backdrop) to close, inner click contained
 *
 * The two pre-existing guest modals (AddGuestModal / BulkInviteModal)
 * were brought into spec in-place this round; new dialogs should prefer
 * this primitive instead of re-implementing the backdrop/Esc/✕ trio.
 */
export function Modal({
  onClose,
  title,
  children,
  maxWidthClass = "max-w-md",
  labelledBy = "modal-title",
}: {
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby={title ? labelledBy : undefined}
    >
      <div
        className={`card glass-strong p-6 w-full ${maxWidthClass} my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          {title ? (
            <h3 id={labelledBy} className="text-xl font-bold">
              {title}
            </h3>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-11 h-11 -m-2 flex items-center justify-center rounded-full hover:bg-[var(--secondary-button-bg)] transition shrink-0"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
