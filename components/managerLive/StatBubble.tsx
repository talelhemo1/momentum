"use client";

import { useEffect, useRef, useState } from "react";
import { useCountUp } from "@/lib/useCountUp";

/**
 * R26 — luxury stat "bubble" for the manager dashboard.
 *
 * 120px gold-gradient disc, count-up number, optional progress ring.
 * Emits a one-shot gold glow whenever the target value increases (a
 * guest checked in) — feedback without noise.
 */
export function StatBubble({
  value,
  label,
  suffix = "",
  ring,
}: {
  value: number;
  label: string;
  /** e.g. "%" rendered after the number. */
  suffix?: string;
  /** 0–100 — when set, draws a progress ring around the bubble. */
  ring?: number;
}) {
  const display = useCountUp(value, 1200);
  const prev = useRef(value);
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    if (value > prev.current) {
      setGlow(true);
      const t = window.setTimeout(() => setGlow(false), 1100);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  const size = 120;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, ring ?? 0));

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative rounded-full flex items-center justify-center ${glow ? "r26-bubble-glow" : ""}`}
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle at 35% 30%, rgba(244,222,169,0.22), rgba(168,136,74,0.06))",
          border: "1px solid var(--border-gold)",
        }}
      >
        {ring != null && (
          <svg
            width={size}
            height={size}
            className="absolute inset-0 -rotate-90"
            aria-hidden
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--input-bg)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="url(#r26-ring-grad)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ - (pct / 100) * circ}
              style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
            />
            <defs>
              <linearGradient id="r26-ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F4DEA9" />
                <stop offset="100%" stopColor="#A8884A" />
              </linearGradient>
            </defs>
          </svg>
        )}
        <span
          className="font-extrabold gradient-gold ltr-num leading-none"
          style={{ fontSize: 44 }}
        >
          {display.toLocaleString("he-IL")}
          {suffix}
        </span>
      </div>
      <span className="text-sm font-medium" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </span>
    </div>
  );
}
