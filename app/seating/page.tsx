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
import { useVendorRedirect } from "@/lib/useVendorRedirect";
import type { Guest, SeatingTable, TableShape } from "@/lib/types";
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
  Send,
  Loader2,
} from "lucide-react";
import { showToast } from "@/components/Toast";
import { useWhatsAppSeating } from "@/hooks/useWhatsAppSeating";

/** dataTransfer mime — keeps drag payload distinct from raw text drops. */
const DRAG_MIME = "application/x-momentum-guest";

/**
 * R127 — single source of truth for chair positioning across both
 * the floor card (`Table3D`) and the center-detail preview
 * (`TableDetailModal`). Pre-R127 the two surfaces had two copies
 * of the chair math; when R126 added the knight shape, the modal
 * was forgotten and a knight table opened in the modal showed up
 * as a round disc with chairs squashed onto a circle.
 *
 * Round: chairs on a 53%-radius ring around the disc center.
 * Knight: chairs along both long edges of a 2.4:1 rectangle —
 *   ceil(N/2) on top, floor(N/2) on bottom; capacity 1 still
 *   renders one chair (top).
 */
interface ChairLayout {
  left: string;
  top: string;
  rot: number;
  filled: boolean;
}
function buildChairs(
  table: { capacity: number; shape?: "round" | "knight" },
  heads: number,
): ChairLayout[] {
  const chairs: ChairLayout[] = [];
  if (table.shape === "knight") {
    const topCount = Math.ceil(table.capacity / 2);
    const bottomCount = table.capacity - topCount;
    // R129 — knight is a true four-sided rectangle (R128's stadium
    // shape was wrong). Chairs distribute proportionally across the
    // FULL width of each long edge with a small inset from the
    // corners so the first/last chair doesn't end up overhanging
    // the short edge. 4% per side is enough margin for the chair's
    // 9px half-width on the widest sane head table.
    const INSET = 4; // % of width — keeps end chairs off the short edge
    const RANGE = 100 - 2 * INSET; // 92% spread for chairs
    for (let i = 0; i < topCount; i++) {
      const x = INSET + ((i + 0.5) / topCount) * RANGE;
      chairs.push({
        left: `calc(${x}% - 9px)`,
        top: "-16px",
        rot: 0,
        filled: chairs.length < heads,
      });
    }
    for (let i = 0; i < bottomCount; i++) {
      const x = INSET + ((i + 0.5) / bottomCount) * RANGE;
      chairs.push({
        left: `calc(${x}% - 9px)`,
        top: "calc(100% - 4px)",
        rot: 180,
        filled: chairs.length < heads,
      });
    }
    return chairs;
  }
  // Round (default).
  const ring = 53;
  for (let i = 0; i < table.capacity; i++) {
    const angleFromTop = (i * 360) / table.capacity;
    const rad = ((angleFromTop - 90) * Math.PI) / 180;
    const dx = Math.cos(rad) * ring;
    const dy = Math.sin(rad) * ring;
    chairs.push({
      left: `calc(50% + ${dx}% - 9px)`,
      top: `calc(50% + ${dy}% - 10px)`,
      rot: angleFromTop,
      filled: i < heads,
    });
  }
  return chairs;
}

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
  // R114 — vendors don't seat wedding guests.
  useVendorRedirect();
  const [showAddTable, setShowAddTable] = useState(false);
  const [editingTable, setEditingTable] = useState<SeatingTable | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  // R127 — top-level shape filter so the host can focus the floor on
  // just the round tables or just the knight (banquet) tables. "all"
  // is the default; switching filters out the others. Cosmetic only
  // — no data mutation, no impact on the smart-arrangement algorithm.
  const [shapeFilter, setShapeFilter] = useState<"all" | "round" | "knight">("all");
  // R113 — default to FLAT view so the tables render as true circles
  // instead of the elliptical 28°-perspective version. Pre-R113 the
  // tilt was on by default; the floor looked cinematic but circles
  // got compressed vertically and chairs at the bottom edge bled into
  // the row below, which read as "the tables aren't symmetric / are
  // cut off". Flat is the calmer, more-accurate-to-the-data default;
  // hosts who want the cinematic look can still toggle 3D back on.
  const [flatView, setFlatView] = useState(true);
  // R71 (R60-5) — 3D ROOM removed; 2D top-down view is now the only one.
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

  const { busy: seatingWaBusy, sendSeating } = useWhatsAppSeating();
  const seatedConfirmedCount = useMemo(
    () =>
      state.guests.filter(
        (g) => g.status === "confirmed" && state.seatAssignments[g.id],
      ).length,
    [state.guests, state.seatAssignments],
  );

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
              {seatedConfirmedCount > 0 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  disabled={seatingWaBusy}
                  onClick={async () => {
                    if (!state.event) return;
                    if (
                      !window.confirm(
                        `לשלוח הודעת WhatsApp עם מספר שולחן ל-${seatedConfirmedCount} מוזמנים שאישרו הגעה?`,
                      )
                    ) {
                      return;
                    }
                    const result = await sendSeating(
                      state.event,
                      state.guests,
                      state.tables,
                      state.seatAssignments,
                    );
                    if (!result.ok) {
                      showToast(
                        result.error === "no_confirmed_seated"
                          ? "אין מוזמנים מאושרים עם שולחן"
                          : "השליחה נכשלה",
                        "error",
                      );
                      return;
                    }
                    if (!result.configured) {
                      showToast(result.message ?? "WhatsApp לא מחובר", "error");
                      return;
                    }
                    showToast(
                      `נשלחו ${result.sent ?? 0} הודעות הושבה`,
                      "success",
                    );
                  }}
                  className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-40"
                  title="שליחת מספר שולחן ב-WhatsApp למוזמנים שאישרו"
                >
                  {seatingWaBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  שלח מקומות ({seatedConfirmedCount})
                </motion.button>
              )}
              {totals.assigned > 0 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={() => {
                    if (
                      confirm(
                        `לנקות את ההושבה של ${totals.assigned} אורחים? פעולה זו תחזיר את כולם לרשימת הממתינים.`,
                      )
                    ) {
                      Object.keys(state.seatAssignments).forEach((gid) =>
                        actions.assignSeat(gid, null),
                      );
                    }
                  }}
                  className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
                  aria-label="נקה את כל ההושבה"
                >
                  <Trash2 size={14} /> נקה הכל
                </motion.button>
              )}
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

          {/* R135 — premium stats strip. Was a flat row with "X/Y" text;
              now anchors the page with an animated gold progress bar +
              prominent % so the host can read progress at a glance from
              across the room. Three columns on desktop (icon+count,
              progress, secondary stats) collapse to stacked on mobile. */}
          <section
            className="mt-6 card-gold p-5 md:p-6"
            aria-label="סיכום סידורי הושבה"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                    color: "var(--gold-button-text)",
                  }}
                >
                  <Users size={18} />
                </div>
                <div>
                  <div
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    אורחים מסודרים
                  </div>
                  <div className="mt-0.5 text-2xl font-extrabold ltr-num leading-none">
                    <span className="gradient-gold">{totals.assigned}</span>
                    <span style={{ color: "var(--foreground-muted)" }}>
                      {" "}
                      / {totals.total}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-end">
                <div
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  התקדמות
                </div>
                <div className="mt-0.5 text-3xl font-extrabold ltr-num gradient-gold leading-none">
                  {totals.total > 0
                    ? Math.round((totals.assigned / totals.total) * 100)
                    : 0}
                  %
                </div>
              </div>
            </div>

            {/* Animated progress bar */}
            <div
              className="mt-4 h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(0,0,0,0.25)" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={totals.total}
              aria-valuenow={totals.assigned}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, var(--gold-100), var(--gold-500))",
                  boxShadow:
                    totals.assigned > 0
                      ? "0 0 14px -2px var(--accent-glow)"
                      : "none",
                }}
                initial={{ width: 0 }}
                animate={{
                  width: `${
                    totals.total > 0
                      ? (totals.assigned / totals.total) * 100
                      : 0
                  }%`,
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>

            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              style={{ color: "var(--foreground-soft)" }}
            >
              <span>
                <span className="ltr-num font-bold">{state.tables.length}</span>{" "}
                שולחנות פעילים
              </span>
              <span>
                <span className="ltr-num font-bold">{unassigned.length}</span>{" "}
                אורחים ממתינים להושבה
              </span>
            </div>
          </section>

          {/* R135 — polished empty states. Larger headlines, clearer
              CTAs, gold-accented icon chips that match the rest of the
              app's visual language. */}
          {state.guests.length === 0 && (
            <div className="card p-10 md:p-14 mt-8 text-center">
              <div
                className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-100) 12%, transparent)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                }}
              >
                <Users size={28} />
              </div>
              <h3 className="text-xl font-bold">עדיין אין מוזמנים</h3>
              <p
                className="mt-2 text-sm max-w-md mx-auto leading-relaxed"
                style={{ color: "var(--foreground-soft)" }}
              >
                לפני שמתחילים לסדר אורחים סביב שולחנות — הוסף את רשימת המוזמנים
                שלך. אפשר להעלות מאקסל / לייבא מאנשי קשר / להוסיף ידנית.
              </p>
              <Link
                href="/guests"
                className="btn-gold mt-6 inline-flex items-center gap-2"
              >
                <Plus size={16} /> הוסף מוזמנים
              </Link>
            </div>
          )}

          {state.guests.length > 0 && state.tables.length === 0 && (
            <div className="card p-10 md:p-14 mt-8 text-center">
              <div
                className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-100) 12%, transparent)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                }}
              >
                <Plus size={28} />
              </div>
              <h3 className="text-xl font-bold">בנו את השולחן הראשון</h3>
              <p
                className="mt-2 text-sm max-w-md mx-auto leading-relaxed"
                style={{ color: "var(--foreground-soft)" }}
              >
                כל שולחן הוא עיגול עם כיסאות. כיסאות זהובים = אורחים שכבר יושבים.
                מומלץ 10-12 מקומות לשולחן ממוצע באירוע ישראלי.
              </p>
              <button
                onClick={() => setShowAddTable(true)}
                className="btn-gold mt-6 inline-flex items-center gap-2"
              >
                <Plus size={16} /> שולחן ראשון
              </button>
              <p
                className="mt-4 text-xs"
                style={{ color: "var(--foreground-muted)" }}
              >
                💡 אחרי שיהיו לך 2-3 שולחנות — לחץ &quot;סדר אוטומטית&quot;
                ונבנה לך הצעה חכמה
              </p>
            </div>
          )}

          {state.guests.length > 0 && state.tables.length > 0 && (
            // R137 — wider floor, narrower side panel. Pre-R137 the
            // side panel ate 320px and the floor was a 1fr column with
            // 2/3 grid cards — on a 1280px screen the tables crammed
            // into ~600px and looked tiny. Now: side panel = 264px,
            // floor card grid can use 4 columns on lg+ so each table
            // is a touch smaller individually but the FLOOR reads as
            // an actual venue room. The "click to open in center"
            // modal (R137) means the side panel no longer holds the
            // editor, freeing it up to be slim.
            <div className="mt-10 grid lg:grid-cols-[1fr_264px] gap-5">
              <div>
                {/* R71 (R60-5) — 2D top-down floor plan is the only view.
                    The 3D toggle (R44 §3) was removed: webgl freezes on
                    mobile, the cinematic intro added ~120KB of three.js
                    to /seating's bundle for a feature few users needed. */}
                {/* R127 — segmented filter at the top of the floor.
                    Three pills: All / Round / Knight. Picking one
                    filters the visible tables — pure cosmetic, no
                    data mutation. Hidden when there are no knight
                    tables yet (no value to filter). */}
                {state.tables.some((t) => t.shape === "knight") && (
                  <div className="mb-6 flex justify-center">
                    <div
                      className="inline-flex p-1 rounded-2xl gap-1"
                      role="tablist"
                      aria-label="סנן לפי צורת שולחן"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-gold)",
                        boxShadow:
                          "0 8px 24px -16px var(--accent-glow), inset 0 1px 0 color-mix(in srgb, var(--accent) 12%, transparent)",
                      }}
                    >
                      {(
                        [
                          { id: "all", label: "הכל", count: state.tables.length },
                          {
                            id: "round",
                            label: "עגולים",
                            count: state.tables.filter(
                              (t) => t.shape !== "knight",
                            ).length,
                          },
                          {
                            id: "knight",
                            label: "אבירים",
                            count: state.tables.filter(
                              (t) => t.shape === "knight",
                            ).length,
                          },
                        ] as const
                      ).map((opt) => {
                        const on = shapeFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setShapeFilter(opt.id)}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition"
                            style={
                              on
                                ? {
                                    background:
                                      "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                                    color: "var(--gold-button-text)",
                                    boxShadow:
                                      "0 6px 18px -8px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)",
                                  }
                                : {
                                    color: "var(--foreground-soft)",
                                  }
                            }
                          >
                            {opt.label}
                            <span
                              className="text-[11px] ltr-num rounded-full px-1.5 py-0.5"
                              style={{
                                background: on
                                  ? "rgba(0,0,0,0.18)"
                                  : "color-mix(in srgb, var(--accent) 14%, transparent)",
                                color: on
                                  ? "var(--gold-button-text)"
                                  : "var(--accent)",
                                minWidth: 22,
                                textAlign: "center",
                              }}
                            >
                              {opt.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div
                  className="floor-3d"
                  data-many-tables={state.tables.length > 10 ? "true" : "false"}
                >
                  <div className={`floor-3d-inner ${flatView ? "flat" : ""} ${activeTableId ? "has-focused" : ""} floor-grid p-6 md:p-10`}>
                    {/* R115 — switched grid → flex-wrap so partial
                        rows center themselves. Before R115 the floor
                        used `grid-cols-{2,3,4}` which placed every
                        cell on a fixed column track; with 5 tables
                        on a 4-column grid the 5th sat alone in the
                        first column of row 2, leaving 3 empty cells
                        beside it — visibly asymmetric.

                        Each table card is given an explicit basis
                        per breakpoint so the row math stays the
                        same as the old grid (2 / 3 / 4 per row),
                        but when a row doesn't fill out, the
                        remaining card(s) center along the row axis
                        instead of left-aligning. Vertical gap stays
                        generous because the name label sits above
                        the circle and needs its own headroom. */}
                    <div className="flex flex-wrap justify-center gap-x-10 gap-y-14 md:gap-y-20">
                      {tablesWithGuests
                        .filter(({ table }) => {
                          // R127 — apply the segmented filter from the
                          // top pills. "all" passes everything; "round"
                          // matches tables with shape !== "knight" (so
                          // legacy rows with no shape default to round
                          // and still appear).
                          if (shapeFilter === "all") return true;
                          if (shapeFilter === "knight") return table.shape === "knight";
                          return table.shape !== "knight";
                        })
                        .map(({ table, heads }, i) => (
                        <div
                          key={table.id}
                          // R126 — knight (long banquet) tables get a wider
                          // basis so all their chairs fit on screen. On
                          // mobile they always span the full row. On md+
                          // they take half the row (so two head tables can
                          // sit side-by-side). Round tables keep the R115
                          // 2/3/4-per-row responsive basis.
                          className={
                            table.shape === "knight"
                              ? "basis-full md:basis-[calc(66.666%-1.667rem)] lg:basis-[calc(50%-1.25rem)] flex-grow-0 flex-shrink-0"
                              : "basis-[calc(50%-1.25rem)] sm:basis-[calc(33.333%-1.667rem)] lg:basis-[calc(25%-1.875rem)] flex-grow-0 flex-shrink-0"
                          }
                        >
                        <Table3D
                          table={table}
                          heads={heads}
                          displayNumber={table.number ?? i + 1}
                          active={activeTableId === table.id}
                          receiving={flashingTables.has(table.id)}
                          scanning={showingScan}
                          isNewlyAdded={newlyAddedTableId === table.id}
                          floatEnabled={state.tables.length <= 10}
                          onActivate={handleActivateTable}
                          onDropGuest={handleDropOnTable}
                        />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* R131 — side panel order:
                    1. CapacityOverviewCard — premium "chairs vs
                       guests" headline so the host always knows
                       where they stand on capacity
                    2. UnassignedPanel — drag list (existing)
                    3. SeatingTipsCard — rotating expert-feeling tips
                       calibrated to the current state (reserves,
                       singles, dietary, etc.)
                    4. FloorLegendCard — small status legend (R137) */}
              <aside className="space-y-4">
                <CapacityOverviewCard
                  totalChairs={state.tables.reduce((sum, t) => sum + t.capacity, 0)}
                  totalGuests={totals.total}
                  assignedGuests={totals.assigned}
                  tablesCount={state.tables.length}
                />
                <UnassignedPanel guests={unassigned} onDropGuest={handleDropOnUnassigned} />
                <SeatingTipsCard
                  totalChairs={state.tables.reduce((sum, t) => sum + t.capacity, 0)}
                  totalGuests={totals.total}
                  unassignedCount={unassigned.length}
                  tablesCount={state.tables.length}
                  fullTablesCount={tablesWithGuests.filter((r) => r.heads >= r.table.capacity).length}
                  overTablesCount={tablesWithGuests.filter((r) => r.heads > r.table.capacity).length}
                  hasKnightTable={state.tables.some((t) => t.shape === "knight")}
                />
                <FloorLegendCard
                  tablesCount={state.tables.length}
                  full={tablesWithGuests.filter((r) => r.heads >= r.table.capacity && r.heads <= r.table.capacity).length}
                  over={tablesWithGuests.filter((r) => r.heads > r.table.capacity).length}
                />
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
        {/* R137 — center-of-screen detail modal. Replaces the in-aside
            TableEditorPanel + the dramatic in-place table zoom. When the
            user clicks a table, this opens with: a big interactive preview
            on the left (the same Table3D look, drag-droppable) and a
            polished guest editor on the right. Closes on Esc / backdrop /
            X. AnimatePresence lets the scale-out exit play before unmount. */}
        <AnimatePresence>
          {activeTable && activeRow && (
            <TableDetailModal
              key={activeTable.id}
              table={activeTable}
              guests={activeRow.guests}
              heads={activeRow.heads}
              unassigned={unassigned}
              receiving={flashingTables.has(activeTable.id)}
              displayNumber={activeTable.number ?? state.tables.findIndex((t) => t.id === activeTable.id) + 1}
              onClose={() => setActiveTableId(null)}
              onEdit={() => setEditingTable(activeTable)}
              onDropGuest={handleDropOnTable}
            />
          )}
        </AnimatePresence>
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

  // R126 / R127 — chair positions for both round + knight come from
  // the module-level `buildChairs()` helper so the floor card and
  // the center-detail modal stay in lockstep on every future tweak.
  const isKnight = table.shape === "knight";
  const chairs = buildChairs(table, heads);

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

      <div className={`surface relative ${isKnight ? "surface-knight" : ""}`}>
        {/* Scan overlay sits above the surface gradient but below chairs/labels
            (z-index:0 in CSS; chairs are positioned with their own stacking).
            AnimatePresence isn't needed — the CSS animation auto-plays once and
            the element unmounts when scanning flips back to false. */}
        {scanning && <span aria-hidden className="arrangement-scan" />}
        {/* R136 / R126 — proper chair shapes: seat + curved back, rotated so
            the back always faces away from the table. For round tables, chairs
            sit on a 53%-radius ring; for knight tables, they line both long
            edges. The `left`/`top` values come pre-computed in the chairs
            array above so this loop is shape-agnostic. */}
        {chairs.map((c, i) => (
          <span
            key={i}
            className={`chair-v2 ${c.filled ? "filled" : ""}`}
            // R136 — `--rot` is referenced by the @keyframes inside
            // chair-v2.css so the settle-in animation preserves the
            // chair's outward orientation. Without it the animated
            // transform overrides the inline rotate() and every chair
            // briefly snaps to angle 0 mid-animation.
            style={
              {
                left: c.left,
                top: c.top,
                transform: `rotate(${c.rot}deg)`,
                "--rot": `${c.rot}deg`,
              } as CSSProperties
            }
            aria-hidden
          >
            <span className="chair-v2-back" />
            <span className="chair-v2-seat" />
          </span>
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

        {/* R135 — subtle capacity utilization bar. Lives at the bottom
            of the table surface, between the count and the chair ring.
            Gold gradient when partial, full-bright + glow when at
            capacity, red when overflowing. Tiny but tells the host
            which tables still have room from across the room. */}
        {table.capacity > 0 && (
          <div
            className="mt-2 mx-auto h-0.5 w-12 rounded-full overflow-hidden"
            style={{
              background: "rgba(0,0,0,0.25)",
            }}
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, fullness * 100)}%`,
                background: overCapacity
                  ? "linear-gradient(90deg, rgb(248,113,113), rgb(220,38,38))"
                  : fullness >= 1
                    ? "linear-gradient(90deg, var(--gold-100), var(--gold-500))"
                    : "linear-gradient(90deg, rgba(244,222,169,0.5), rgba(168,136,74,0.6))",
                boxShadow:
                  fullness >= 1 && !overCapacity
                    ? "0 0 6px var(--accent-glow)"
                    : "none",
              }}
            />
          </div>
        )}
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

// ─────────────────────────────── R137 — Table Detail Modal ───────────────────────────────
//
// Center-of-screen modal that opens when the host clicks a table on the
// floor. Replaces the older "table zooms in place + side-panel editor"
// pattern with a focused, premium dialog:
//   • Backdrop blurs the floor behind it so attention stays on this table
//   • Left column: big 3D table preview (chairs, capacity bar, name pill)
//     — drag-drop target, so the host can drag an unassigned guest from
//     the side panel directly into the preview without closing the modal
//   • Right column: guest editor (seated list with bounce in/out, add-by-
//     name form, add-existing-unassigned picker, edit/delete actions)
//
// Animations are intentionally restrained — one scale-in on open, one
// scale-out on close. Inside the modal it's the chairs + bar that move,
// not the modal frame, so the host's eye lands on data not chrome.
function TableDetailModal({
  table,
  guests,
  heads,
  unassigned,
  displayNumber,
  receiving,
  onClose,
  onEdit,
  onDropGuest,
}: {
  table: SeatingTable;
  guests: Guest[];
  heads: number;
  unassigned: Guest[];
  displayNumber: number;
  receiving: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDropGuest: (tableId: string, guestId: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const overCapacity = heads > table.capacity;
  const fullness = Math.min(1, heads / table.capacity);
  const stateClass = overCapacity ? "over" : fullness >= 1 ? "full" : "";

  // Esc to close — same convention as other modals in this app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // R127 — chair math comes from the shared `buildChairs` helper so
  // the modal preview matches the floor card for both round AND knight
  // shapes. Pre-R127 the modal had its own copy of the round-table
  // formula and rendered every table as a circle, so opening a
  // newly-created knight table showed the wrong silhouette + chair
  // arrangement.
  const isKnight = table.shape === "knight";
  const chairs = buildChairs(table, heads);

  const handleAddGuest = (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const guest = actions.addGuest({ name, phone: "", attendingCount: 1 });
    actions.assignSeat(guest.id, table.id);
    setNewName("");
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(8,6,4,0.74)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="table-detail-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <motion.div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--surface-1)), var(--surface-1))",
          border: "1px solid var(--border-gold)",
          boxShadow:
            "0 40px 90px -20px rgba(0,0,0,0.7), 0 0 0 1px var(--accent-glow), 0 0 120px -20px var(--accent-glow)",
        }}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.86, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
      >
        <header
          className="px-6 py-5 flex items-start justify-between gap-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="rounded-2xl flex items-center justify-center shrink-0"
              style={{
                width: 56,
                height: 56,
                background:
                  "linear-gradient(135deg, rgba(244,222,169,0.28), rgba(168,136,74,0.16))",
                border: "1px solid var(--border-gold)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 20px -8px var(--accent-glow)",
              }}
            >
              <span className="text-2xl font-extrabold gradient-gold ltr-num">{displayNumber}</span>
            </div>
            <div className="min-w-0">
              <span className="eyebrow text-[10px]">שולחן {displayNumber}</span>
              <h2 id="table-detail-title" className="text-2xl md:text-3xl font-extrabold tracking-tight gradient-gold leading-tight truncate">
                {table.name}
              </h2>
              <div className="mt-0.5 text-xs ltr-num" style={{ color: overCapacity ? "rgb(252 165 165)" : "var(--foreground-muted)" }}>
                {heads} / {table.capacity} מקומות
                {table.circle && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--accent)" }}>{table.circle}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* R133 — labelled "ערוך פרטים" button so the host can find
                the full-edit modal (name, shape, social circle) without
                guessing what the pencil icon does. Capacity itself is
                editable inline under the table preview — this button is
                for the deeper edits. */}
            <button
              onClick={onEdit}
              aria-label="ערוך פרטי שולחן"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition hover:scale-[1.03]"
              style={{
                background:
                  "color-mix(in srgb, var(--accent) 12%, var(--surface-2))",
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }}
              title="ערוך פרטי שולחן"
            >
              <Pencil size={13} aria-hidden /> ערוך
            </button>
            <button
              onClick={() => {
                if (confirm(`למחוק את שולחן ${displayNumber} — ${table.name}? האורחים יחזרו לרשימת הממתינים.`)) {
                  actions.removeTable(table.id);
                  onClose();
                }
              }}
              aria-label="מחק שולחן"
              className="p-2 rounded-full hover:bg-[var(--secondary-button-bg)]"
              title="מחק שולחן"
            >
              <Trash2 size={15} style={{ color: "var(--foreground-muted)" }} />
            </button>
            <button
              onClick={onClose}
              aria-label="סגור"
              className="p-2 rounded-full hover:bg-[var(--secondary-button-bg)]"
              title="סגור"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="grid md:grid-cols-[1fr_1fr] gap-0 overflow-hidden flex-1 min-h-0">
          {/* Left — big table preview. Same Table3D visual language but
              statically rendered at a comfortable hero size. Acts as a
              drop target so the host can drag from the unassigned list
              behind the modal (we keep pointer-events normal on it) and
              drop onto the preview. */}
          <div
            className="relative flex flex-col items-center justify-center p-6 md:p-10"
            style={{
              background:
                "radial-gradient(circle at 50% 35%, rgba(212,176,104,0.10), transparent 70%), var(--surface-1)",
              borderInlineEnd: "1px solid var(--border)",
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (!dragOver) setDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDragOver(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
              const gid = e.dataTransfer.getData(DRAG_MIME);
              if (gid) onDropGuest(table.id, gid);
            }}
          >
            {/* R127 — knight tables open in the modal as a wider
                preview (max 540px) so all 20+ chairs are visible at
                presentation scale. Round tables stay capped at 340px
                so the disc reads as a calm centered card. */}
            <motion.div
              className={[
                "table-3d table-detail-preview",
                stateClass,
                dragOver ? "drag-over table-drop-active" : "",
                receiving ? "table-receive" : "",
                "active",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  width: isKnight ? "min(94%, 540px)" : "min(86%, 340px)",
                  transform: "none",
                  animation: "none",
                } as CSSProperties
              }
              // R127 — Framer-driven entrance morph. The shape itself
              // (round vs rectangle) doesn't morph between values
              // because each table has a fixed shape; what morphs is
              // the modal's mount: scale + opacity ease in so the
              // preview "lands" instead of popping. Faster spring on
              // knight (more horizontal real-estate, looks better
              // settling quickly than wobbling).
              initial={{ scale: 0.6, opacity: 0, rotate: -2 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{
                type: "spring",
                damping: isKnight ? 24 : 20,
                stiffness: 260,
              }}
              aria-hidden
            >
              <div className="table-name-label" style={{ transform: "translateZ(0)" }}>
                {table.name}
              </div>
              {/* R127 — surface honors the table's shape. Knight gets
                  the rectangular 2.4:1 surface variant (same gold
                  rim + gradient as round, but rectangular box). */}
              <div
                className={`surface relative ${isKnight ? "surface-knight" : ""}`}
                style={
                  isKnight
                    ? { width: "100%" }
                    : { width: "100%", aspectRatio: "1" }
                }
              >
                {chairs.map((c, i) => (
                  <span
                    key={i}
                    className={`chair-v2 ${c.filled ? "filled" : ""}`}
                    style={
                      {
                        left: c.left,
                        top: c.top,
                        transform: `rotate(${c.rot}deg)`,
                        "--rot": `${c.rot}deg`,
                      } as CSSProperties
                    }
                    aria-hidden
                  >
                    <span className="chair-v2-back" />
                    <span className="chair-v2-seat" />
                  </span>
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
                {table.capacity > 0 && (
                  <div
                    className="mt-2 mx-auto h-0.5 w-16 rounded-full overflow-hidden"
                    style={{ background: "rgba(0,0,0,0.25)" }}
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, fullness * 100)}%`,
                        background: overCapacity
                          ? "linear-gradient(90deg, rgb(248,113,113), rgb(220,38,38))"
                          : fullness >= 1
                            ? "linear-gradient(90deg, var(--gold-100), var(--gold-500))"
                            : "linear-gradient(90deg, rgba(244,222,169,0.5), rgba(168,136,74,0.6))",
                        boxShadow:
                          fullness >= 1 && !overCapacity
                            ? "0 0 6px var(--accent-glow)"
                            : "none",
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
            {/* R133 — quick capacity editor sits right under the
                preview so the host can correct "I made 12 chairs by
                mistake" in two taps without leaving the modal. Live
                updates the store on every click. Premium gold-on-
                surface treatment matching the rest of the floor. */}
            <div className="mt-5 w-full max-w-sm relative z-10">
              <div
                className="rounded-2xl p-3 flex items-center justify-between gap-3"
                style={{
                  background:
                    "linear-gradient(165deg, color-mix(in srgb, var(--accent) 10%, var(--surface-2)), color-mix(in srgb, var(--accent) 3%, var(--surface-1)))",
                  border: "1px solid var(--border-gold)",
                  boxShadow:
                    "0 10px 28px -16px var(--accent-glow), inset 0 1px 0 color-mix(in srgb, var(--accent) 18%, transparent)",
                }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[10px] uppercase tracking-[0.18em] font-bold"
                    style={{ color: "var(--accent)" }}
                  >
                    מקומות בשולחן
                  </div>
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {table.capacity > heads
                      ? `${table.capacity - heads} מקומות פנויים`
                      : table.capacity === heads
                        ? "תפוסה מלאה"
                        : `${heads - table.capacity} בעודף`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      actions.updateTable(table.id, {
                        capacity: Math.max(1, table.capacity - 1),
                      })
                    }
                    disabled={table.capacity <= 1}
                    className="w-9 h-9 rounded-full inline-flex items-center justify-center transition disabled:opacity-30 hover:scale-105"
                    style={{
                      background:
                        "color-mix(in srgb, var(--accent) 14%, var(--surface-2))",
                      border: "1px solid var(--border-gold)",
                      color: "var(--accent)",
                    }}
                    aria-label="הפחת מקום אחד"
                    title="הפחת מקום אחד"
                  >
                    <span className="text-lg leading-none font-bold">−</span>
                  </button>
                  <div
                    className="font-extrabold ltr-num gradient-gold-shimmer leading-none px-2 min-w-[2.5rem] text-center"
                    style={{
                      fontFamily: "var(--font-display), Georgia, serif",
                      fontSize: "1.85rem",
                    }}
                    aria-live="polite"
                  >
                    {table.capacity}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      actions.updateTable(table.id, {
                        capacity: table.capacity + 1,
                      })
                    }
                    className="w-9 h-9 rounded-full inline-flex items-center justify-center transition hover:scale-105"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                      border: "1px solid var(--border-gold)",
                      color: "var(--gold-button-text)",
                      boxShadow:
                        "0 4px 12px -4px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.22)",
                    }}
                    aria-label="הוסף מקום אחד"
                    title="הוסף מקום אחד"
                  >
                    <span className="text-lg leading-none font-bold">+</span>
                  </button>
                </div>
              </div>
              <p
                className="mt-2 text-center text-[11px]"
                style={{ color: "var(--foreground-muted)" }}
              >
                💡 גרור אורח מהרשימה ישירות לכאן
              </p>
            </div>
          </div>

          {/* Right — guest editor: seated guests + add new + add existing. */}
          <div className="p-5 md:p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                יושבים כאן
              </h3>
              <span className="pill pill-muted">{guests.length}</span>
            </div>

            {/* Seated guests — bouncy chips like the old editor, capped
                at 15 to keep render budget healthy on big tables. */}
            {guests.length > 0 ? (
              guests.length < 15 ? (
                <motion.div layout className="space-y-1.5 mb-4">
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
                        className="rounded-xl p-2.5 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
                        style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                        aria-label={`גרור את ${g.name} כדי להעביר לשולחן אחר`}
                      >
                        <Avatar name={g.name} id={g.id} size={26} />
                        <span className="flex-1 truncate">{g.name}</span>
                        {(g.attendingCount ?? 1) > 1 && (
                          <span className="ltr-num text-[--accent] text-xs font-bold">
                            +{(g.attendingCount ?? 1) - 1}
                          </span>
                        )}
                        <button
                          onClick={() => actions.assignSeat(g.id, null)}
                          className="hover:text-red-400 p-1"
                          style={{ color: "var(--foreground-muted)" }}
                          aria-label="הסר משולחן"
                        >
                          <X size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <div className="space-y-1.5 mb-4">
                  {guests.map((g) => (
                    <div
                      key={g.id}
                      draggable
                      onDragStart={setGuestDragPayload(g.id)}
                      className="rounded-xl p-2.5 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
                      style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                    >
                      <Avatar name={g.name} id={g.id} size={26} />
                      <span className="flex-1 truncate">{g.name}</span>
                      {(g.attendingCount ?? 1) > 1 && (
                        <span className="ltr-num text-[--accent] text-xs font-bold">
                          +{(g.attendingCount ?? 1) - 1}
                        </span>
                      )}
                      <button
                        onClick={() => actions.assignSeat(g.id, null)}
                        className="hover:text-red-400 p-1"
                        style={{ color: "var(--foreground-muted)" }}
                        aria-label="הסר משולחן"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div
                className="text-sm text-center py-6 rounded-xl mb-4"
                style={{ background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px dashed var(--border)" }}
              >
                <Users size={18} className="mx-auto mb-1 opacity-60" />
                השולחן ריק — הוסף אורחים למטה או גרור לתצוגה משמאל.
              </div>
            )}

            <form
              onSubmit={handleAddGuest}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}
            >
              <UserPlus size={15} className="text-[--accent] shrink-0" />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="הוסף אורח לשולחן זה..."
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

            {unassigned.length > 0 && (
              <div>
                <div className="text-xs mb-1.5" style={{ color: "var(--foreground-muted)" }}>
                  או הושב מוזמן קיים:
                </div>
                <div className="space-y-1 max-h-[200px] overflow-y-auto pr-0.5">
                  {unassigned.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => actions.assignSeat(g.id, table.id)}
                      className="w-full rounded-xl p-2 text-start flex items-center gap-2 text-sm transition hover:bg-[var(--secondary-button-bg)]"
                      style={{ border: "1px dashed var(--border)", color: "var(--foreground-soft)" }}
                    >
                      <Plus size={12} className="text-[--accent]" />
                      <span className="flex-1 truncate">{g.name}</span>
                      {(g.attendingCount ?? 1) > 1 && (
                        <span className="ltr-num text-xs">+{(g.attendingCount ?? 1) - 1}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * R131 — premium capacity overview card. Sits at the top of the side
 * panel so the host always sees "X chairs · Y guests" at a glance,
 * with the delta and a progress bar making over/under capacity
 * instantly readable. Visual treatment matches the floor's gold-on-
 * dark luxury language (gold rim, accent-glow shadow, gold-shimmer
 * number for the headline metric).
 */
function CapacityOverviewCard({
  totalChairs,
  totalGuests,
  assignedGuests,
  tablesCount,
}: {
  totalChairs: number;
  totalGuests: number;
  assignedGuests: number;
  tablesCount: number;
}) {
  const delta = totalChairs - totalGuests;
  const fillPct =
    totalChairs > 0 ? Math.min(100, (totalGuests / totalChairs) * 100) : 0;
  const overCapacity = delta < 0;
  const assignedPct =
    totalGuests > 0 ? Math.round((assignedGuests / totalGuests) * 100) : 0;

  const deltaLabel = overCapacity
    ? `חסרים ${Math.abs(delta)} כיסאות`
    : delta === 0
      ? "תפוסה מלאה — אין רזרבה"
      : `${delta} כיסאות פנויים`;
  const deltaTone = overCapacity
    ? "rgb(252,165,165)"
    : delta <= 2
      ? "var(--foreground-soft)"
      : "var(--accent)";

  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in srgb, var(--accent) 14%, var(--surface-2)), color-mix(in srgb, var(--accent) 5%, var(--surface-1)))",
        border: "1px solid var(--border-gold)",
        boxShadow:
          "0 18px 40px -20px var(--accent-glow), inset 0 1px 0 color-mix(in srgb, var(--accent) 22%, transparent)",
      }}
    >
      {/* Subtle gold halo top-right for depth. */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "-30%",
          right: "-20%",
          width: "70%",
          height: "70%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%)",
          filter: "blur(20px)",
        }}
      />

      <div className="relative">
        <div
          className="text-[10px] uppercase tracking-[0.22em] font-bold inline-flex items-center gap-1.5"
          style={{ color: "var(--accent)" }}
        >
          <Sparkles size={11} aria-hidden /> סטטוס תפוסה
        </div>

        {/* Two big numbers side-by-side: chairs vs guests. */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <div
              className="text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              כיסאות
            </div>
            <div
              className="ltr-num font-extrabold leading-none gradient-gold-shimmer"
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(2rem, 6vw, 2.6rem)",
              }}
            >
              {totalChairs}
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: "var(--foreground-muted)" }}
            >
              ב-{tablesCount} שולחנות
            </div>
          </div>
          <div>
            <div
              className="text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              מוזמנים
            </div>
            <div
              className="ltr-num font-extrabold leading-none"
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(2rem, 6vw, 2.6rem)",
                color: "var(--foreground)",
              }}
            >
              {totalGuests}
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: "var(--foreground-muted)" }}
            >
              <span className="ltr-num">{assignedGuests}</span> כבר משובצים
            </div>
          </div>
        </div>

        {/* Capacity progress bar. Gold gradient at <100%, red when overflowing. */}
        <div
          className="mt-5 h-2 rounded-full overflow-hidden"
          style={{
            background: "color-mix(in srgb, var(--background) 60%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${fillPct}%`,
              background: overCapacity
                ? "linear-gradient(90deg, rgb(248,113,113), rgb(220,38,38))"
                : "linear-gradient(90deg, var(--gold-100), var(--gold-500))",
              boxShadow: overCapacity
                ? "0 0 8px rgba(248,113,113,0.5)"
                : "0 0 8px var(--accent-glow)",
            }}
          />
        </div>

        <div
          className="mt-3 flex items-center justify-between text-xs font-semibold"
          style={{ color: deltaTone }}
        >
          <span>{deltaLabel}</span>
          <span className="ltr-num">{assignedPct}% משובצים</span>
        </div>
      </div>
    </div>
  );
}

/**
 * R131 — smart seating tips. Returns a rotated set of advice slips
 * calibrated to the current host state: reserves, single guests,
 * dietary planning, knight-table logistics, etc. Designed as a
 * "premium concierge advice" feel — gold-bordered card with one
 * highlighted tip at the top + 2-3 contextual ones below.
 */
function SeatingTipsCard({
  totalChairs,
  totalGuests,
  unassignedCount,
  tablesCount,
  fullTablesCount,
  overTablesCount,
  hasKnightTable,
}: {
  totalChairs: number;
  totalGuests: number;
  unassignedCount: number;
  tablesCount: number;
  fullTablesCount: number;
  overTablesCount: number;
  hasKnightTable: boolean;
}) {
  // R131 — calibrate tips to the current state. The first tip is the
  // most "actionable now" item; the rest are evergreen wisdom.
  const tips: Array<{ icon: string; title: string; body: string; priority: number }> = [];

  if (overTablesCount > 0) {
    tips.push({
      icon: "⚠️",
      title: `${overTablesCount} שולחנות בעודף קיבולת`,
      body: "פתח אותם, הזז אורחים לשולחנות עם מקום פנוי, או הוסף שולחן נוסף.",
      priority: 100,
    });
  }
  if (totalGuests > 0 && totalChairs < totalGuests + 2) {
    tips.push({
      icon: "🪑",
      title: "השאר 1-2 כיסאות לכל שולחן כרזרבה",
      body:
        "באירוע ישראלי 5-10% מהאורחים מביאים בן/בת זוג ברגע האחרון. תכנן עודף קל.",
      priority: 90,
    });
  }
  if (unassignedCount > 0 && tablesCount > 0) {
    tips.push({
      icon: "🎯",
      title: `${unassignedCount} אורחים עוד לא שובצו`,
      body:
        'גרור אותם לשולחן מתאים, או לחץ "סדר אוטומטית" כדי שה-AI ימלא חכם.',
      priority: 85,
    });
  }
  if (hasKnightTable) {
    tips.push({
      icon: "👑",
      title: "שולחן אבירים = שולחן ראשי",
      body:
        "תן לו את האורחים שאתה רוצה לכבד — הורים, סבים, חברים קרובים. הוא הראשון שכולם רואים.",
      priority: 70,
    });
  }
  if (tablesCount >= 3) {
    tips.push({
      icon: "🤝",
      title: "קבץ אורחים לפי חוג חברתי",
      body:
        'הוסף "חוג חברתי" לשולחן (כמו "חברים מהצבא") + לאורחים — האלגוריתם יעדיף אותם שם.',
      priority: 60,
    });
  }

  // Evergreen tips — always show 2-3 of these.
  const evergreen: Array<{ icon: string; title: string; body: string; priority: number }> = [
    {
      icon: "🕺",
      title: "שולחנות ליד הרחבה — שמור לצעירים",
      body:
        "החברים הצעירים שעושים שמח ורוקדים? תכניס אותם בקרבת הרחבה. הם יקפצו לרקוד כל הערב והאנרגיה תזרום.",
      priority: 50,
    },
    {
      icon: "🥂",
      title: "משפחה קרובה ליד החופה",
      body:
        "הורים, סבים ומשפחת המעגל הראשון — קרוב לחופה כדי שיוכלו לראות הכל בלי לקום.",
      priority: 45,
    },
    {
      icon: "💌",
      title: "אורחים שמגיעים לבד? קבץ אותם",
      body:
        "שלב 2-3 'בודדים' עם זוגות באותו חוג. בדרך כלל הם מצטרפים לשיחה במהירות.",
      priority: 40,
    },
    {
      icon: "🍽️",
      title: "צמחונים ביחד — חוסך לוגיסטיקה",
      body:
        "בקש מהמלצרית להגיש מנה צמחונית לכל השולחן. חוסך 'מנת בשר → לא, אני צמחונית'.",
      priority: 35,
    },
  ];

  // Always end with at least 3 tips total. Sort priority desc.
  const all = [...tips, ...evergreen].sort((a, b) => b.priority - a.priority).slice(0, 4);

  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(165deg, var(--surface-2), color-mix(in srgb, var(--accent) 4%, var(--surface-1)))",
        border: "1px solid var(--border-gold)",
        boxShadow:
          "0 14px 36px -22px var(--accent-glow), inset 0 1px 0 color-mix(in srgb, var(--accent) 14%, transparent)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.22em] font-bold inline-flex items-center gap-1.5 mb-4"
        style={{ color: "var(--accent)" }}
      >
        💡 טיפים מהמומחים
      </div>

      <ul className="space-y-3.5">
        {all.map((t, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3"
            style={
              idx === 0
                ? {
                    padding: "12px",
                    borderRadius: "12px",
                    background:
                      "color-mix(in srgb, var(--accent) 10%, transparent)",
                    border: "1px solid var(--border-gold)",
                  }
                : undefined
            }
          >
            <span
              aria-hidden
              className="text-xl leading-none shrink-0 mt-0.5"
              style={{
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
              }}
            >
              {t.icon}
            </span>
            <div className="min-w-0">
              <div
                className="text-xs font-bold leading-snug"
                style={{
                  color: idx === 0 ? "var(--accent)" : "var(--foreground)",
                }}
              >
                {t.title}
              </div>
              <div
                className="text-[11px] mt-1 leading-relaxed"
                style={{ color: "var(--foreground-soft)" }}
              >
                {t.body}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div
        className="mt-4 pt-3 text-[10px] leading-relaxed flex items-center gap-2"
        style={{ borderTop: "1px solid var(--border)", color: "var(--foreground-muted)" }}
      >
        <Sparkles size={10} aria-hidden style={{ color: "var(--accent)" }} />
        טיפים מתעדכנים אוטומטית לפי הסטטוס שלך
      </div>
    </div>
  );
}

// R137 — slim help / legend card. Replaces the in-aside table editor.
// Three quick stats + the click-to-open hint, in a card the same size
// as a guest entry. Keeps the side panel useful when no table is open.
function FloorLegendCard({ tablesCount, full, over }: { tablesCount: number; full: number; over: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-bold mb-3" style={{ color: "var(--foreground)" }}>
        מפת רחבה
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between" style={{ color: "var(--foreground-soft)" }}>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))" }} />
            שולחן מלא
          </span>
          <span className="ltr-num font-bold">{full}</span>
        </div>
        <div className="flex items-center justify-between" style={{ color: "var(--foreground-soft)" }}>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(248,113,113,0.85)" }} />
            יותר אורחים מקיבולת
          </span>
          <span className="ltr-num font-bold">{over}</span>
        </div>
        <div className="flex items-center justify-between" style={{ color: "var(--foreground-soft)" }}>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--surface-3)", border: "1px solid var(--border-strong)" }} />
            יש מקום פנוי
          </span>
          <span className="ltr-num font-bold">{Math.max(0, tablesCount - full - over)}</span>
        </div>
      </div>
      <div
        className="mt-4 pt-3 text-[11px] leading-relaxed"
        style={{ borderTop: "1px solid var(--border)", color: "var(--foreground-muted)" }}
      >
        💡 לחץ על שולחן כדי לפתוח אותו במרכז המסך עם כל הכלים לעריכה.
      </div>
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
  // R126 — shape (round disc vs long "knight" banquet table). Defaults
  // to the table's stored shape on edit, or "round" on create. When the
  // host flips to knight the suggested default capacity bumps to 20 —
  // the typical head-table seat count — but they can still type any
  // number.
  const [shape, setShape] = useState<TableShape>(table?.shape ?? "round");
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
        shape,
      });
    } else {
      const newTable = actions.addTable(
        name.trim(),
        Number(capacity),
        numberForSave,
        shape,
      );
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
      <div className="card glass-strong p-6 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Users size={20} className="text-[--accent]" />
          <h3 className="text-xl font-bold">{table ? "ערוך שולחן" : "שולחן חדש"}</h3>
        </div>
        {/* R126 — shape selector. Premium 2-option toggle, first thing
            in the modal because the rest of the form (capacity, name,
            visual placement) depends on whether this is a round table
            or a long banquet table. Picking knight bumps the suggested
            capacity to 20 — typical head-table seat count — if the
            host hasn't already typed a custom number. */}
        <div className="mt-5">
          <div
            className="text-xs uppercase tracking-[0.18em] font-semibold mb-2.5"
            style={{ color: "var(--accent)" }}
          >
            צורת שולחן
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ShapeOption
              active={shape === "round"}
              onClick={() => setShape("round")}
              title="עגול"
              subtitle="8 / 10 / 12 מקומות"
            >
              <svg viewBox="0 0 60 60" className="w-12 h-12">
                <circle
                  cx="30"
                  cy="30"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                {Array.from({ length: 8 }).map((_, i) => {
                  const a = (i * Math.PI * 2) / 8;
                  const x = 30 + Math.cos(a) * 24;
                  const y = 30 + Math.sin(a) * 24;
                  return <circle key={i} cx={x} cy={y} r="2.4" fill="currentColor" />;
                })}
              </svg>
            </ShapeOption>
            <ShapeOption
              active={shape === "knight"}
              onClick={() => {
                setShape("knight");
                // Bump default capacity if the host hasn't customized it.
                if (capacity === "10") setCapacity("20");
              }}
              title="שולחן אבירים"
              subtitle="14-24 מקומות"
            >
              <svg viewBox="0 0 60 60" className="w-12 h-12">
                <rect
                  x="6"
                  y="22"
                  width="48"
                  height="16"
                  rx="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                {Array.from({ length: 6 }).map((_, i) => {
                  const x = 10 + i * 8;
                  return (
                    <g key={i}>
                      <circle cx={x} cy="18" r="2.2" fill="currentColor" />
                      <circle cx={x} cy="42" r="2.2" fill="currentColor" />
                    </g>
                  );
                })}
              </svg>
            </ShapeOption>
          </div>
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
            <label htmlFor="table-capacity" className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>מקומות (כמה אנשים יושבים)</label>
            <input id="table-capacity" className="input" type="number" inputMode="numeric" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
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

/**
 * R126 — premium "choose your table shape" tile. Two of these sit
 * side-by-side at the top of the TableModal. Active tile gets the
 * gold-on-dark luxury treatment (gold border, soft glow, gradient
 * background); inactive tile is calmer (neutral border, dim text)
 * so the active selection is unambiguous at a glance.
 */
function ShapeOption({
  active,
  onClick,
  title,
  subtitle,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-2xl p-3.5 flex flex-col items-center gap-2 text-center transition hover:translate-y-[-1px]"
      style={
        active
          ? {
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--surface-2)), color-mix(in srgb, var(--accent) 6%, var(--surface-2)))",
              border: "1px solid var(--border-gold)",
              boxShadow: "0 12px 30px -14px var(--accent-glow), inset 0 1px 0 color-mix(in srgb, var(--accent) 22%, transparent)",
              color: "var(--accent)",
            }
          : {
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--foreground-muted)",
            }
      }
    >
      <span aria-hidden style={{ color: active ? "var(--accent)" : "var(--foreground-muted)" }}>
        {children}
      </span>
      <span className="text-sm font-bold leading-tight" style={{ color: active ? "var(--accent)" : "var(--foreground)" }}>
        {title}
      </span>
      <span
        className="text-[11px] leading-tight ltr-num"
        style={{ color: "var(--foreground-muted)" }}
      >
        {subtitle}
      </span>
    </button>
  );
}
