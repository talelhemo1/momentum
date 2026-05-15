"use client";

import { useMemo, useState } from "react";
import { Share2, Lightbulb, Users } from "lucide-react";
import Link from "next/link";
import type { AppState } from "@/lib/types";
import { useCountUp } from "@/lib/useCountUp";
import {
  computeRealCostPerGuest,
  COST_BUCKET_META,
  type CostTier,
} from "@/lib/realCostPerGuest";

const TIER_LABELS: Record<CostTier, string> = {
  low: "חסכוני",
  mid: "ממוצע",
  high: "מפנק",
  luxury: "יוקרה",
};

const shek = (agorot: number) => Math.round(agorot / 100);
const fmt = (agorot: number) => `₪${shek(agorot).toLocaleString("he-IL")}`;

export function RealCostPerGuestCard({ state }: { state: AppState }) {
  const [tier, setTier] = useState<CostTier>("mid");
  const [activeBar, setActiveBar] = useState<string | null>(null);
  // R24 — optional "what-if" guest-count override for modelling
  // (null = use the real/estimated count).
  const [guestsOverride, setGuestsOverride] = useState<number | null>(null);

  const result = useMemo(
    () => computeRealCostPerGuest(state, tier),
    [state, tier],
  );

  // Effective guest count + per-guest, honouring the override.
  const effGuests =
    guestsOverride && guestsOverride > 0 ? guestsOverride : result.guests_count;
  const effPerGuest =
    effGuests > 0 ? Math.round(result.total_event / effGuests) : 0;

  const perGuestShekels = useCountUp(shek(effPerGuest), 1100);

  const hasGuests = (state.guests || []).some((g) => g.status !== "declined");
  const noData = !hasGuests && (state.budget?.length ?? 0) === 0;

  if (noData) {
    return (
      <div className="card-gold p-7 text-center relative overflow-hidden">
        <GoldWash />
        <div className="relative">
          <div className="text-4xl mb-2">💎</div>
          <h3 className="text-xl font-bold">כמה אורח באמת עולה לי?</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            הוסף מוזמנים כדי לראות עלות מדויקת לאורח.
          </p>
          <Link href="/guests" className="btn-gold mt-5 inline-flex items-center gap-2">
            <Users size={16} /> הוסף מוזמן ראשון
          </Link>
        </div>
      </div>
    );
  }

  // Bars sorted longest → shortest.
  const bars = COST_BUCKET_META.map((m) => ({
    ...m,
    value: result.breakdown[m.key],
  }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);
  const maxVal = bars[0]?.value ?? 1;

  const shareText = `הזוי! גיליתי שאורח אחד באירוע שלי עולה ${fmt(
    result.total_per_guest,
  )} — חישבתי ב-Momentum 💎`;
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="card-gold p-6 md:p-7 relative overflow-hidden">
      <GoldWash />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg md:text-xl font-bold">
            💎 כמה אורח באמת עולה לי?
          </h3>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full transition hover:translate-y-[-1px]"
            style={{
              background: "rgba(212,176,104,0.12)",
              border: "1px solid var(--border-gold)",
              color: "var(--accent)",
            }}
          >
            <Share2 size={13} /> שתף
          </a>
        </div>

        {/* Benchmark mode notice + tier picker */}
        {!result.from_real_budget && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              מבוסס על ממוצעים בארץ —
            </span>
            <div className="flex gap-1">
              {(Object.keys(TIER_LABELS) as CostTier[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className="text-[11px] px-2.5 py-1 rounded-full transition"
                  style={
                    tier === t
                      ? { background: "var(--accent)", color: "#1A1310", fontWeight: 700 }
                      : { background: "var(--input-bg)", color: "var(--foreground-soft)", border: "1px solid var(--border)" }
                  }
                >
                  {TIER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hero number */}
        <div className="mt-6 text-center">
          <div
            className="font-extrabold tracking-tight gradient-gold ltr-num leading-none"
            style={{ fontSize: "clamp(48px, 12vw, 76px)" }}
          >
            ₪{perGuestShekels.toLocaleString("he-IL")}
          </div>
          <div className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
            כפול <span className="ltr-num font-semibold">{effGuests}</span> מוזמנים ={" "}
            <span className="ltr-num font-semibold" style={{ color: "var(--accent)" }}>
              {fmt(result.total_event)}
            </span>
          </div>

          {/* R24 — guest-count what-if override */}
          <div className="mt-4 inline-flex items-center gap-2 text-xs">
            <span style={{ color: "var(--foreground-muted)" }}>
              מה אם יהיו
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={guestsOverride ?? ""}
              placeholder={String(result.guests_count)}
              onChange={(e) => {
                const n = Number(e.target.value);
                setGuestsOverride(Number.isFinite(n) && n > 0 ? n : null);
              }}
              className="w-16 bg-transparent text-center outline-none ltr-num rounded py-1"
              style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}
              aria-label="מספר מוזמנים לבדיקה"
            />
            <span style={{ color: "var(--foreground-muted)" }}>מוזמנים?</span>
            {guestsOverride && (
              <button
                onClick={() => setGuestsOverride(null)}
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                איפוס
              </button>
            )}
          </div>
        </div>

        {/* Horizontal bars */}
        <div className="mt-7 space-y-2.5">
          {bars.map((b) => {
            const widthPct = Math.max(6, Math.round((b.value / maxVal) * 100));
            const ofGuest =
              result.total_per_guest > 0
                ? Math.round((b.value / result.total_event) * 100)
                : 0;
            const open = activeBar === b.key;
            return (
              <div key={b.key} className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setActiveBar(b.key)}
                  onMouseLeave={() => setActiveBar((c) => (c === b.key ? null : c))}
                  onClick={() => setActiveBar((c) => (c === b.key ? null : b.key))}
                  className="w-full text-start group"
                  aria-label={`${b.label}: ${fmt(b.value)}`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: "var(--foreground-soft)" }}>{b.label}</span>
                    <span className="ltr-num" style={{ color: "var(--foreground-muted)" }}>
                      {fmt(b.value)}
                    </span>
                  </div>
                  <div
                    className="h-3 rounded-full overflow-hidden"
                    style={{ background: "var(--input-bg)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, ${b.color}, ${b.color}cc)`,
                      }}
                    />
                  </div>
                </button>
                {open && (
                  <div
                    className="absolute z-10 mt-1.5 px-3 py-2 rounded-xl text-[11px] shadow-lg"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--foreground)",
                    }}
                  >
                    {fmt(b.value)} ל{b.label} = {ofGuest}% מסך העלות
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Insights */}
        <div className="mt-6 space-y-2">
          {result.insights.map((ins, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs rounded-xl p-2.5"
              style={{ background: "var(--input-bg)", color: "var(--foreground-soft)" }}
            >
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-[--accent]" />
              <span>{ins}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Subtle gold radial wash behind the card content. */
function GoldWash() {
  return (
    <div
      aria-hidden
      className="absolute -top-24 -end-24 w-72 h-72 rounded-full pointer-events-none"
      style={{
        background:
          "radial-gradient(circle, rgba(212,176,104,0.16), transparent 70%)",
        filter: "blur(36px)",
      }}
    />
  );
}
