"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Check, Lock, ArrowLeft } from "lucide-react";
import type { JourneyStepStatus } from "@/lib/journey";
import { fireConfetti } from "@/lib/confetti";

/**
 * R41 — the vertical journey path. One milestone per stage: a big
 * circle (done ✓ / active gold-pulse / locked 🔒 / upcoming number) on
 * the right, a card on the left. Crossing a milestone fires a small,
 * reduced-motion-aware confetti (no audio — deliberately quiet on the
 * couple's dashboard; avoids surprise sound + extra infra).
 */
export function JourneyPath({
  steps,
  progress,
}: {
  steps: JourneyStepStatus[];
  progress: { done: number; total: number; percent: number };
}) {
  // First unlocked-and-incomplete step = "do this now".
  const activeIdx = useMemo(
    () => steps.findIndex((s) => s.unlocked && !s.complete),
    [steps],
  );

  // Confetti only when `done` actually grows after mount (not on the
  // initial render, not on unrelated re-renders).
  const seeded = useRef(false);
  const prevDone = useRef(progress.done);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      prevDone.current = progress.done;
      return;
    }
    if (progress.done > prevDone.current) {
      prevDone.current = progress.done;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) fireConfetti(900);
    } else {
      prevDone.current = progress.done;
    }
  }, [progress.done]);

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <span className="eyebrow">המסע</span>
          <h2 className="mt-2 text-2xl md:text-3xl font-bold gradient-text">
            מסע התכנון שלכם
          </h2>
        </div>
        <div className="text-end">
          <div
            className="text-3xl md:text-4xl font-extrabold gradient-gold ltr-num"
          >
            {progress.percent}%
          </div>
          <div
            className="text-[11px]"
            style={{ color: "var(--foreground-muted)" }}
          >
            <span className="ltr-num">
              {progress.done}/{progress.total}
            </span>{" "}
            שלבים
          </div>
        </div>
      </div>

      <ol className="relative">
        {steps.map((step, i) => {
          const isActive = i === activeIdx;
          const isLocked = !step.unlocked;
          const isDone = step.complete;
          const prevTitle = i > 0 ? steps[i - 1].def.title : null;
          return (
            <li key={step.def.id} className="flex items-stretch gap-4">
              {/* Circle + connector column */}
              <div className="flex flex-col items-center shrink-0">
                <span
                  className="flex items-center justify-center rounded-full font-extrabold ltr-num"
                  style={{
                    width: 64,
                    height: 64,
                    fontSize: 20,
                    background: isDone
                      ? "rgba(52,211,153,0.15)"
                      : isActive
                        ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
                        : "var(--input-bg)",
                    border: `1px solid ${
                      isDone
                        ? "rgba(52,211,153,0.45)"
                        : isActive
                          ? "var(--border-gold)"
                          : "var(--border)"
                    }`,
                    color: isDone
                      ? "rgb(110,231,183)"
                      : isActive
                        ? "var(--gold-button-text)"
                        : "var(--foreground-muted)",
                    // Static gold glow marks the active step — no
                    // animation, so it's inherently reduced-motion safe
                    // and never hidden (unlike .pulse-gold).
                    boxShadow: isActive
                      ? "0 0 0 6px rgba(212,176,104,0.16)"
                      : "none",
                  }}
                  aria-hidden
                >
                  {isDone ? (
                    <Check size={26} />
                  ) : isLocked ? (
                    <Lock size={22} />
                  ) : (
                    step.order
                  )}
                </span>
                {i < steps.length - 1 && (
                  <span
                    className="w-px flex-1 my-1"
                    style={{
                      minHeight: 28,
                      background: isDone
                        ? "linear-gradient(180deg, rgba(52,211,153,0.5), var(--border-gold))"
                        : "var(--border)",
                    }}
                    aria-hidden
                  />
                )}
              </div>

              {/* Card */}
              <div className="flex-1 pb-6">
                <div
                  className="rounded-2xl p-4 md:p-5"
                  style={{
                    background: isActive
                      ? "rgba(212,176,104,0.08)"
                      : "var(--surface-1, rgba(255,255,255,0.02))",
                    border: `1px solid ${
                      isActive ? "var(--border-gold)" : "var(--border)"
                    }`,
                    opacity: isLocked ? 0.55 : 1,
                  }}
                >
                  <div className="font-bold text-base md:text-lg">
                    {step.def.title}
                  </div>
                  {step.def.description && (
                    <div
                      className="mt-1 text-sm leading-relaxed"
                      style={{ color: "var(--foreground-soft)" }}
                    >
                      {step.def.description}
                    </div>
                  )}
                  <div className="mt-3">
                    {isDone ? (
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "rgb(110,231,183)" }}
                      >
                        ✓ הושלם
                      </span>
                    ) : isActive ? (
                      <Link
                        href={step.def.href}
                        className="btn-gold inline-flex items-center gap-2 text-sm"
                        style={{ minHeight: 44 }}
                      >
                        התקדם
                        <ArrowLeft size={16} />
                      </Link>
                    ) : isLocked ? (
                      <span
                        className="text-xs"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        🔒{" "}
                        {prevTitle
                          ? `ייפתח אחרי "${prevTitle}"`
                          : "ייפתח בהמשך"}
                      </span>
                    ) : (
                      <Link
                        href={step.def.href}
                        className="text-sm font-semibold inline-flex items-center gap-1.5"
                        style={{ color: "var(--accent)" }}
                      >
                        פתח
                        <ArrowLeft size={14} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
