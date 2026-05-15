"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Lightbulb, Wine, Mail, ArrowLeft } from "lucide-react";
import type { AppState } from "@/lib/types";
import { calcEnvelopeFromState } from "@/lib/envelope";
import { RealCostPerGuestCard } from "./RealCostPerGuestCard";
import { WhatIfSimulator } from "./WhatIfSimulator";

/** Short, punchy fact under each calculator (R21 §I). */
const TIPS = {
  realCost:
    "ידעת? 73% מהזוגות לא חישבו את ה'תקורה' — ₪38 לאורח שבדרך כלל נשכח.",
  whatIf:
    "טיפ: הקטנת רשימה ב-15% חוסכת בממוצע ₪22,000 — מספיק לירח דבש.",
  alcohol:
    "באירוע דתי? אנשים שותים 35% פחות — אל תכפיל כמות מאירועים אחרים.",
  envelope:
    "70% מהמעטפות באירוע ישראלי = משפחה. תכנן את ההוצאות לפי זה.",
} as const;

function TipLine({ text }: { text: string }) {
  return (
    <div
      className="flex items-start gap-2 text-xs rounded-xl p-2.5 mt-3"
      style={{ background: "var(--input-bg)", color: "var(--foreground-soft)" }}
    >
      <Lightbulb size={14} className="mt-0.5 shrink-0 text-[--accent]" />
      <span>{text}</span>
    </div>
  );
}

export function CalculatorsHub({ state }: { state: AppState }) {
  const envelope = useMemo(
    () => (state.event ? calcEnvelopeFromState(state) : null),
    [state],
  );

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="text-4xl">🧮</div>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold gradient-gold">
          מחשבונים חכמים
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          כלים שיעזרו לך להחליט בקלות, בלי כאב ראש.
        </p>
        <div
          className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(212,176,104,0.10)",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
          }}
        >
          <Lightbulb size={12} />
          כל המחשבונים מתעדכנים אוטומטית כשמוסיפים מוזמנים או הוצאות
        </div>
      </div>

      {/* 4 cards — 1 col mobile, 2×2 desktop */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <div>
          <RealCostPerGuestCard state={state} />
          <TipLine text={TIPS.realCost} />
        </div>

        <div>
          <WhatIfSimulator state={state} />
          <TipLine text={TIPS.whatIf} />
        </div>

        {/* Alcohol — full calculator lives at /alcohol */}
        <div>
          <Link
            href="/alcohol"
            className="card-gold card-hover p-6 md:p-7 relative overflow-hidden block group"
          >
            <div
              aria-hidden
              className="absolute -top-20 -end-20 w-60 h-60 rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(212,176,104,0.14), transparent 70%)",
                filter: "blur(34px)",
              }}
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <h3 className="text-lg md:text-xl font-bold">
                  🍷 מחשבון אלכוהול
                </h3>
                <span
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center"
                  style={{ background: "rgba(212,176,104,0.15)", color: "var(--accent)" }}
                >
                  <Wine size={18} />
                </span>
              </div>
              <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
                כמה יין, וודקה, בירה ושתייה קלה צריך — לפי פרופיל השתייה,
                סגנון הבר ומשך האירוע.
              </p>
              <span
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold transition group-hover:gap-2.5"
                style={{ color: "var(--accent)" }}
              >
                פתח את המחשבון <ArrowLeft size={15} />
              </span>
            </div>
          </Link>
          <TipLine text={TIPS.alcohol} />
        </div>

        {/* Envelope — compact summary from live state */}
        <div>
          <div className="card-gold p-6 md:p-7 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -bottom-20 -start-20 w-60 h-60 rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(212,176,104,0.14), transparent 70%)",
                filter: "blur(34px)",
              }}
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <h3 className="text-lg md:text-xl font-bold">
                  💌 מחשבון מעטפה
                </h3>
                <span
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center"
                  style={{ background: "rgba(212,176,104,0.15)", color: "var(--accent)" }}
                >
                  <Mail size={18} />
                </span>
              </div>

              {envelope && envelope.verdict !== "no-data" ? (
                <>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                    <EnvStat
                      label="נקודת איזון"
                      value={`₪${envelope.breakEven.toLocaleString("he-IL")}`}
                    />
                    <EnvStat
                      label="מומלץ"
                      value={`₪${envelope.withReserve.toLocaleString("he-IL")}`}
                      highlight
                    />
                    <EnvStat
                      label="ממוצע מקובל"
                      value={`₪${envelope.typical.toLocaleString("he-IL")}`}
                    />
                  </div>
                  <p
                    className="mt-4 text-xs"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    מבוסס על{" "}
                    <span className="ltr-num font-semibold">
                      {envelope.guestCount}
                    </span>{" "}
                    {envelope.countSource === "confirmed"
                      ? "מאשרים"
                      : "מוזמנים (הערכה)"}{" "}
                    · {envelope.verdictLabel}
                  </p>
                </>
              ) : (
                <p
                  className="mt-5 text-sm"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  הוסף תקציב ומוזמנים כדי לחשב כמה צריך להכניס במעטפות
                  כדי לכסות את עלות האירוע.
                </p>
              )}
            </div>
          </div>
          <TipLine text={TIPS.envelope} />
        </div>
      </div>
    </section>
  );
}

function EnvStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-3"
      style={
        highlight
          ? {
              background:
                "linear-gradient(160deg, rgba(212,176,104,0.14), transparent)",
              border: "1px solid var(--border-gold)",
            }
          : { background: "var(--input-bg)", border: "1px solid var(--border)" }
      }
    >
      <div className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
      <div
        className={`mt-1 text-base font-bold ltr-num ${highlight ? "gradient-gold" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
