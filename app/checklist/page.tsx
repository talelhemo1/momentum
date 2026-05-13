"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { ChecklistSkeleton } from "@/components/skeletons/PageSkeletons";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import { CHECKLIST_PHASE_LABELS, type ChecklistPhase, type ChecklistItem } from "@/lib/types";
import { PHASE_ORDER, buildDefaultChecklist, phaseRangeLabel, defaultDueDate } from "@/lib/checklists";
import {
  CheckCircle2,
  Circle,
  Plus,
  ArrowRight,
  Trash2,
  Sparkles,
  Calendar,
  Clock,
  Hourglass,
  Flag,
  PartyPopper,
} from "lucide-react";

const PHASE_ICONS: Record<ChecklistPhase, React.ReactNode> = {
  early: <Calendar size={18} />,
  mid: <Clock size={18} />,
  late: <Hourglass size={18} />,
  final: <Flag size={18} />,
  "day-of": <PartyPopper size={18} />,
};

export default function ChecklistPage() {
  const router = useRouter();
  const { state, hydrated, update } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [adding, setAdding] = useState<ChecklistPhase | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
    }
    // R14: no-event case is now handled with an explicit EmptyState below
    // instead of a silent router.replace — the user lands here intentionally
    // (clicking a link from elsewhere) and deserves to know why we sent them
    // back rather than vanishing.
  }, [userHydrated, user, router]);

  // Seed the checklist if it's empty (e.g., for users who created an event before checklists existed).
  useEffect(() => {
    if (hydrated && state.event && state.checklist.length === 0) {
      update((s) => ({ ...s, checklist: buildDefaultChecklist(state.event!.type) }));
    }
  }, [hydrated, state.event, state.checklist.length, update]);

  const grouped = useMemo(() => {
    // Use the explicit ChecklistItem[] type instead of `typeof state.checklist`
    // so the lint rule doesn't think we depend on the whole `state` object.
    const map: Record<ChecklistPhase, ChecklistItem[]> = {
      early: [], mid: [], late: [], final: [], "day-of": [],
    };
    for (const item of state.checklist) map[item.phase].push(item);
    return map;
  }, [state.checklist]);

  const totals = useMemo(() => {
    const total = state.checklist.length;
    const done = state.checklist.filter((c) => c.done).length;
    return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  }, [state.checklist]);

  const submitNew = (phase: ChecklistPhase) => {
    if (!newTitle.trim()) return;
    actions.addChecklistItem(newTitle.trim(), phase);
    setNewTitle("");
    setAdding(null);
  };

  if (!hydrated) {
    return (
      <>
        <Header />
        <ChecklistSkeleton />
      </>
    );
  }
  if (!state.event) return <EmptyEventState toolName="הצ'קליסט" />;

  return (
    <>
      <Header />
      <main className="flex-1 pb-24 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-0 opacity-30" />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">צ׳קליסט</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
                המשימות שלך
              </h1>
              <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
                כל מה שצריך לעשות, מסודר לפי שלב — ועם אפשרות להוסיף משלך.
              </p>
            </div>

            {/* Progress */}
            <div className="card-gold p-5 min-w-[200px]">
              <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>הושלמו</div>
              <div className="text-3xl font-extrabold gradient-gold ltr-num mt-1">
                {totals.done} / {totals.total}
              </div>
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--input-bg)" }}>
                <div
                  className="h-full bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9] transition-[width] duration-700"
                  style={{ width: `${totals.percent}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>{totals.percent}%</div>
            </div>
          </div>

          <div className="mt-10 space-y-7">
            {PHASE_ORDER.map((phase) => (
              <PhaseSection
                key={phase}
                phase={phase}
                items={grouped[phase]}
                dateRangeLabel={phaseRangeLabel(state.event?.date, phase)}
                eventDate={state.event?.date}
                isAdding={adding === phase}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                onStartAdd={() => {
                  setAdding(phase);
                  setNewTitle("");
                }}
                onCancelAdd={() => {
                  setAdding(null);
                  setNewTitle("");
                }}
                onSubmitAdd={() => submitNew(phase)}
              />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

function PhaseSection({
  phase,
  items,
  dateRangeLabel,
  eventDate,
  isAdding,
  newTitle,
  setNewTitle,
  onStartAdd,
  onCancelAdd,
  onSubmitAdd,
}: {
  phase: ChecklistPhase;
  items: ReturnType<typeof useAppState>["state"]["checklist"];
  dateRangeLabel?: string;
  eventDate?: string;
  isAdding: boolean;
  newTitle: string;
  setNewTitle: (s: string) => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onSubmitAdd: () => void;
}) {
  const totalDone = items.filter((i) => i.done).length;
  const allDone = items.length > 0 && totalDone === items.length;

  return (
    <section className="card p-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              allDone
                ? "bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black"
                : ""
            }`}
            style={
              !allDone
                ? { background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }
                : undefined
            }
          >
            {PHASE_ICONS[phase]}
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold">{CHECKLIST_PHASE_LABELS[phase]}</h2>
            <div className="text-xs flex items-center gap-2 mt-0.5">
              <span className="ltr-num" style={{ color: "var(--foreground-muted)" }}>{totalDone} / {items.length} הושלמו</span>
              {dateRangeLabel && (
                <>
                  <span style={{ color: "var(--foreground-muted)" }}>·</span>
                  <span className="text-[--accent] font-medium">{dateRangeLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onStartAdd}
          className="text-xs rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 transition"
          style={{ border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
        >
          <Plus size={13} /> הוסף משימה
        </button>
      </header>

      <div className="mt-5 space-y-1.5">
        {items.length === 0 && !isAdding && (
          <div className="text-sm py-4 text-center" style={{ color: "var(--foreground-muted)" }}>
            אין משימות בשלב הזה. הוסף משימה משלך.
          </div>
        )}
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} eventDate={eventDate} phase={phase} />
        ))}

        {isAdding && (
          <div
            className="rounded-2xl flex items-center gap-3 p-3"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}
          >
            <Sparkles size={16} className="text-[--accent] shrink-0" />
            <input
              className="flex-1 bg-transparent border-0 outline-none text-sm"
              placeholder="לדוגמה: בדיקה אחרונה עם הצלם"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) onSubmitAdd();
                if (e.key === "Escape") onCancelAdd();
              }}
              autoFocus
              style={{ color: "var(--foreground)" }}
            />
            <button onClick={onSubmitAdd} disabled={!newTitle.trim()} className="btn-gold text-xs py-1.5 px-4 disabled:opacity-40">
              הוסף
            </button>
            <button onClick={onCancelAdd} className="text-xs px-2" style={{ color: "var(--foreground-muted)" }}>
              ביטול
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ChecklistRow({
  item,
  eventDate,
  phase,
}: {
  item: ReturnType<typeof useAppState>["state"]["checklist"][number];
  eventDate?: string;
  phase: ChecklistPhase;
}) {
  const onToggle = () => actions.toggleChecklistItem(item.id);
  const onRemove = () => actions.removeChecklistItem(item.id);

  // Effective due date — falls back to phase-default if no explicit date set.
  const effectiveDue = item.dueDate ?? (eventDate ? defaultDueDate(eventDate, phase) : undefined);
  const dueLabel = effectiveDue
    ? new Date(effectiveDue).toLocaleDateString("he-IL", { day: "2-digit", month: "short" })
    : null;

  return (
    <div
      className="rounded-2xl flex items-center gap-3 px-3 py-2.5 transition group hover:[border-color:var(--border-strong)]"
      style={{ border: "1px solid var(--border)" }}
    >
      <button
        onClick={onToggle}
        className="shrink-0"
        aria-label={item.done ? "סמן כלא הושלם" : "סמן כהושלם"}
      >
        {item.done ? (
          <CheckCircle2 size={20} className="text-[--accent]" />
        ) : (
          <Circle size={20} style={{ color: "var(--foreground-muted)" }} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm transition ${item.done ? "line-through" : ""}`}
          style={{ color: item.done ? "var(--foreground-muted)" : "var(--foreground)" }}
        >
          {item.title}
        </div>
      </div>
      {dueLabel && (
        <label
          className="relative inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-1 cursor-pointer hover:opacity-80 transition"
          style={{
            background: "var(--input-bg)",
            color: "var(--foreground-soft)",
            border: "1px solid var(--border)",
          }}
          title="לחץ כדי לשנות תאריך יעד"
        >
          <Calendar size={11} />
          <span className="ltr-num">{dueLabel}</span>
          <input
            type="date"
            value={effectiveDue ?? ""}
            onChange={(e) => actions.setChecklistDueDate(item.id, e.target.value || undefined)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      )}
      {item.isCustom && (
        <span className="pill pill-gold text-[10px]">משלך</span>
      )}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition p-1"
        style={{ color: "var(--foreground-muted)" }}
        aria-label="מחק"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
