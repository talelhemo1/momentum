"use client";

import Link from "next/link";
import { Crown, ArrowLeft } from "lucide-react";

/**
 * R25 — dashboard call-to-action that surfaces Momentum Live in the
 * final stretch. Hidden until the event is ≤14 days away (and not in
 * the past) so it appears exactly when delegating the day matters.
 */
export function LiveModeCTA({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft == null || daysLeft > 14 || daysLeft < 0) return null;

  return (
    <Link
      href="/event-day"
      className="card-gold p-6 md:p-7 flex items-center gap-5 group relative overflow-hidden transition hover:translate-y-[-2px]"
      style={{
        animation: "pulse-gold 2.6s ease-in-out infinite",
        border: "1px solid var(--border-gold)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-24 -end-20 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(212,176,104,0.18), transparent 70%)",
          filter: "blur(38px)",
        }}
      />
      <div
        className="relative shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background:
            "linear-gradient(160deg, rgba(244,222,169,0.30), rgba(168,136,74,0.12))",
          border: "1px solid var(--border-gold)",
          color: "var(--accent)",
        }}
      >
        <Crown size={32} aria-hidden />
      </div>

      <div className="relative flex-1 min-w-0">
        <h3 className="text-lg md:text-xl font-extrabold gradient-gold">
          {daysLeft === 0
            ? "האירוע שלך היום! הפעל את Momentum Live."
            : `האירוע שלך עוד ${daysLeft} ימים. הפעל את Momentum Live עכשיו.`}
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
          תן למישהו אמין לנהל איתך את היום ⚡
        </p>
      </div>

      <span
        className="relative shrink-0 hidden sm:inline-flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm transition group-hover:gap-3"
        style={{
          background: "linear-gradient(135deg, #F4DEA9, #A8884A)",
          color: "#1A1310",
        }}
      >
        בוא נתחיל
        <ArrowLeft size={16} aria-hidden />
      </span>
    </Link>
  );
}
