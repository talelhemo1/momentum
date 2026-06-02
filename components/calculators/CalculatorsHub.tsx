"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import type { AppState } from "@/lib/types";
import { CalculatorCard } from "./CalculatorCard";
import { RealCostPerGuestCard } from "./RealCostPerGuestCard";
import { AlcoholCalculator } from "./AlcoholCalculator";
import { EnvelopeCalculator } from "./EnvelopeCalculator";

const TAB_KEY = "momentum.calc.tab.v1";

// R123 — removed "מעבדת התקציב" (what-if) + "3 הצעות AI" (ai-packages)
// per host request. The hub keeps the three calculators that have a
// deterministic, no-AI answer: real cost per guest, alcohol planner,
// envelope target. The corresponding component files
// (WhatIfSimulator.tsx, AiPackagesCalculator.tsx) were deleted with
// this rev — see git history if you need to bring them back.
type TabId = "real-cost" | "alcohol" | "envelope";

const TABS: Array<{ id: TabId; label: string; emoji: string; desc: string }> = [
  { id: "real-cost", label: "כמה אורח עולה", emoji: "💎", desc: "העלות האמיתית לאורח — כולל תקורה" },
  { id: "alcohol", label: "אלכוהול", emoji: "🍷", desc: "כמה יין, וודקה ובירה להזמין" },
  { id: "envelope", label: "מעטפה", emoji: "💌", desc: "כמה מעטפה מכסה את העלות" },
];

const TIPS: Record<TabId, string> = {
  "real-cost":
    "ידעת? 73% מהזוגות לא חישבו את ה'תקורה' — ₪38 לאורח שבדרך כלל נשכח.",
  alcohol:
    "באירוע דתי? אנשים שותים 35% פחות — אל תכפיל כמות מאירועים אחרים.",
  envelope:
    "70% מהמעטפות באירוע ישראלי = משפחה. תכנן את ההוצאות לפי זה.",
};

function isTab(v: string | null): v is TabId {
  return !!v && TABS.some((t) => t.id === v);
}

export function CalculatorsHub({ state }: { state: AppState }) {
  const [active, setActive] = useState<TabId>("real-cost");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Restore from URL hash → localStorage → default. One-shot on mount.
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (isTab(fromHash)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(fromHash);
      return;
    }
    try {
      const saved = window.localStorage.getItem(TAB_KEY);
      if (isTab(saved)) setActive(saved);
    } catch {
      /* private mode — default stays */
    }
  }, []);

  const selectTab = (id: TabId) => {
    setActive(id);
    try {
      window.localStorage.setItem(TAB_KEY, id);
      history.replaceState(null, "", `#${id}`);
    } catch {
      /* ignore */
    }
    // Center the chosen pill on mobile.
    tabRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  // Arrow-key roving between pills (a11y).
  const onKeyNav = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    // RTL: ArrowRight = previous, ArrowLeft = next.
    const delta = e.key === "ArrowLeft" ? 1 : -1;
    const next = (idx + delta + TABS.length) % TABS.length;
    const id = TABS[next].id;
    selectTab(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <section dir="rtl">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="text-4xl">🧮</div>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold gradient-gold">
          מחשבונים חכמים
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          3 כלים שיעזרו לך להחליט.
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

      {/* R163 — selector CARDS (was small pills). Each tool now shows a
          one-line description so it's obvious at a glance what it does,
          and the active one is highlighted in gold. Clearer + prettier,
          same a11y (role=tab + arrow-key roving + scroll-into-view). */}
      <div
        role="tablist"
        aria-label="מחשבונים"
        className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {TABS.map((t, idx) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              role="tab"
              id={`calc-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`calc-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => selectTab(t.id)}
              onKeyDown={(e) => onKeyNav(e, idx)}
              className="text-start rounded-2xl p-3.5 flex items-center gap-3 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                border: on ? "1px solid var(--border-gold)" : "1px solid var(--border)",
                background: on
                  ? "linear-gradient(135deg, rgba(244,222,169,0.14), rgba(168,136,74,0.05))"
                  : "var(--surface-2)",
                boxShadow: on ? "0 12px 32px -18px var(--accent-glow)" : "none",
              }}
            >
              <span
                className="shrink-0 w-11 h-11 rounded-xl inline-flex items-center justify-center text-2xl"
                style={{
                  background: on
                    ? "linear-gradient(160deg, rgba(244,222,169,0.22), rgba(168,136,74,0.08))"
                    : "var(--input-bg)",
                  border: `1px solid ${on ? "var(--border-gold)" : "var(--border)"}`,
                }}
                aria-hidden
              >
                {t.emoji}
              </span>
              <span className="min-w-0">
                <span
                  className="block font-bold text-sm leading-tight"
                  style={{ color: on ? "var(--accent)" : "var(--foreground)" }}
                >
                  {t.label}
                </span>
                <span
                  className="block text-[11px] mt-0.5 leading-snug"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  {t.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel — fades in on every tab switch */}
      <div
        key={active}
        role="tabpanel"
        id={`calc-panel-${active}`}
        aria-labelledby={`calc-tab-${active}`}
        className="mt-6 scale-in"
        style={{ minHeight: 600 }}
      >
        {active === "real-cost" && (
          <>
            <RealCostPerGuestCard state={state} />
            <HubTip text={TIPS["real-cost"]} />
          </>
        )}
        {active === "alcohol" && (
          <CalculatorCard
            emoji="🍷"
            title="מחשבון אלכוהול"
            subtitle="כמה יין, וודקה, בירה ושתייה קלה צריך — לפי פרופיל ומשך."
            tip={TIPS.alcohol}
          >
            <AlcoholCalculator />
          </CalculatorCard>
        )}
        {active === "envelope" && (
          <CalculatorCard
            emoji="💌"
            title="מחשבון מעטפה"
            subtitle="כמה צריך להכניס במעטפות כדי לכסות את עלות האירוע."
            tip={TIPS.envelope}
          >
            <EnvelopeCalculator state={state} />
          </CalculatorCard>
        )}
      </div>
    </section>
  );
}

/** Matches the CalculatorCard footer tip so every tab ends consistently. */
function HubTip({ text }: { text: string }) {
  return (
    <div
      className="mt-4 flex items-start gap-2.5 rounded-2xl p-3.5 text-xs leading-relaxed"
      style={{
        background: "rgba(212,176,104,0.08)",
        border: "1px solid var(--border-gold)",
        color: "var(--foreground-soft)",
      }}
    >
      <Lightbulb size={15} className="mt-0.5 shrink-0 text-[--accent]" />
      <span>{text}</span>
    </div>
  );
}
