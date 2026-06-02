"use client";

import { useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  PhoneFrame,
  DashboardScreen,
  GuestsScreen,
  RsvpScreen,
  SeatingScreen,
  LiveScreen,
} from "./screens";

/**
 * R157 — "ככה זה עובד". The animated, step-by-step journey through the
 * product. A single phone morphs through five screens while the matching
 * step lights up on the rail; auto-advances, pausable by clicking a step,
 * and fully static under prefers-reduced-motion. The phone content is the
 * real product UI (from screens.tsx) so the visitor sees what they get
 * before paying — with almost no marketing copy.
 */

interface Step {
  n: number;
  title: string;
  desc: string;
  nav: number;
  Screen: ComponentType;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: "צרו את האירוע",
    desc: "סוג, תאריך ומקום — ופרופיל האירוע מוכן בפחות מדקה.",
    nav: 0,
    Screen: DashboardScreen,
  },
  {
    n: 2,
    title: "הזמינו את כולם",
    desc: "ייבוא אנשי קשר והזמנה אישית ב-WhatsApp בלחיצה.",
    nav: 1,
    Screen: GuestsScreen,
  },
  {
    n: 3,
    title: "אישורי הגעה — לבד",
    desc: "תזכורות, ושיחה אוטומטית רק למי שלא ענה. הסטטוס מתעדכן אצלכם.",
    nav: 1,
    Screen: RsvpScreen,
  },
  {
    n: 4,
    title: "תקציב והושבה",
    desc: "כל שקל במעקב, סידור שולחנות חכם — ושליחת המספרים לאורחים.",
    nav: 2,
    Screen: SeatingScreen,
  },
  {
    n: 5,
    title: "יום האירוע",
    desc: "מנהל-משנה מקבל דשבורד חי. אתם פשוט רוקדים.",
    nav: 3,
    Screen: LiveScreen,
  },
];

const STEP_MS = 4200;

export function HowItWorks() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  // Auto-advance. Depending on `active` makes each manual click restart
  // the dwell timer. Disabled entirely under reduced-motion.
  useEffect(() => {
    if (reduce) return;
    const id = window.setTimeout(
      () => setActive((a) => (a + 1) % STEPS.length),
      STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [active, reduce]);

  const step = STEPS[active];
  const ActiveScreen = step.Screen;

  return (
    <section className="py-24 md:py-28 relative overflow-hidden">
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[620px] h-[620px] -top-40 left-1/2 -translate-x-1/2 opacity-25"
      />
      <div className="max-w-5xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
            style={{
              background: "color-mix(in srgb, var(--gold-100) 10%, transparent)",
              border: "1px solid var(--border-gold)",
              color: "var(--accent)",
            }}
          >
            5 שלבים · אפס בלגן
          </div>
          <h2
            className="mt-4 font-bold gradient-text"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
          >
            ככה זה עובד
          </h2>
        </div>

        <div className="mt-14 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* Phone — morphs through the screens */}
          <div className="order-1 lg:order-2 flex justify-center">
            <div className="w-[270px]">
              <PhoneFrame glow="strong" activeNav={step.nav}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    <ActiveScreen />
                  </motion.div>
                </AnimatePresence>
              </PhoneFrame>
            </div>
          </div>

          {/* Step rail */}
          <ol className="order-2 lg:order-1 space-y-2.5">
            {STEPS.map((s, i) => {
              const isActive = i === active;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={isActive ? "step" : undefined}
                    className="w-full text-start rounded-2xl p-4 flex items-start gap-3.5 transition-all duration-300"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, rgba(244,222,169,0.10), rgba(168,136,74,0.04))"
                        : "var(--surface-2)",
                      border: `1px solid ${isActive ? "var(--border-gold)" : "var(--border)"}`,
                      boxShadow: isActive
                        ? "0 14px 34px -22px var(--accent-glow)"
                        : "none",
                      opacity: isActive ? 1 : 0.72,
                    }}
                  >
                    <span
                      className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-sm font-extrabold ltr-num transition-all duration-300"
                      style={{
                        background: isActive
                          ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
                          : "var(--input-bg)",
                        color: isActive
                          ? "var(--gold-button-text)"
                          : "var(--foreground-muted)",
                        border: isActive ? "none" : "1px solid var(--border)",
                      }}
                    >
                      {s.n}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block font-bold"
                        style={{
                          color: isActive
                            ? "var(--foreground)"
                            : "var(--foreground-soft)",
                          fontSize: "1.05rem",
                        }}
                      >
                        {s.title}
                      </span>
                      <span
                        className="block mt-1 text-sm leading-relaxed"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        {s.desc}
                      </span>
                      {/* dwell progress — telegraphs the auto-advance */}
                      {isActive && !reduce && (
                        <span
                          className="block mt-2.5 h-0.5 rounded-full overflow-hidden"
                          style={{ background: "var(--border)" }}
                        >
                          <motion.span
                            key={active}
                            className="block h-full rounded-full"
                            style={{
                              background:
                                "linear-gradient(90deg, var(--gold-100), var(--gold-500))",
                              transformOrigin: "right",
                            }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              duration: STEP_MS / 1000,
                              ease: "linear",
                            }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
