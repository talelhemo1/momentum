"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import type { AppState } from "@/lib/types";
import { CalculatorCard } from "./CalculatorCard";
import { RealCostPerGuestCard } from "./RealCostPerGuestCard";
import { WhatIfSimulator } from "./WhatIfSimulator";
import { AiPackagesCalculator } from "./AiPackagesCalculator";
import { AlcoholCalculator } from "./AlcoholCalculator";
import { EnvelopeCalculator } from "./EnvelopeCalculator";

const TAB_KEY = "momentum.calc.tab.v1";

type TabId =
  | "real-cost"
  | "what-if"
  | "ai-packages"
  | "alcohol"
  | "envelope";

const TABS: Array<{ id: TabId; label: string; emoji: string }> = [
  { id: "real-cost", label: "כמה אורח עולה", emoji: "💎" },
  { id: "what-if", label: "What If", emoji: "🎚️" },
  { id: "ai-packages", label: "3 הצעות AI", emoji: "🤖" },
  { id: "alcohol", label: "אלכוהול", emoji: "🍷" },
  { id: "envelope", label: "מעטפה", emoji: "💌" },
];

const TIPS: Record<TabId, string> = {
  "real-cost":
    "ידעת? 73% מהזוגות לא חישבו את ה'תקורה' — ₪38 לאורח שבדרך כלל נשכח.",
  "what-if":
    "טיפ: הקטנת רשימה ב-15% חוסכת בממוצע ₪22,000 — מספיק לירח דבש.",
  "ai-packages":
    "ה-AI לומד ממאות אירועים אמיתיים בארץ. אין נוסחה אחת — תקציב זהה יכול לתת 3 חוויות שונות לחלוטין.",
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
          5 כלים שיעזרו לך להחליט.
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

      {/* Pills */}
      <div
        role="tablist"
        aria-label="מחשבונים"
        className="mt-7 flex md:justify-center gap-2 overflow-x-auto pb-2 -mx-1 px-1"
        style={{ scrollSnapType: "x proximity", scrollPaddingInline: "50%" }}
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
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold transition-all duration-300"
              style={{
                scrollSnapAlign: "center",
                minHeight: 44,
                padding: "0 18px",
                ...(on
                  ? {
                      background:
                        "linear-gradient(135deg, #F4DEA9, #A8884A)",
                      color: "#1A1310",
                      boxShadow: "0 4px 16px -4px rgba(212,176,104,0.6)",
                    }
                  : {
                      background: "var(--surface-2)",
                      color: "var(--foreground-soft)",
                      border: "1px solid var(--border)",
                    }),
              }}
            >
              <span aria-hidden>{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Gold divider */}
      <div
        aria-hidden
        className="mt-1 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--border-gold), transparent)",
        }}
      />

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
        {active === "what-if" && (
          <>
            <WhatIfSimulator state={state} />
            <HubTip text={TIPS["what-if"]} />
          </>
        )}
        {active === "ai-packages" && (
          <CalculatorCard
            emoji="🤖"
            title="3 הצעות מחיר AI"
            subtitle="אותו תקציב — 3 חוויות שונות לחלוטין, לפי העדיפויות שלך."
            tip={TIPS["ai-packages"]}
          >
            <AiPackagesCalculator state={state} />
          </CalculatorCard>
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
