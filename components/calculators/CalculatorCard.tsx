"use client";

import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";

/**
 * R22 §H — shared luxury shell for every calculator in the hub so the
 * five tools look like one cohesive product:
 *   • header: big emoji + name + one-line subtitle
 *   • body: the calculator itself
 *   • footer: a gold 💡 tip box
 *
 * Pure presentational. Soft gold radial wash + card-gold for the premium
 * feel; no min-height here (the hub owns the panel sizing).
 */
export function CalculatorCard({
  emoji,
  title,
  subtitle,
  tip,
  children,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  tip: string;
  children: ReactNode;
}) {
  return (
    <div className="card-gold relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-28 -end-24 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(212,176,104,0.14), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div className="relative p-6 md:p-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
            style={{
              background:
                "linear-gradient(160deg, rgba(244,222,169,0.18), rgba(168,136,74,0.06))",
              border: "1px solid var(--border-gold)",
            }}
            aria-hidden
          >
            {emoji}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl md:text-2xl font-bold leading-tight">
              {title}
            </h3>
            <p
              className="mt-1 text-sm leading-relaxed"
              style={{ color: "var(--foreground-soft)" }}
            >
              {subtitle}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="mt-7">{children}</div>

        {/* Footer tip */}
        <div
          className="mt-7 flex items-start gap-2.5 rounded-2xl p-3.5 text-xs leading-relaxed"
          style={{
            background: "rgba(212,176,104,0.08)",
            border: "1px solid var(--border-gold)",
            color: "var(--foreground-soft)",
          }}
        >
          <Lightbulb size={15} className="mt-0.5 shrink-0 text-[--accent]" />
          <span>{tip}</span>
        </div>
      </div>
    </div>
  );
}
