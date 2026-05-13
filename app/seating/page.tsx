"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { PrintButton } from "@/components/PrintButton";
import { SeatingSkeleton } from "@/components/skeletons/PageSkeletons";
import { Avatar } from "@/components/Avatar";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import type { Guest, SeatingTable } from "@/lib/types";
import { smartArrangement, type TableExplanation } from "@/lib/seatingAlgorithm";
import {
  Plus,
  Users,
  ArrowRight,
  X,
  CheckCircle2,
  Sparkles,
  Trash2,
  Pencil,
  UserPlus,
  Eye,
  Layers,
  Crown,
  RefreshCw,
} from "lucide-react";

/** dataTransfer mime — keeps drag payload distinct from raw text drops. */
const DRAG_MIME = "application/x-momentum-guest";

/**
 * framer-motion overrides `onDragStart` with its own gesture-event signature
 * (`PointerEvent | MouseEvent | TouchEvent`). We use the browser's native
 * HTML5 drag-and-drop, which at runtime fires with `React.DragEvent` and a
 * real `dataTransfer`. This helper writes the guest id and silently no-ops
 * if the runtime event somehow isn't a DragEvent (which it always is for
 * the `draggable={true}` path we use).
 */
function setGuestDragPayload(guestId: string) {
  return (e: unknown) => {
    const ev = e as { dataTransfer?: DataTransfer };
    if (ev.dataTransfer) ev.dataTransfer.setData(DRAG_MIME, guestId);
  };
}

export default function SeatingPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [showAddTable, setShowAddTable] = useState(false);
  const [editingTable, setEditingTable] = useState<SeatingTable | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [flatView, setFlatView] = useState(false);
  // Newest-table id (cleared 600ms later) — the entrance keyframe runs on
  // ONLY that table, instead of replaying for every table on every render.
  // This cuts ~700ms of GPU work × N tables every time the list re-renders.
  const [newlyAddedTableId, setNewlyAddedTableId] = useState<string | null>(null);
  const newAddedTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (newAddedTimerRef.current !== null) {
        window.clearTimeout(newAddedTimerRef.current);
      }
    };
  }, []);
  const markNewlyAdded = useCallback((id: string) => {
    setNewlyAddedTableId(id);
    if (newAddedTimerRef.current !== null) {
      window.clearTimeout(newAddedTimerRef.current);
    }
    newAddedTimerRef.current = window.setTimeout(() => {
      setNewlyAddedTableId(null);
      newAddedTimerRef.current = null;
    }, 600);
  }, []);

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    // R14: no-event handled by EmptyState below.
  }, [userHydrated, user, router]);

  const eligibleGuests = useMemo(
    () => state.guests.filter((g) => g.status !== "declined"),
    [state.guests],
  );

  const unassigned = useMemo(
    () => eligibleGuests.filter((g) => !state.seatAssignments[g.id]),
    [eligibleGuests, state.seatAssignments],
  );

  const tablesWithGuests = useMemo(() => {
    return state.tables.map((t) => {
      const guests = eligibleGuests.filter((g) => state.seatAssignments[g.id] === t.id);
      const heads = guests.reduce((sum, g) => sum + (g.attendingCount ?? 1), 0);
      return { table: t, guests, heads };
    });
  }, [state.tables, eligibleGuests, state.seatAssignments]);

  const totals = useMemo(() => {
    const assigned = Object.entries(state.seatAssignments).reduce((sum, [gid]) => {
      const g = eligibleGuests.find((x) => x.id === gid);
      return g ? sum + (g.attendingCount ?? 1) : sum;
    }, 0);
    const total = eligibleGuests.reduce((sum, g) => sum + (g.attendingCount ?? 1), 0);
    return { assigned, total };
  }, [eligibleGuests, state.seatAssignments]);

  // ─── Auto-arrange (smart) ───
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState<{
    seed: number;
    assignments: Record<string, string>;
    explanations: TableExplanation[];
    unseated: Guest[];
  } | null>(null);
  // Tables currently in the "just received a guest" pulse. Using a Set lets
  // multiple tables flash concurrently (the magnetize stagger touches several
  // at once); a single `recentlyReceivedTable` id would clobber earlier flashes.
  const [flashingTables, setFlashingTables] = useState<Set<string>>(() => new Set());
  // True for the duration of a smart-arrangement scan animation. Each Table3D
  // renders an overlay sweep when this is on — the user sees the whole floor
  // "thinking" instead of waiting on a generic spinner.
  const [showingScan, setShowingScan] = useState(false);
  // Track the in-flight smart-arrangement timeout so unmount / re-trigger
  // can cancel it. Without this, closing the modal mid-animation still
  // resolved the timer and set state on a torn-down tree (React warning,
  // and in extreme cases a render of stale `thinking=true`).
  const smartTimeoutRef = useRef<number | null>(null);
  // Per-table flash-clear timers. Keyed so each table independently exits
  // its receive animation 600ms after it started, even when stagger triggers
  // overlap.
  const flashTimersRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const flashTimers = flashTimersRef.current;
    return () => {
      if (smartTimeoutRef.current !== null) {
        window.clearTimeout(smartTimeoutRef.current);
        smartTimeoutRef.current = null;
      }
      flashTimers.forEach((id) => window.clearTimeout(id));
      flashTimers.clear();
    };
  }, []);

  const flashTableReceive = useCallback((tableId: string) => {
    // Cancel an existing flash on the same table before starting a new one,
    // otherwise the CSS animation re-applies without restarting (no visible pulse).
    const existing = flashTimersRef.current.get(tableId);
    if (existing !== undefined) window.clearTimeout(existing);
    setFlashingTables((prev) => {
      if (prev.has(tableId)) {
        // Force re-mount of the class by toggling off→on next tick.
        const next = new Set(prev);
        next.delete(tableId);
        // Re-add on next tick so React commits the removal first.
        window.setTimeout(() => {
          setFlashingTables((p) => {
            const n = new Set(p);
            n.add(tableId);
            return n;
          });
        }, 16);
        return next;
      }
      const next = new Set(prev);
      next.add(tableId);
      return next;
    });
    const id = window.setTimeout(() => {
      flashTimersRef.current.delete(tableId);
      setFlashingTables((prev) => {
        if (!prev.has(tableId)) return prev;
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    }, 600);
    flashTimersRef.current.set(tableId, id);
  }, []);

  const runSmartArrangement = (seed?: number) => {
    if (state.tables.length === 0) return;
    // Cancel any timer still pending from a previous click — otherwise
    // double-clicking "סידור חכם" would queue two setProposal calls.
    if (smartTimeoutRef.current !== null) {
      window.clearTimeout(smartTimeoutRef.current);
    }
    // Close any open proposal so the user can see the scan animation behind it
    // when re-rolling.
    setProposal(null);
    setThinking(true);
    setShowingScan(true);
    const usedSeed = seed ?? Date.now();
    // The algorithm runs in <50ms; we let the visible scan-sweep animation
    // (1.4s in CSS) play out before opening the proposal modal so the user
    // perceives the work happening on the floor rather than in a spinner.
    const result = smartArrangement({
      guests: eligibleGuests,
      tables: state.tables,
      seed: usedSeed,
    });
    smartTimeoutRef.current = window.setTimeout(() => {
      smartTimeoutRef.current = null;
      setProposal({ seed: usedSeed, ...result });
      setShowingScan(false);
      setThinking(false);
    }, 1400);
  };

  const acceptProposal = async () => {
    if (!proposal) return;
    // Snapshot before we close — setProposal(null) drops the live binding.
    const snapshot = proposal;
    // Clear all current assignments instantly so the magnetize-stagger below
    // animates each guest *into* an empty floor.
    Object.keys(state.seatAssignments).forEach((gid) => actions.assignSeat(gid, null));
    setProposal(null);

    // Group assignments by destination table — flashing per-table (not
    // per-guest) keeps the visual readable even on big lists. Order is the
    // key insertion order, which mirrors the explanations array.
    const byTable = new Map<string, string[]>();
    for (const [gid, tid] of Object.entries(snapshot.assignments)) {
      const arr = byTable.get(tid) ?? [];
      arr.push(gid);
      byTable.set(tid, arr);
    }

    // 120ms cascade between tables → reads as guests "magnetizing" to seats
    // around the floor. For 5 tables that's 600ms total — short enough to
    // feel like one motion, long enough to be perceptible.
    let i = 0;
    for (const [tid, gids] of byTable) {
      window.setTimeout(() => {
        for (const gid of gids) actions.assignSeat(gid, tid);
        flashTableReceive(tid);
      }, i * 120);
      i++;
    }
  };

  // ─── Drag & drop: move a guest between tables / to unassigned ───
  // Reject empty IDs (drag from another origin / wrong MIME) and reject
  // unknown IDs (a stale drag payload from a deleted guest). Without the
  // existence check, getData() on a malformed drop would write a phantom
  // assignment to the store keyed on garbage.
  // Wrapped in useCallback + ref-based reads so the identity stays stable.
  // Without this, every render produced new function instances and broke the
  // React.memo on <Table3D> below — every keystroke rerendered all 50 cards.
  // The ref is written from a layout effect so React 19's strict-ref rule
  // doesn't flag it. We read latest state in the handler, not in render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const handleDropOnTable = useCallback(
    (tableId: string, guestId: string) => {
      if (!guestId) return;
      const s = stateRef.current;
      if (!s.guests.find((g) => g.id === guestId)) return;
      const wasHere = s.seatAssignments[guestId] === tableId;
      actions.assignSeat(guestId, tableId);
      if (!wasHere) flashTableReceive(tableId);
    },
    [flashTableReceive],
  );
  const handleDropOnUnassigned = useCallback((guestId: string) => {
    if (!guestId) return;
    const s = stateRef.current;
    if (!s.guests.find((g) => g.id === guestId)) return;
    actions.assignSeat(guestId, null);
  }, []);
  const handleActivateTable = useCallback((id: string) => {
    setActiveTableId(id);
  }, []);

  const activeTable = state.tables.find((t) => t.id === activeTableId);
  const activeRow = activeTable
    ? tablesWithGuests.find((r) => r.table.id === activeTableId)
    : null;

  if (!hydrated) {
    return (
      <>
        <Header />
        <SeatingSkeleton />
      </>
    );
  }
  if (!state.event) return <EmptyEventState toolName="סידורי ההושבה" />;

  return (
    <>
      <Header />
      <main className="flex-1 pb-32 relative overflow-hidden">
        <div aria-hidden className="glow-orb glow-orb-gold w-[700px] h-[700px] -top-40 right-0 opacity-25" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">סידורי הושבה</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">רחבת האירועים</h1>
              <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
                לחץ על שולחן כדי להוסיף או להזיז אורחים. כל כיסא זהוב = אורח שיושב.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={() => setFlatView((v) => !v)}
                className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
                aria-label="החלף תצוגה"
              >
                {flatView ? <Layers size={14} /> : <Eye size={14} />} {flatView ? "תצוגה תלת-מימדית" : "תצוגה שטוחה"}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={() => runSmartArrangement()}
                disabled={state.tables.length === 0 || eligibleGuests.length === 0 || thinking}
                className="btn-gold text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-40"
                aria-label="סדר אוטומטית"
              >
                {thinking ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {thinking ? "חושב..." : "✨ סדר אוטומטית"}
              </motion.button>
              <PrintButton label="ייצא ל-PDF" />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={() => setShowAddTable(true)}
                className="btn-gold text-sm py-2 px-4 inline-flex items-center gap-2"
              >
                <Plus size={14} /> שולחן חדש
              </motion.button>
            </div>
          </div>

          {/* Top stats */}
          <div className="mt-6 card-gold p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black flex items-center justify-center">
                <Users size={18} />
              </div>
              <div>
                <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>אורחים מסודרים</div>
                <div className="text-xl font-bold ltr-num">
                  <span className="gradient-gold">{totals.assigned}</span>
                  <span style={{ color: "var(--foreground-muted)" }}> / {totals.total}</span>
                </div>
              </div>
            </div>
            <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>
              <span className="ltr-num font-semibold">{state.tables.length}</span> שולחנות · <span className="ltr-num font-semibold">{unassigned.length}</span> אורחים בהמתנה
            </div>
          </div>

          {state.guests.length === 0 && (
            <div className="card p-10 mt-8 text-center" style={{ color: "var(--foreground-muted)" }}>
              <p>עדיין אין מוזמנים. <Link href="/guests" className="text-[--accent] hover:underline">הוסף מוזמנים</Link> כדי להתחיל לסדר.</p>
            </div>
          )}

          {state.guests.length > 0 && state.tables.length === 0 && (
            <div className="card p-12 mt-8 text-center">
              <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4" style={{ background: "var(--surface-2)", border: "1px dashed var(--border-strong)", color: "var(--accent)" }}>
                <Plus size={28} />
              </div>
              <h3 className="text-xl font-bold">תוסיף את השולחן הראשון</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
                כל שולחן הוא עיגול עם כיסאות. כיסאות זהובים = אורחים שיושבים.
              </p>
              <button onClick={() => setShowAddTable(true)} className="btn-gold mt-5 inline-flex items-center gap-2">
                <Plus size={16} /> שולחן חדש
              </button>
            </div>
          )}

          {state.guests.length > 0 && state.tables.length > 0 && (
            <div className="mt-10 grid lg:grid-cols-[1fr_320px] gap-6">
              {/* 3D Floor.
                  data-many-tables flips on past 10 tables: the floor-float
                  loop is heavy on GPU when N tables × 6s × 60fps adds up,
                  so we drop it for dense events. Below the threshold the
                  motion gives the floor its "alive" feel. */}
              <div className="floor-3d" data-many-tables={state.tables.length > 10 ? "true" : "false"}>
                <div className={`floor-3d-inner ${flatView ? "flat" : ""} ${activeTableId ? "has-focused" : ""} floor-grid p-8 md:p-12`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-16 md:gap-y-24">
                    {tablesWithGuests.map(({ table, heads }, i) => (
                      <Table3D
                        key={table.id}
                        table={table}
                        heads={heads}
                        // Legacy tables created before the `number` field
                        // existed get a stable fallback based on their order
                        // in the list — same value across re-renders.
                        displayNumber={table.number ?? i + 1}
                        active={activeTableId === table.id}
                        receiving={flashingTables.has(table.id)}
                        scanning={showingScan}
                        // Run the entrance keyframe ONLY on the table that
                        // was just added — the rest mount instantly. The
                        // float keyframe is also gated below the threshold.
                        isNewlyAdded={newlyAddedTableId === table.id}
                        floatEnabled={state.tables.length <= 10}
                        onActivate={handleActivateTable}
                        onDropGuest={handleDropOnTable}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Side panel: unassigned + active table editor */}
              <aside className="space-y-4">
                <UnassignedPanel guests={unassigned} onDropGuest={handleDropOnUnassigned} />
                {activeTable && activeRow && (
                  <TableEditorPanel
                    table={activeTable}
                    guests={activeRow.guests}
                    heads={activeRow.heads}
                    unassigned={unassigned}
                    onClose={() => setActiveTableId(null)}
                    onEdit={() => setEditingTable(activeTable)}
                  />
                )}
                {!activeTable && (
                  <div className="card p-5 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
                    💡 לחץ על שולחן כדי להוסיף או להזיז אורחים
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>

        {showAddTable && (
          <TableModal
            onClose={() => setShowAddTable(false)}
            onCreated={markNewlyAdded}
          />
        )}
        {editingTable && <TableModal table={editingTable} onClose={() => setEditingTable(null)} />}
        {/* AnimatePresence lets ThinkingOverlay run its exit transition (fade
            + slide down) before unmounting. Without it the badge would just
            disappear the moment thinking flips back to false. */}
        <AnimatePresence>{thinking && <ThinkingOverlay key="thinking" />}</AnimatePresence>
        {proposal && (
          <ArrangementProposalModal
            proposal={proposal}
            tables={state.tables}
            guests={state.guests}
            onAccept={acceptProposal}
            onReroll={() => runSmartArrangement()}
            onClose={() => setProposal(null)}
          />
        )}
      </main>
    </>
  );
}

// ─────────────────────────────────── Thinking overlay ───────────────────────────────────

// Rotating sub-header lines for the smart-arrangement overlay. The user
// sees a different line every 200ms which makes a 400-700ms wait feel
// productive ("חושב..." → "מחפש זוגות..." → "מאזן שולחנות..." → "מסיים...").
const THINKING_STAGES = [
  "מחפש זוגות שצריכים לשבת יחד...",
  "מאזן שולחנות לפי גודל...",
  "בודק התנגשויות בין קבוצות...",
  "מסיים סידור...",
] as const;

function ThinkingOverlay() {
  const [stageIdx, setStageIdx] = useState(0);
  useEffect(() => {
    // 350ms between stages × 4 stages ≈ matches the 1400ms scan duration so
    // the user reads "מסיים סידור..." right as the modal opens. Stops on the
    // last stage so a slow machine doesn't wrap mid-thought.
    const id = window.setInterval(() => {
      setStageIdx((i) => (i < THINKING_STAGES.length - 1 ? i + 1 : i));
    }, 350);
    return () => window.clearInterval(id);
  }, []);
  return (
    // Non-blocking floating badge — the real "thinking indicator" is now the
    // arrangement-scan sweep playing on each table behind us. Pointer-events
    // none on the wrapper so the user could keep clicking around if we ever
    // wanted to make this non-modal; the inner card re-enables for hover.
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.94 }}
      transition={{ type: "spring", damping: 22, stiffness: 280 }}
      className="fixed bottom-6 right-6 z-50 max-w-xs pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className="card-gold p-4 pointer-events-auto"
        style={{ background: "var(--surface-1)", boxShadow: "0 16px 40px -12px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-center gap-3">
          <div className="inline-flex w-10 h-10 rounded-full items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-gold)" }}>
            <Sparkles size={18} className="text-[--accent] animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold gradient-gold">מסדר את האורחים...</div>
            <div className="text-xs mt-0.5 truncate" style={{ color: "var(--foreground-soft)" }}>
              {THINKING_STAGES[stageIdx]}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[--accent] animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[--accent] animate-bounce" style={{ animationDelay: "120ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[--accent] animate-bounce" style={{ animationDelay: "240ms" }} />
        </div>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────── Proposal modal ─────────────────────────────────

function ArrangementProposalModal({
  proposal,
  tables,
  guests,
  onAccept,
  onReroll,
  onClose,
}: {
  proposal: { assignments: Record<string, string>; explanations: TableExplanation[]; unseated: Guest[] };
  tables: SeatingTable[];
  guests: Guest[];
  onAccept: () => void;
  onReroll: () => void;
  onClose: () => void;
}) {
  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);

  // Esc-to-close. Matches the convention used elsewhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Build a quick "guests at table" view from the proposed assignments.
  const guestsByTable = useMemo(() => {
    const map = new Map<string, Guest[]>();
    Object.entries(proposal.assignments).forEach(([gid, tid]) => {
      const g = guestById.get(gid);
      if (!g) return;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid)!.push(g);
    });
    return map;
  }, [proposal.assignments, guestById]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="arrangement-title"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl scale-in"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-6 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="pill pill-gold">
                <Sparkles size={11} /> סידור חכם
              </span>
              <h2 id="arrangement-title" className="mt-2 text-2xl font-extrabold tracking-tight gradient-gold">
                ההצעה שלי לסידור
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
                לפי קבוצות, גילאים, ובקשות להושיב יחד.
              </p>
            </div>
            <button onClick={onClose} aria-label="סגור" className="rounded-full w-9 h-9 flex items-center justify-center hover:bg-[var(--secondary-button-bg)]">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto p-6 space-y-3">
          {proposal.explanations.map((exp) => {
            const table = tableById.get(exp.tableId);
            if (!table) return null;
            const seatedGuests = guestsByTable.get(exp.tableId) ?? [];
            return (
              <div
                key={exp.tableId}
                className="rounded-2xl p-4"
                style={{
                  background: exp.isMainTable ? "rgba(212,176,104,0.08)" : "var(--input-bg)",
                  border: `1px solid ${exp.isMainTable ? "var(--border-gold)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {exp.isMainTable && <Crown size={16} className="text-[--accent]" aria-hidden />}
                    <h3 className="font-bold">
                      {table.name}
                      {exp.isMainTable && <span className="text-xs font-normal ms-2" style={{ color: "var(--accent)" }}>(שולחן ראשי)</span>}
                    </h3>
                  </div>
                  <span className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
                    {exp.capacityUsed} / {exp.capacityTotal} מקומות
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
                  {exp.summary}
                </p>
                {seatedGuests.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {seatedGuests.map((g) => (
                      <span
                        key={g.id}
                        className="text-[11px] rounded-full px-2 py-0.5"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {proposal.unseated.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.3)" }}
            >
              <h3 className="font-bold text-sm" style={{ color: "rgb(252,165,165)" }}>
                ⚠️ לא הצלחתי להושיב {proposal.unseated.length} אורחים
              </h3>
              <p className="mt-1 text-xs" style={{ color: "var(--foreground-soft)" }}>
                התנגשויות, חוסר מקום, או דרישות &quot;חייבים יחד&quot; שלא מסתדרות. אפשר להוסיף שולחן או לערוך ידנית.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {proposal.unseated.map((g) => (
                  <span key={g.id} className="text-[11px] rounded-full px-2 py-0.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    {g.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="p-6 border-t flex flex-col sm:flex-row gap-3" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onAccept}
            className="flex-1 btn-gold py-3 inline-flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={16} />
            אהבתי — החל סידור
          </button>
          <button
            onClick={onReroll}
            className="flex-1 btn-secondary py-3 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} />
            סדר מחדש
          </button>
          <button
            onClick={onClose}
            className="rounded-2xl py-3 px-5 text-sm font-medium"
            style={{ border: "1px solid var(--border-strong)", color: "var(--foreground-soft)" }}
          >
            ערוך ידנית
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A 3D-looking table with chairs around its perimeter. Filled chairs = seated guests.
 *
 *  Wrapped in React.memo with a custom comparator below — on a 50-table floor
 *  even a single drag event would otherwise rerender all 50 cards because the
 *  parent's `state` reference changes. The comparator skips rerenders when
 *  the inputs that affect what THIS card paints are unchanged.
 */
interface Table3DProps {
  table: SeatingTable;
  heads: number;
  /** Big number rendered inside the circle. Falls back to a per-render index
   *  for legacy tables that pre-date the `number` field. */
  displayNumber: number;
  active: boolean;
  /** Plays the celebrate-receive pulse when a guest just landed here. */
  receiving: boolean;
  /** Smart-arrangement scan sweep currently overlaying this table. */
  scanning: boolean;
  /** True when this is the freshly-added table — drives the entrance keyframe. */
  isNewlyAdded: boolean;
  /** Master switch for the idle float. The parent flips it off past 10
   *  tables so a 50-table floor doesn't run 50 infinite GPU loops. */
  floatEnabled: boolean;
  /** Stable handlers from the parent. Both take the table id so a single
   *  function instance can serve every card without breaking React.memo. */
  onActivate: (id: string) => void;
  onDropGuest: (id: string, guestId: string) => void;
}

function Table3DInner({
  table,
  heads,
  displayNumber,
  active,
  receiving,
  scanning,
  isNewlyAdded,
  floatEnabled,
  onActivate,
  onDropGuest,
}: Table3DProps) {
  const [dragOver, setDragOver] = useState(false);
  const fullness = Math.min(1, heads / table.capacity);
  const overCapacity = heads > table.capacity;
  const stateClass = overCapacity ? "over" : fullness >= 1 ? "full" : "";

  // Chair positions in a circle around the table.
  const chairs = Array.from({ length: table.capacity }).map((_, i) => {
    const angle = (i * 360) / table.capacity - 90; // start from top
    const rad = (angle * Math.PI) / 180;
    // radius = 58% of width (table is square aspect-ratio)
    const x = Math.cos(rad) * 62;
    const y = Math.sin(rad) * 62;
    return { x, y, filled: i < heads };
  });

  return (
    <button
      onClick={() => onActivate(table.id)}
      className={[
        "table-3d",
        active ? "active" : "",
        stateClass,
        // Float keyframe is opt-in via class. Past 10 tables the parent
        // skips the class entirely so the floor is static (CSS still nukes
        // it via [data-many-tables="true"] as a safety net).
        floatEnabled ? "table-floating" : "",
        // Existing CSS for drag-over plus the new gold-glow lift. They don't
        // conflict — drag-over only changes border, .table-drop-active adds
        // outer shadow + scale.
        dragOver ? "drag-over table-drop-active" : "",
        receiving ? "table-receive" : "",
      ].filter(Boolean).join(" ")}
      // The entrance keyframe runs ONLY on the freshly-added table. Every
      // other card mounts static so a 50-table page render doesn't fire
      // 50 × 700ms of compositor work.
      style={
        isNewlyAdded
          ? ({
              animation:
                "table-enter 500ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
            } as CSSProperties)
          : undefined
      }
      aria-label={`שולחן ${displayNumber} — ${table.name}. אפשר לגרור אורח לכאן`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Don't drop the hover state when the cursor passes over a child node
        // (chairs, label) — only when it actually leaves the button bounds.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        // Bail before reading getData if the foreign drag didn't carry our
        // mime — a stray text drop from another tab returns "" here, which
        // we'd otherwise hand to onDropGuest as a guest id.
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        const gid = e.dataTransfer.getData(DRAG_MIME);
        if (gid) onDropGuest(table.id, gid);
      }}
    >
      {/* Name label OUTSIDE the circle so chairs / glow / scan overlays can
          never obscure it. Sits above the surface as a high-contrast pill
          that's readable at any zoom. */}
      <div
        className="table-name-label"
        title={table.name}
      >
        {table.name}
      </div>

      <div className="surface relative">
        {/* Scan overlay sits above the surface gradient but below chairs/labels
            (z-index:0 in CSS; chairs are positioned with their own stacking).
            AnimatePresence isn't needed — the CSS animation auto-plays once and
            the element unmounts when scanning flips back to false. */}
        {scanning && <span aria-hidden className="arrangement-scan" />}
        {chairs.map((c, i) => (
          <span
            key={i}
            className={`chair ${c.filled ? "filled" : ""}`}
            style={{
              left: `calc(50% - 6px)`,
              top: `calc(50% - 6px)`,
              transform: `translate(${c.x}%, ${c.y}%)`,
            }}
          />
        ))}
        <div
          className="text-[10px] uppercase tracking-[0.2em] font-semibold"
          style={{ color: "var(--foreground-muted)" }}
        >
          שולחן
        </div>
        <div className="table-number-display ltr-num">{displayNumber}</div>
        <div
          className="text-xs ltr-num mt-0.5 font-semibold"
          style={{
            color: overCapacity
              ? "rgb(252 165 165)"
              : fullness >= 1
                ? "var(--accent)"
                : "var(--foreground-soft)",
          }}
        >
          {heads} / {table.capacity}
        </div>
      </div>
    </button>
  );
}

/**
 * Hand-rolled comparator: re-render this card only when an input that
 * affects its paint actually changed. Everything else (parent state churn,
 * sibling table updates, drag interactions on other tables) skips it.
 *
 * `onActivate` / `onDropGuest` are stable from the parent (useCallback +
 * stateRef trick), so identity comparison is enough.
 */
const Table3D = memo(Table3DInner, (prev, next) => {
  return (
    prev.table.id === next.table.id &&
    prev.table.name === next.table.name &&
    prev.table.capacity === next.table.capacity &&
    prev.table.number === next.table.number &&
    prev.heads === next.heads &&
    prev.displayNumber === next.displayNumber &&
    prev.active === next.active &&
    prev.receiving === next.receiving &&
    prev.scanning === next.scanning &&
    prev.isNewlyAdded === next.isNewlyAdded &&
    prev.floatEnabled === next.floatEnabled &&
    prev.onActivate === next.onActivate &&
    prev.onDropGuest === next.onDropGuest
  );
});

function UnassignedPanel({ guests, onDropGuest }: { guests: Guest[]; onDropGuest: (guestId: string) => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className="card p-5 transition"
      style={dragOver ? { borderColor: "var(--accent)", background: "rgba(212,176,104,0.06)" } : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        const gid = e.dataTransfer.getData(DRAG_MIME);
        if (gid) onDropGuest(gid);
      }}
      aria-label="אזור אורחים ללא שולחן — אפשר לגרור לכאן כדי להוציא משולחן"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">ללא שולחן</h2>
        <span className="pill pill-muted">{guests.length}</span>
      </div>
      {guests.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="text-sm py-4 text-center"
          style={{ color: "var(--foreground-muted)" }}
        >
          🎉 כל האורחים מסודרים!
        </motion.div>
      ) : (
        // Cascading reveal: when the page first hydrates (or when the list
        // shrinks via assignments), each remaining guest pops in with a 40ms
        // delay between siblings. AnimatePresence + layout makes departures
        // smooth instead of a hard yank when an item leaves.
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
          }}
          className="space-y-1.5 max-h-[240px] overflow-y-auto"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {guests.map((g) => (
              <motion.div
                key={g.id}
                layout
                draggable
                onDragStart={setGuestDragPayload(g.id)}
                variants={{
                  hidden: { opacity: 0, y: 8, scale: 0.96 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
                transition={{ type: "spring", damping: 22, stiffness: 280 }}
                className="rounded-xl p-2.5 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                aria-label={`גרור את ${g.name} לשולחן`}
              >
                <Avatar name={g.name} id={g.id} size={28} />
                <span className="flex-1 truncate">{g.name}</span>
                {(g.attendingCount ?? 1) > 1 && <span className="ltr-num text-[--accent] text-xs font-bold">+{(g.attendingCount ?? 1) - 1}</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
      <p className="mt-3 text-xs text-center" style={{ color: "var(--foreground-muted)" }}>
        💡 גרור אורח לשולחן או חזרה לכאן
      </p>
    </div>
  );
}

function TableEditorPanel({
  table,
  guests,
  heads,
  unassigned,
  onClose,
  onEdit,
}: {
  table: SeatingTable;
  guests: Guest[];
  heads: number;
  unassigned: Guest[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const [newName, setNewName] = useState("");
  const overCapacity = heads > table.capacity;

  const handleAddGuest = (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const guest = actions.addGuest({ name, phone: "", attendingCount: 1 });
    actions.assignSeat(guest.id, table.id);
    setNewName("");
  };

  const moveExisting = (guestId: string) => {
    actions.assignSeat(guestId, table.id);
  };

  return (
    <div className="card p-5 fade-up sticky top-20">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Big gold numeric chip — same identifier the host shouts across
              the room. Mirrors the inside-the-circle number on the floor. */}
          <div
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{
              width: 44,
              height: 44,
              background:
                "linear-gradient(135deg, rgba(244,222,169,0.20), rgba(168,136,74,0.10))",
              border: "1px solid var(--border-gold)",
            }}
          >
            <span className="text-xl font-extrabold gradient-gold ltr-num">
              {table.number ?? "?"}
            </span>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-lg truncate">{table.name}</div>
            <div
              className="text-xs ltr-num"
              style={{
                color: overCapacity ? "rgb(252 165 165)" : "var(--foreground-muted)",
              }}
            >
              {heads} / {table.capacity} מקומות
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} aria-label="ערוך שולחן" className="p-1.5 rounded-full hover:bg-[var(--secondary-button-bg)]">
            <Pencil size={14} style={{ color: "var(--foreground-muted)" }} />
          </button>
          <button onClick={() => actions.removeTable(table.id)} aria-label="מחק שולחן" className="p-1.5 rounded-full hover:bg-[var(--secondary-button-bg)]">
            <Trash2 size={14} style={{ color: "var(--foreground-muted)" }} />
          </button>
          <button onClick={onClose} aria-label="סגור" className="p-1.5 rounded-full hover:bg-[var(--secondary-button-bg)]">
            <X size={14} style={{ color: "var(--foreground-muted)" }} />
          </button>
        </div>
      </div>

      {/* Seated guests — each chip bounces in when assigned, fades+shrinks when
          removed. The `layout` prop reflows the rest of the list smoothly so
          the remaining chips slide up instead of jump-cutting.
          Past 15 guests the animation budget breaks (15 × spring layout per
          render) so we switch to a plain list — same visuals on rest, just
          no entrance / exit bounce. */}
      {guests.length > 0 ? (
        guests.length < 15 ? (
          <motion.div layout className="space-y-1.5 mb-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {guests.map((g) => (
                <motion.div
                  key={g.id}
                  layout
                  initial={{ scale: 0.5, opacity: 0, y: -10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", damping: 18, stiffness: 320 }}
                  draggable
                  onDragStart={setGuestDragPayload(g.id)}
                  className="rounded-xl p-2 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                  aria-label={`גרור את ${g.name} כדי להעביר לשולחן אחר`}
                >
                  <CheckCircle2 size={14} className="text-[--accent] shrink-0" />
                  <span className="flex-1 truncate">{g.name}</span>
                  {(g.attendingCount ?? 1) > 1 && <span className="ltr-num text-[--accent] text-xs font-bold">+{(g.attendingCount ?? 1) - 1}</span>}
                  <button onClick={() => actions.assignSeat(g.id, null)} className="hover:text-red-400 p-1" style={{ color: "var(--foreground-muted)" }} aria-label="הסר משולחן">
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="space-y-1.5 mb-3">
            {guests.map((g) => (
              <div
                key={g.id}
                draggable
                onDragStart={setGuestDragPayload(g.id)}
                className="rounded-xl p-2 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                aria-label={`גרור את ${g.name} כדי להעביר לשולחן אחר`}
              >
                <CheckCircle2 size={14} className="text-[--accent] shrink-0" />
                <span className="flex-1 truncate">{g.name}</span>
                {(g.attendingCount ?? 1) > 1 && <span className="ltr-num text-[--accent] text-xs font-bold">+{(g.attendingCount ?? 1) - 1}</span>}
                <button onClick={() => actions.assignSeat(g.id, null)} className="hover:text-red-400 p-1" style={{ color: "var(--foreground-muted)" }} aria-label="הסר משולחן">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-center py-3 rounded-xl mb-3"
          style={{ background: "var(--input-bg)", color: "var(--foreground-muted)" }}
        >
          השולחן ריק. הוסף אורחים למטה.
        </motion.div>
      )}

      {/* Add new guest by name */}
      <form
        onSubmit={handleAddGuest}
        className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
        style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}
      >
        <UserPlus size={14} className="text-[--accent] shrink-0" />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="הוסף אורח לשולחן..."
          className="flex-1 bg-transparent border-0 outline-none text-sm"
          style={{ color: "var(--foreground)" }}
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="text-xs font-semibold disabled:opacity-40"
          style={{ color: "var(--accent)" }}
        >
          הוסף
        </button>
      </form>

      {/* Move existing unassigned guest here */}
      {unassigned.length > 0 && (
        <div>
          <div className="text-xs mb-1.5" style={{ color: "var(--foreground-muted)" }}>או הוסף מוזמן קיים:</div>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {unassigned.map((g) => (
              <button
                key={g.id}
                onClick={() => moveExisting(g.id)}
                className="w-full rounded-xl p-2 text-start flex items-center gap-2 text-sm transition hover:bg-[var(--secondary-button-bg)]"
                style={{ border: "1px dashed var(--border)", color: "var(--foreground-soft)" }}
              >
                <Plus size={12} className="text-[--accent]" />
                <span className="flex-1 truncate">{g.name}</span>
                {(g.attendingCount ?? 1) > 1 && <span className="ltr-num text-xs">+{(g.attendingCount ?? 1) - 1}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TableModal({
  table,
  onClose,
  onCreated,
}: {
  table?: SeatingTable;
  onClose: () => void;
  /** Called once with the new table's id after a successful create. The
   *  parent uses it to flag the table for the one-shot entrance keyframe. */
  onCreated?: (id: string) => void;
}) {
  const { state } = useAppState();
  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 10));
  const [namesText, setNamesText] = useState("");
  // R16: free-form circle. When set + matching guests have the same circle,
  // the smart-arrangement pins them here.
  const [circle, setCircle] = useState(table?.circle ?? "");
  // Phase: table number. New tables suggest max(existing)+1; edits preserve
  // the current number unless the host changes it. Empty input = "auto".
  const suggestedNumber = useMemo(
    () =>
      table?.number ??
      state.tables.reduce((max, t) => Math.max(max, t.number ?? 0), 0) + 1,
    [state.tables, table?.number],
  );
  const [numberInput, setNumberInput] = useState(String(suggestedNumber));
  const parsedNumber = Number.parseInt(numberInput, 10);
  const numberValid =
    numberInput.trim() === "" ||
    (!Number.isNaN(parsedNumber) && parsedNumber > 0);
  const duplicateNumber = useMemo(() => {
    if (!numberValid || numberInput.trim() === "") return false;
    return state.tables.some(
      (t) => t.id !== table?.id && t.number === parsedNumber,
    );
  }, [numberValid, numberInput, parsedNumber, state.tables, table?.id]);
  const isValid =
    name.trim().length > 0 &&
    Number(capacity) > 0 &&
    numberValid &&
    !duplicateNumber;

  // Suggest existing circles from guests + other tables so the user reuses
  // the exact label instead of accidentally splitting "חברים מהצבא" /
  // "חברים מצבא" into two non-matching tokens.
  const circleSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const g of state.guests) {
      if (g.circle?.trim()) set.add(g.circle.trim());
    }
    for (const t of state.tables) {
      if (t.id !== table?.id && t.circle?.trim()) set.add(t.circle.trim());
    }
    return Array.from(set).sort();
  }, [state.guests, state.tables, table?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!isValid) return;
    const trimmedCircle = circle.trim();
    // Empty number input = auto (let the store pick max+1).
    const numberForSave =
      numberInput.trim() === "" ? undefined : parsedNumber;
    if (table) {
      actions.updateTable(table.id, {
        name: name.trim(),
        capacity: Number(capacity),
        number: numberForSave ?? table.number,
        // Pass undefined (not "") so clearing the field actually removes the
        // tag rather than storing an empty string that no guest will match.
        circle: trimmedCircle || undefined,
      });
    } else {
      const newTable = actions.addTable(name.trim(), Number(capacity), numberForSave);
      if (trimmedCircle) {
        actions.updateTable(newTable.id, { circle: trimmedCircle });
      }
      onCreated?.(newTable.id);
      const names = namesText
        .split(/[\n,]+/)
        .map((n) => n.trim())
        .filter(Boolean);
      for (const guestName of names) {
        // Auto-tag guests created via this shortcut with the same circle,
        // so a user typing 8 names into a "חברים מהצבא" table immediately
        // gets the auto-arrangement payoff without re-tagging each guest.
        const guest = actions.addGuest({
          name: guestName,
          phone: "",
          attendingCount: 1,
          ...(trimmedCircle ? { circle: trimmedCircle } : {}),
        });
        actions.assignSeat(guest.id, newTable.id);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card glass-strong p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Users size={20} className="text-[--accent]" />
          <h3 className="text-xl font-bold">{table ? "ערוך שולחן" : "שולחן חדש"}</h3>
        </div>
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
                מספר
              </label>
              <input
                className="input text-center text-xl font-extrabold ltr-num"
                inputMode="numeric"
                type="number"
                min={1}
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value.replace(/[^\d]/g, ""))}
                aria-label="מספר השולחן"
                aria-invalid={duplicateNumber || !numberValid}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>שם השולחן</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: משפחת כלה, חברי כיתה..."
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && isValid && !table) save(); }}
              />
            </div>
          </div>
          {duplicateNumber && (
            <div
              className="text-xs rounded-xl p-2"
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "rgb(252,165,165)",
              }}
            >
              כבר קיים שולחן עם המספר הזה. בחר מספר אחר.
            </div>
          )}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>מקומות (כמה אנשים יושבים)</label>
            <input className="input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>

          {/* R16 — circle tag. If this field matches the same field on a
              guest, the smart-arrangement pins them here. <datalist> reuses
              existing labels from guests + other tables. */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              חוג חברתי{" "}
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                (אופציונלי — אורחים עם אותו חוג יוקצו לכאן בהושבה האוטומטית)
              </span>
            </label>
            <input
              className="input"
              list="table-circle-suggestions"
              value={circle}
              onChange={(e) => setCircle(e.target.value)}
              placeholder="חברים מהצבא / משפחה רחוקה / חברי כיתה י׳"
              maxLength={60}
              aria-label="חוג חברתי של השולחן"
            />
            {circleSuggestions.length > 0 && (
              <datalist id="table-circle-suggestions">
                {circleSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </div>

          {!table && (
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
                שמות האורחים (לא חובה — הפרד בפסיק או שורה)
              </label>
              <textarea
                className="input min-h-[88px] resize-none"
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                placeholder="דנה כהן, יואב לוי&#10;רעות אביבי&#10;..."
              />
              {namesText.trim() && (
                <div className="text-xs mt-1.5" style={{ color: "var(--foreground-muted)" }}>
                  <span className="ltr-num">{namesText.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean).length}</span> אורחים יתווספו אוטומטית
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={save} disabled={!isValid} className="btn-gold disabled:opacity-40">{table ? "שמור" : "הוסף"}</button>
        </div>
      </div>
    </div>
  );
}
