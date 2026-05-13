"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { TimelineSkeleton } from "@/components/skeletons/PageSkeletons";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import { useNow, daysUntil } from "@/lib/useNow";
import { CHECKLIST_PHASE_LABELS, type ChecklistPhase, type ChecklistItem } from "@/lib/types";
import { ArrowRight, CheckCircle2, Circle, Calendar, Sparkles } from "lucide-react";

/**
 * Timeline / Gantt-style view.
 * Each phase is a horizontal track. Tasks are pills positioned by phase.
 * The big "today" indicator slides along the timeline based on event date.
 */
export default function TimelinePage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    // R14: no-event handled by EmptyState below.
  }, [userHydrated, user, router]);

  const grouped = useMemo(() => {
    // Use the explicit ChecklistItem[] type instead of `typeof state.checklist`
    // so the lint rule doesn't think we depend on the whole `state` object.
    const map: Record<ChecklistPhase, ChecklistItem[]> = {
      early: [], mid: [], late: [], final: [], "day-of": [],
    };
    for (const t of state.checklist) map[t.phase].push(t);
    return map;
  }, [state.checklist]);

  const phases: ChecklistPhase[] = ["early", "mid", "late", "final", "day-of"];

  // Compute today's position on the timeline. `useNow` returns null on first
  // render so SSR and client agree, then updates after mount.
  const now = useNow();
  const daysToEventOrNull = state.event ? daysUntil(state.event.date, now) : null;
  const daysToEvent = daysToEventOrNull ?? 0;

  // Map phases to "days before event" buckets.
  const phaseBuckets: Record<ChecklistPhase, { startDays: number; endDays: number }> = {
    early: { startDays: 9999, endDays: 180 },   // 6+ months
    mid: { startDays: 180, endDays: 90 },       // 3-6 months
    late: { startDays: 90, endDays: 30 },       // 1-3 months
    final: { startDays: 30, endDays: 7 },       // 1 month - 1 week
    "day-of": { startDays: 7, endDays: 0 },     // last week
  };

  // Which phase is "current"? Falls back to "early" before client mount so we
  // don't flash a wrong "אתה כאן" badge during SSR.
  const currentPhase: ChecklistPhase | null = daysToEventOrNull == null
    ? null
    : phases.find((p) => {
        const b = phaseBuckets[p];
        return daysToEvent <= b.startDays && daysToEvent > b.endDays;
      }) ?? (daysToEvent <= 0 ? "day-of" : "early");

  if (!hydrated) {
    return (
      <>
        <Header />
        <TimelineSkeleton />
      </>
    );
  }
  if (!state.event) return <EmptyEventState toolName="ציר הזמן" />;

  const totalDone = state.checklist.filter((t) => t.done).length;
  const totalAll = state.checklist.length;

  return (
    <>
      <Header />
      <main className="flex-1 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-0 opacity-25" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">ציר זמן</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">המפה לאירוע</h1>
              <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
                כל המשימות שלך על ציר זמן אחד. הסמן הזהוב מראה איפה אתה נמצא היום.
              </p>
            </div>
            <div className="card-gold p-4 flex items-center gap-3">
              <Calendar size={18} className="text-[--accent]" />
              <div>
                <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>נותרו</div>
                <div className="text-2xl font-extrabold ltr-num gradient-gold leading-none" suppressHydrationWarning>
                  {daysToEventOrNull ?? "—"}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>ימים</div>
              </div>
              <div className="w-px h-12" style={{ background: "var(--border)" }} />
              <div>
                <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>הושלמו</div>
                <div className="text-2xl font-extrabold ltr-num leading-none">{totalDone}<span style={{ color: "var(--foreground-muted)" }}>/{totalAll}</span></div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-5 md:p-7 mt-8 relative overflow-hidden">
            <div className="space-y-6">
              {phases.map((phase) => {
                const tasks = grouped[phase];
                const done = tasks.filter((t) => t.done).length;
                const isCurrent = phase === currentPhase;
                // Before client mount, currentPhase is null — treat all phases as "not past"
                // to avoid an SSR/CSR mismatch flash.
                const currentIdx = currentPhase ? phases.indexOf(currentPhase) : -1;
                const isPast = currentIdx >= 0 && phases.indexOf(phase) < currentIdx;
                return (
                  <div key={phase} className="relative">
                    {/* Phase header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-bold shrink-0 ${
                          isPast ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30" : ""
                        } ${isCurrent ? "bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black pulse-gold" : ""}`}
                        style={
                          !isPast && !isCurrent
                            ? { background: "var(--surface-2)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }
                            : undefined
                        }
                      >
                        {isPast ? "✓" : phases.indexOf(phase) + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold">{CHECKLIST_PHASE_LABELS[phase]}</h3>
                          {isCurrent && (
                            <span className="pill pill-gold text-[10px]">
                              <Sparkles size={9} /> אתה כאן
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5 ltr-num" style={{ color: "var(--foreground-muted)" }}>
                          {done} / {tasks.length} הושלמו
                        </div>
                      </div>
                    </div>

                    {/* Tasks track */}
                    <div className="ms-12 space-y-1.5">
                      {tasks.length === 0 ? (
                        <div className="text-xs italic py-2" style={{ color: "var(--foreground-muted)" }}>
                          אין משימות בשלב זה
                        </div>
                      ) : (
                        tasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => actions.toggleChecklistItem(task.id)}
                            className="w-full flex items-center gap-3 rounded-xl p-2.5 text-start text-sm transition hover:bg-[var(--secondary-button-bg)]"
                            style={{ border: "1px solid var(--border)" }}
                          >
                            {task.done ? (
                              <CheckCircle2 size={16} className="text-[--accent] shrink-0" />
                            ) : (
                              <Circle size={16} style={{ color: "var(--foreground-muted)" }} className="shrink-0" />
                            )}
                            <span className={`flex-1 ${task.done ? "line-through" : ""}`} style={{ color: task.done ? "var(--foreground-muted)" : "var(--foreground)" }}>
                              {task.title}
                            </span>
                            {task.isCustom && <span className="pill pill-gold text-[9px]">משלך</span>}
                          </button>
                        ))
                      )}
                    </div>

                    {/* Connecting line to next phase */}
                    {phases.indexOf(phase) < phases.length - 1 && (
                      <div className="absolute right-[18px] top-12 bottom-0 w-px" style={{ background: isPast ? "rgba(52,211,153,0.3)" : "var(--border)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 text-center text-xs" style={{ color: "var(--foreground-muted)" }}>
            לחץ על משימה כדי לסמן אותה כהושלמה. הצ׳קליסט המלא ב<Link href="/checklist" className="text-[--accent] hover:underline">/checklist</Link>.
          </div>
        </div>
      </main>
    </>
  );
}
