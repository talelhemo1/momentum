"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, Check, Crown } from "lucide-react";

/**
 * R18 §R — upgrade modal opened straight from the user menu, instead of
 * a full-page navigation to /pricing. Shows the two real couple tiers
 * (free forever / ₪399 one-time per event — kept in sync with
 * app/pricing/page.tsx) and links out for the full comparison.
 *
 * Pure presentational: no checkout here (payments aren't wired yet),
 * just an honest summary + a path to the detailed page.
 */
export function UpgradePlanModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="upgrade-modal-title"
    >
      <div
        className="card glass-strong w-full max-w-md p-6 my-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ border: "1px solid var(--border-gold)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              שדרוג מסלול
            </div>
            <h2 id="upgrade-modal-title" className="mt-1 text-lg font-bold">
              פרימיום — כל הכלים, אירוע אחד
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg hover:bg-white/5"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-4"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
          >
            <div className="text-sm font-bold">חינם</div>
            <div className="mt-1 text-2xl font-extrabold ltr-num">₪0</div>
            <div className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              לתמיד
            </div>
          </div>
          <div
            className="rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(244,222,169,0.14), rgba(168,136,74,0.05))",
              border: "1px solid var(--border-gold)",
            }}
          >
            <div className="text-sm font-bold inline-flex items-center gap-1.5">
              <Crown size={13} className="text-[--accent]" aria-hidden /> פרימיום
            </div>
            <div className="mt-1 text-2xl font-extrabold ltr-num gradient-gold">₪399</div>
            <div className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              חד-פעמי לאירוע
            </div>
          </div>
        </div>

        <ul className="mt-5 space-y-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          {[
            "סידורי הושבה ללא הגבלה",
            "ייעוץ AI מורחב",
            "ייצוא וגיבוי מתקדם",
            "תמיכה מועדפת",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check size={15} className="text-[--accent] shrink-0" aria-hidden />
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-2">
          <Link
            href="/pricing"
            onClick={onClose}
            className="btn-gold w-full text-center"
          >
            צפה במסלולים המלאים
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary w-full"
          >
            המשך בחינם
          </button>
        </div>
      </div>
    </div>
  );
}
