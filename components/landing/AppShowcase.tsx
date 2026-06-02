"use client";

import { useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  PhoneFrame,
  DashboardScreen,
  GuestsScreen,
  RsvpScreen,
  BudgetScreen,
  SeatingScreen,
  VendorsScreen,
  BalanceScreen,
  LiveScreen,
} from "./screens";

/**
 * R158 — the cinematic screen reel. A single focal phone auto-cycles
 * through every page in the product "like a film", flanked by two
 * blurred depth-phones (prev / next) for a cover-flow stage. A
 * film-strip timeline below telegraphs the dwell and lets the visitor
 * jump to any screen; auto-play pauses on hover / focus and is fully
 * static under prefers-reduced-motion. Almost no copy — the screens
 * carry it.
 */

const SCREENS: Array<{ label: string; nav: number; Screen: ComponentType }> = [
  { label: "דשבורד", nav: 0, Screen: DashboardScreen },
  { label: "ניהול מוזמנים", nav: 1, Screen: GuestsScreen },
  { label: "אישורי הגעה", nav: 1, Screen: RsvpScreen },
  { label: "תקציב חי", nav: 2, Screen: BudgetScreen },
  { label: "סידור הושבה", nav: 2, Screen: SeatingScreen },
  { label: "ספקים מאומתים", nav: 2, Screen: VendorsScreen },
  { label: "מאזן מעטפות", nav: 2, Screen: BalanceScreen },
  { label: "יום האירוע — Live", nav: 3, Screen: LiveScreen },
];

const N = SCREENS.length;
const DWELL = 3000;
const EASE = [0.22, 1, 0.36, 1] as const;
const STAGE_H = 392;

const mod = (i: number) => ((i % N) + N) % N;

export function AppShowcase() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance — the "film". Restarts on manual jump; halts while the
  // visitor hovers / focuses the stage, and is disabled under
  // reduced-motion.
  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setTimeout(() => setActive((a) => mod(a + 1)), DWELL);
    return () => window.clearTimeout(id);
  }, [active, paused, reduce]);

  const Active = SCREENS[active].Screen;
  const Prev = SCREENS[mod(active - 1)].Screen;
  const Next = SCREENS[mod(active + 1)].Screen;

  return (
    <section id="showcase" className="py-24 md:py-32 relative overflow-hidden">
      {/* dotted-gold backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(212,176,104,0.10) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 75% 60% at 50% 40%, #000 30%, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[680px] h-[680px] top-24 left-1/2 -translate-x-1/2 opacity-25"
      />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center">
          <h2
            className="font-bold gradient-text"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
          >
            הצצה לכל פינה באפליקציה
          </h2>
          <p className="mt-3 text-lg" style={{ color: "var(--foreground-soft)" }}>
            כל מסך אמיתי — רץ לבד, כמו סרט.
          </p>
        </div>

        {/* animated label + counter */}
        <div className="mt-10 h-9 flex items-center justify-center gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={active}
              className="text-lg font-bold gradient-gold"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {SCREENS[active].label}
            </motion.span>
          </AnimatePresence>
          <span
            className="text-xs ltr-num tabular-nums px-2 py-0.5 rounded-full"
            style={{
              color: "var(--foreground-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {active + 1} / {N}
          </span>
        </div>

        {/* ── Stage ───────────────────────────────────────────────── */}
        <div
          className="mt-6 relative flex items-center justify-center"
          style={{ minHeight: STAGE_H + 96 }}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          role="group"
          aria-roledescription="קרוסלת מסכים"
          aria-label="תצוגת מסכי האפליקציה"
        >
          {/* depth phone — leading side (next) */}
          <DepthPhone side="lead" index={active} reduce={!!reduce}>
            <Next />
          </DepthPhone>
          {/* depth phone — trailing side (prev) */}
          <DepthPhone side="trail" index={active} reduce={!!reduce}>
            <Prev />
          </DepthPhone>

          {/* focal phone — content cross-slides like a reel */}
          <div className="relative z-10 w-[270px] sm:w-[284px]">
            <PhoneFrame glow="strong" activeNav={SCREENS[active].nav}>
              <div className="relative" style={{ height: STAGE_H }}>
                <AnimatePresence initial={false}>
                  <motion.div
                    key={active}
                    className="absolute inset-0"
                    initial={reduce ? false : { opacity: 0, x: 56 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: -56 }}
                    transition={{ duration: 0.55, ease: EASE }}
                  >
                    <Active />
                  </motion.div>
                </AnimatePresence>
              </div>
            </PhoneFrame>
          </div>
        </div>

        {/* ── Film-strip timeline ─────────────────────────────────── */}
        <div className="mt-10 flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap max-w-2xl mx-auto">
          {SCREENS.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`עבור ל${s.label}`}
                aria-current={isActive ? "true" : undefined}
                className="group relative h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: isActive ? 44 : 22,
                  background: isActive ? "var(--border)" : "var(--border)",
                  opacity: isActive ? 1 : 0.5,
                }}
              >
                {isActive && (
                  <motion.span
                    key={`${active}-${paused}`}
                    className="absolute inset-0 rounded-full origin-right"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--gold-100), var(--gold-500))",
                    }}
                    initial={{ scaleX: reduce || paused ? 1 : 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: reduce || paused ? 0 : DWELL / 1000,
                      ease: "linear",
                    }}
                  />
                )}
                {!isActive && (
                  <span
                    className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      background:
                        "color-mix(in srgb, var(--accent) 40%, transparent)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* slim value strip */}
        <div
          className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm px-5"
          style={{ color: "var(--foreground-muted)" }}
        >
          <span>✓ הכל מסתנכרן בזמן אמת</span>
          <span>✓ עובד מהדפדפן — בלי הורדה</span>
          <span>✓ בעברית מלאה, מימין לשמאל</span>
        </div>
      </div>
    </section>
  );
}

/**
 * Decorative depth phone behind the focal one. Pushed to a side,
 * scaled down, blurred and dimmed for a cover-flow stage. Its content
 * crossfades as the reel advances. Hidden below lg (mobile shows only
 * the focal phone). aria-hidden — purely atmospheric.
 */
function DepthPhone({
  side,
  index,
  reduce,
  children,
}: {
  side: "lead" | "trail";
  index: number;
  reduce: boolean;
  children: React.ReactNode;
}) {
  // RTL stage: "lead" sits on the left, "trail" on the right.
  const x = side === "lead" ? "-58%" : "58%";
  return (
    <div
      aria-hidden
      className="hidden lg:block absolute top-1/2 z-0 w-[230px] pointer-events-none"
      style={{
        left: "50%",
        transform: `translate(-50%, -50%) translateX(${x}) scale(0.82)`,
        filter: "blur(2px)",
        opacity: 0.45,
        WebkitMaskImage:
          side === "lead"
            ? "linear-gradient(90deg, transparent, #000 70%)"
            : "linear-gradient(270deg, transparent, #000 70%)",
        maskImage:
          side === "lead"
            ? "linear-gradient(90deg, transparent, #000 70%)"
            : "linear-gradient(270deg, transparent, #000 70%)",
      }}
    >
      <PhoneFrame width={230} showNav={false}>
        <div className="relative" style={{ height: STAGE_H }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              className="absolute inset-0"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </PhoneFrame>
    </div>
  );
}
