"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
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

export default function SeatingPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [showAddTable, setShowAddTable] = useState(false);
  const [editingTable, setEditingTable] = useState<SeatingTable | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [flatView, setFlatView] = useState(false);

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    if (hydrated && !state.event) router.replace("/onboarding");
  }, [userHydrated, user, hydrated, state.event, router]);

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
      const heads = guests.reduce((sum, g) => sum + (g.attendingCount || 1), 0);
      return { table: t, guests, heads };
    });
  }, [state.tables, eligibleGuests, state.seatAssignments]);

  const totals = useMemo(() => {
    const assigned = Object.entries(state.seatAssignments).reduce((sum, [gid]) => {
      const g = eligibleGuests.find((x) => x.id === gid);
      return g ? sum + (g.attendingCount || 1) : sum;
    }, 0);
    const total = eligibleGuests.reduce((sum, g) => sum + (g.attendingCount || 1), 0);
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

  const runSmartArrangement = (seed?: number) => {
    if (state.tables.length === 0) return;
    setThinking(true);
    const usedSeed = seed ?? Date.now();
    // Artificial 1.6-2.0s delay so the "חושב..." animation feels intentional —
    // the algorithm itself runs in <50ms but UX research suggests users distrust
    // instant AI results.
    window.setTimeout(() => {
      const result = smartArrangement({
        guests: eligibleGuests,
        tables: state.tables,
        seed: usedSeed,
      });
      setProposal({ seed: usedSeed, ...result });
      setThinking(false);
    }, 1600 + Math.random() * 400);
  };

  const acceptProposal = () => {
    if (!proposal) return;
    // Replace ALL seat assignments with the proposal — clear first, then apply.
    Object.keys(state.seatAssignments).forEach((gid) => actions.assignSeat(gid, null));
    Object.entries(proposal.assignments).forEach(([gid, tid]) => actions.assignSeat(gid, tid));
    setProposal(null);
  };

  // ─── Drag & drop: move a guest between tables / to unassigned ───
  const handleDropOnTable = (tableId: string, guestId: string) => {
    if (!guestId) return;
    actions.assignSeat(guestId, tableId);
  };
  const handleDropOnUnassigned = (guestId: string) => {
    if (!guestId) return;
    actions.assignSeat(guestId, null);
  };

  const activeTable = state.tables.find((t) => t.id === activeTableId);
  const activeRow = activeTable
    ? tablesWithGuests.find((r) => r.table.id === activeTableId)
    : null;

  if (!hydrated || !state.event) {
    return (
      <>
        <Header />
        <SeatingSkeleton />
      </>
    );
  }

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
              <button
                onClick={() => setFlatView((v) => !v)}
                className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"
                aria-label="החלף תצוגה"
              >
                {flatView ? <Layers size={14} /> : <Eye size={14} />} {flatView ? "תצוגה תלת-מימדית" : "תצוגה שטוחה"}
              </button>
              <button
                onClick={() => runSmartArrangement()}
                disabled={state.tables.length === 0 || eligibleGuests.length === 0 || thinking}
                className="btn-gold text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-40"
                aria-label="סדר אוטומטית"
              >
                {thinking ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {thinking ? "חושב..." : "✨ סדר אוטומטית"}
              </button>
              <PrintButton label="ייצא ל-PDF" />
              <button onClick={() => setShowAddTable(true)} className="btn-gold text-sm py-2 px-4 inline-flex items-center gap-2">
                <Plus size={14} /> שולחן חדש
              </button>
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
              {/* 3D Floor */}
              <div className="floor-3d">
                <div className={`floor-3d-inner ${flatView ? "flat" : ""} ${activeTableId ? "has-focused" : ""} floor-grid p-8 md:p-12`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-16 md:gap-y-24">
                    {tablesWithGuests.map(({ table, heads }) => (
                      <Table3D
                        key={table.id}
                        table={table}
                        heads={heads}
                        active={activeTableId === table.id}
                        onClick={() => setActiveTableId(table.id)}
                        onDropGuest={(gid) => handleDropOnTable(table.id, gid)}
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

        {showAddTable && <TableModal onClose={() => setShowAddTable(false)} />}
        {editingTable && <TableModal table={editingTable} onClose={() => setEditingTable(null)} />}
        {thinking && <ThinkingOverlay />}
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

function ThinkingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="card-gold p-8 max-w-sm text-center scale-in">
        <div className="inline-flex w-16 h-16 rounded-full items-center justify-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-gold)" }}>
          <Sparkles size={32} className="text-[--accent] animate-pulse" />
        </div>
        <h3 className="mt-5 text-xl font-bold gradient-gold">מסדר את האורחים...</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          בודק קבוצות, גילאים, התנגשויות ובקשות להושיב יחד.
        </p>
        <div className="mt-5 flex items-center justify-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[--accent] animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-[--accent] animate-bounce" style={{ animationDelay: "120ms" }} />
          <span className="w-2 h-2 rounded-full bg-[--accent] animate-bounce" style={{ animationDelay: "240ms" }} />
        </div>
      </div>
    </div>
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

/** A 3D-looking table with chairs around its perimeter. Filled chairs = seated guests. */
function Table3D({
  table,
  heads,
  active,
  onClick,
  onDropGuest,
}: {
  table: SeatingTable;
  heads: number;
  active: boolean;
  onClick: () => void;
  onDropGuest: (guestId: string) => void;
}) {
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
      onClick={onClick}
      className={`table-3d ${active ? "active" : ""} ${stateClass} ${dragOver ? "drag-over" : ""}`}
      // Chain entrance + idle: stagger entrance per-table, then settle into the float loop.
      style={{
        animation: "table-enter 700ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards, table-float 6s ease-in-out infinite",
        animationDelay: `${(table.id.charCodeAt(0) % 7) * 0.08}s, ${(table.id.charCodeAt(0) % 5) * 0.4 + 0.7}s`,
      } as CSSProperties}
      aria-label={`שולחן ${table.name} — אפשר לגרור אורח לכאן`}
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
        const gid = e.dataTransfer.getData(DRAG_MIME);
        setDragOver(false);
        if (gid) onDropGuest(gid);
      }}
    >
      <div className="surface relative">
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
        <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>שולחן</div>
        <div className="font-bold mt-0.5 text-sm md:text-base text-center max-w-[80%] leading-tight px-1">{table.name}</div>
        <div className="text-xs ltr-num mt-1 font-semibold" style={{ color: overCapacity ? "rgb(252 165 165)" : fullness >= 1 ? "var(--accent)" : "var(--foreground-soft)" }}>
          {heads} / {table.capacity}
        </div>
      </div>
    </button>
  );
}

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
        const gid = e.dataTransfer.getData(DRAG_MIME);
        setDragOver(false);
        if (gid) onDropGuest(gid);
      }}
      aria-label="אזור אורחים ללא שולחן — אפשר לגרור לכאן כדי להוציא משולחן"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">ללא שולחן</h2>
        <span className="pill pill-muted">{guests.length}</span>
      </div>
      {guests.length === 0 ? (
        <div className="text-sm py-4 text-center" style={{ color: "var(--foreground-muted)" }}>
          🎉 כל האורחים מסודרים!
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {guests.map((g) => (
            <div
              key={g.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, g.id)}
              className="rounded-xl p-2.5 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
              aria-label={`גרור את ${g.name} לשולחן`}
            >
              <Avatar name={g.name} id={g.id} size={28} />
              <span className="flex-1 truncate">{g.name}</span>
              {(g.attendingCount || 1) > 1 && <span className="ltr-num text-[--accent] text-xs font-bold">+{(g.attendingCount || 1) - 1}</span>}
            </div>
          ))}
        </div>
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
        <div>
          <div className="font-bold text-lg">{table.name}</div>
          <div className="text-xs ltr-num" style={{ color: overCapacity ? "rgb(252 165 165)" : "var(--foreground-muted)" }}>
            {heads} / {table.capacity} מקומות
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

      {/* Seated guests */}
      {guests.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {guests.map((g) => (
            <div
              key={g.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, g.id)}
              className="rounded-xl p-2 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
              aria-label={`גרור את ${g.name} כדי להעביר לשולחן אחר`}
            >
              <CheckCircle2 size={14} className="text-[--accent] shrink-0" />
              <span className="flex-1 truncate">{g.name}</span>
              {(g.attendingCount || 1) > 1 && <span className="ltr-num text-[--accent] text-xs font-bold">+{(g.attendingCount || 1) - 1}</span>}
              <button onClick={() => actions.assignSeat(g.id, null)} className="hover:text-red-400 p-1" style={{ color: "var(--foreground-muted)" }} aria-label="הסר משולחן">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-center py-3 rounded-xl mb-3" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)" }}>
          השולחן ריק. הוסף אורחים למטה.
        </div>
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
                {(g.attendingCount || 1) > 1 && <span className="ltr-num text-xs">+{(g.attendingCount || 1) - 1}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TableModal({ table, onClose }: { table?: SeatingTable; onClose: () => void }) {
  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 10));
  const [namesText, setNamesText] = useState("");
  const isValid = name.trim().length > 0 && Number(capacity) > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!isValid) return;
    if (table) {
      actions.updateTable(table.id, { name: name.trim(), capacity: Number(capacity) });
    } else {
      const newTable = actions.addTable(name.trim(), Number(capacity));
      const names = namesText
        .split(/[\n,]+/)
        .map((n) => n.trim())
        .filter(Boolean);
      for (const guestName of names) {
        const guest = actions.addGuest({ name: guestName, phone: "", attendingCount: 1 });
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
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>מקומות (כמה אנשים יושבים)</label>
            <input className="input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
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
