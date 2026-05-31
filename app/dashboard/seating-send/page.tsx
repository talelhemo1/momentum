"use client";

/**
 * R98 — Bulletproof seating-notification wizard.
 *
 * A 4-step flow that lets a host WhatsApp every seated + confirmed guest their
 * table number, with zero duplicates / zero stale-table mistakes:
 *   1. Prepare  — confirm reception time + venue, then LOCK a snapshot.
 *   2. Review   — red/yellow/green per-table validation, approve the good ones.
 *   3. Send     — final human confirmation.
 *   4. Track    — live progress (Realtime + polling) with a retry button.
 *
 * All heavy lifting is server-side (see app/api/seating/* + lib/seating-server).
 * The page reads the live event state from the local store only to render
 * step-1 counts and the per-table guest drawer; the server always revalidates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Send,
  RefreshCw,
  Sparkles,
  Users,
  MapPin,
  Clock,
  ChevronLeft,
  PartyPopper,
} from "lucide-react";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { useAppState } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import {
  guestsForTable,
  tableNumberOf,
  type TableValidation,
  type SeatingSummary,
} from "@/lib/seating-validation";

// ── response shapes ─────────────────────────────────────────────────────────
interface PreviewTable extends TableValidation {
  approved: boolean;
}
interface PreviewResponse {
  session: {
    id: string;
    status: string;
    reception_time: string;
    venue: string;
    total_guests: number;
    total_tables: number;
    sent_count: number;
    failed_count: number;
  };
  summary: SeatingSummary;
  tables: PreviewTable[];
  samples: { guestName: string; tableNumber: number; text: string }[];
  revokedTables: number[];
  diagnostics: {
    templateConfigured: boolean;
    whatsappConfigured: boolean;
    sandbox: boolean;
  };
}
interface StatusResponse {
  session: {
    id: string;
    status: string;
    total_guests: number;
    sent_count: number;
    failed_count: number;
    completed_at: string | null;
  };
  counts: {
    total: number;
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    retrying: number;
  };
  recent: {
    guest_name: string;
    table_number: number;
    status: string;
    error_message: string | null;
    sent_at: string | null;
  }[];
}

type Step = 1 | 2 | 3 | 4;

// ── auth header helper ───────────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function SeatingSendPage() {
  const { state, hydrated } = useAppState();
  const event = state.event;

  const [step, setStep] = useState<Step>(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [receptionTime, setReceptionTime] = useState("19:00");
  const [venue, setVenue] = useState("");
  const [busy, setBusy] = useState(false);

  // Default the venue from the event once hydrated.
  useEffect(() => {
    if (event && !venue) {
      const v = [event.synagogue, event.city]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      if (v) setVenue(v);
    }
  }, [event, venue]);

  // ── step-1 local stats (display only; server revalidates) ─────────────────
  const stats = useMemo(() => {
    const seated = state.guests.filter((g) => state.seatAssignments[g.id]);
    const confirmedSeated = seated.filter((g) => g.status === "confirmed");
    return {
      totalGuests: state.guests.length,
      tables: state.tables.length,
      seated: seated.length,
      unseated: state.guests.length - seated.length,
      confirmedSeated: confirmedSeated.length,
    };
  }, [state.guests, state.tables, state.seatAssignments]);

  // ── step-2 preview state ──────────────────────────────────────────────────
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [activeTable, setActiveTable] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const loadPreview = useCallback(async (sid: string) => {
    setLoadingPreview(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        showToast("נדרשת התחברות מחדש", "error");
        return;
      }
      const res = await fetch(`/api/seating/preview?session_id=${sid}`, {
        headers,
      });
      const data = (await res.json()) as PreviewResponse & { error?: string };
      if (!res.ok) {
        showToast("טעינת הסקירה נכשלה", "error");
        return;
      }
      setPreview(data);
      if (data.revokedTables.length > 0) {
        showToast(
          `⚠️ ${data.revokedTables.length} שולחנות דורשים אישור מחדש (השיוך השתנה)`,
          "error",
        );
      }
    } catch {
      showToast("שגיאת רשת בטעינת הסקירה", "error");
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  // ── step-1: lock ──────────────────────────────────────────────────────────
  const doLock = useCallback(async () => {
    setBusy(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        showToast("נדרשת התחברות מחדש", "error");
        return;
      }
      const res = await fetch("/api/seating/lock", {
        method: "POST",
        headers,
        body: JSON.stringify({ reception_time: receptionTime, venue }),
      });
      const data = (await res.json()) as {
        session_id?: string;
        reused?: boolean;
        error?: string;
      };
      if (!res.ok || !data.session_id) {
        showToast(
          data.error === "no_tables"
            ? "אין שולחנות — סדרו הושבה קודם"
            : "נעילת הרשימה נכשלה",
          "error",
        );
        return;
      }
      setSessionId(data.session_id);
      if (data.reused) showToast("ממשיכים מהפעלה קיימת", "success");
      setStep(2);
      await loadPreview(data.session_id);
    } catch {
      showToast("שגיאת רשת בנעילה", "error");
    } finally {
      setBusy(false);
    }
  }, [receptionTime, venue, loadPreview]);

  // ── step-2: approvals ─────────────────────────────────────────────────────
  const approveTables = useCallback(
    async (numbers: number[]) => {
      if (!sessionId || numbers.length === 0) return;
      setBusy(true);
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const res = await fetch("/api/seating/approve-tables", {
          method: "POST",
          headers,
          body: JSON.stringify({ session_id: sessionId, table_numbers: numbers }),
        });
        const data = (await res.json()) as {
          approved?: number;
          rejected?: number[];
          error?: string;
        };
        if (!res.ok) {
          showToast("האישור נכשל", "error");
          return;
        }
        if (data.rejected && data.rejected.length > 0) {
          showToast(`${data.rejected.length} שולחנות נדחו (יש בהם שגיאה)`, "error");
        }
        await loadPreview(sessionId);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, loadPreview],
  );

  const approveAllReady = useCallback(() => {
    if (!preview) return;
    const ready = preview.tables
      .filter((t) => t.status !== "error" && t.sendableCount > 0 && !t.approved)
      .map((t) => t.tableNumber);
    if (ready.length === 0) {
      showToast("אין שולחנות חדשים לאישור", "success");
      return;
    }
    void approveTables(ready);
  }, [preview, approveTables]);

  // Continue is allowed once every sendable, non-error table is approved and
  // at least one approved table actually has someone to message.
  const canContinue = useMemo(() => {
    if (!preview) return false;
    const blocking = preview.tables.filter(
      (t) => t.status !== "error" && t.sendableCount > 0 && !t.approved,
    );
    const approvedSendable = preview.tables.filter(
      (t) => t.approved && t.sendableCount > 0,
    );
    return blocking.length === 0 && approvedSendable.length > 0;
  }, [preview]);

  const approvedSummary = useMemo(() => {
    if (!preview) return { tables: 0, guests: 0 };
    const approved = preview.tables.filter((t) => t.approved && t.sendableCount > 0);
    return {
      tables: approved.length,
      guests: approved.reduce((s, t) => s + t.sendableCount, 0),
    };
  }, [preview]);

  // ── step-3: send ──────────────────────────────────────────────────────────
  const doSend = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/seating/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = (await res.json()) as { queued?: number; error?: string };
      if (!res.ok) {
        const msg: Record<string, string> = {
          template_not_configured: "תבנית ה-WhatsApp לשליחת הושבה לא מאושרת עדיין",
          whatsapp_not_configured: "WhatsApp לא מחובר",
          no_approved_tables: "אין שולחנות מאושרים לשליחה",
          no_sendable_guests: "אין מוזמנים מאושרים לשליחה בשולחנות שאישרת",
        };
        showToast(msg[data.error ?? ""] ?? "השליחה נכשלה", "error");
        return;
      }
      setStep(4);
    } catch {
      showToast("שגיאת רשת בשליחה", "error");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  // ── step-4: live tracking (pump + poll + realtime) ────────────────────────
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const pumpingRef = useRef(false);
  const stoppedRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!sessionId) return;
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch(`/api/seating/status?session_id=${sessionId}`, {
      headers,
    });
    if (res.ok) setStatus((await res.json()) as StatusResponse);
  }, [sessionId]);

  const pump = useCallback(
    async (retry = false) => {
      if (!sessionId || pumpingRef.current) return;
      pumpingRef.current = true;
      stoppedRef.current = false;
      try {
        const headers = await authHeaders();
        if (!headers) return;
        // Drain batches until nothing is claimable right now.
        // The server throttles internally; we pause briefly between batches.
        let guard = 0;
        let body = JSON.stringify({ session_id: sessionId, retry });
        while (!stoppedRef.current && guard < 500) {
          guard += 1;
          const res = await fetch("/api/seating/worker", {
            method: "POST",
            headers,
            body,
          });
          if (!res.ok) break;
          const data = (await res.json()) as { remaining?: number };
          await refreshStatus();
          if ((data.remaining ?? 0) <= 0) break;
          body = JSON.stringify({ session_id: sessionId }); // retry only on first pass
          await new Promise((r) => setTimeout(r, 400));
        }
      } finally {
        pumpingRef.current = false;
        await refreshStatus();
      }
    },
    [sessionId, refreshStatus],
  );

  // On entering step 4: start the pump, poll as a safety net, and subscribe to
  // Realtime so external worker (cron) progress shows up live too.
  useEffect(() => {
    if (step !== 4 || !sessionId) return;
    stoppedRef.current = false;
    void pump();

    const poll = setInterval(refreshStatus, 3000);

    // Realtime is an enhancement on top of the 3s poll — if the publication
    // isn't set up, the subscription is simply inert and polling carries it.
    const supabase = getSupabase();
    const channel = supabase
      ? supabase
          .channel(`seating-${sessionId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "seating_notifications",
              filter: `session_id=eq.${sessionId}`,
            },
            () => {
              void refreshStatus();
            },
          )
          .subscribe()
      : null;

    return () => {
      stoppedRef.current = true;
      clearInterval(poll);
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [step, sessionId, pump, refreshStatus]);

  // ── guards ────────────────────────────────────────────────────────────────
  if (!hydrated) {
    return (
      <>
        <Header />
        <main className="flex-1 grid place-items-center py-32">
          <Loader2 className="animate-spin" style={{ color: "var(--accent)" }} />
        </main>
      </>
    );
  }
  if (!event) return <EmptyEventState toolName="שליחת הושבה ב-WhatsApp" />;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Header />
      <main className="flex-1 pb-32 relative overflow-hidden">
        <div
          aria-hidden
          className="glow-orb glow-orb-gold w-[700px] h-[700px] -top-40 right-0 opacity-25"
        />
        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link
            href="/seating"
            className="text-sm hover:text-white inline-flex items-center gap-1.5"
            style={{ color: "var(--foreground-muted)" }}
          >
            <ArrowRight size={14} /> חזרה לסידורי ההושבה
          </Link>

          <h1
            className="mt-6 text-2xl sm:text-3xl font-extrabold"
            style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--accent)" }}
          >
            שליחת מספרי שולחן ב-WhatsApp
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--foreground-muted)" }}>
            נעילה → אישור פר שולחן → שליחה מבוקרת. בלי כפילויות, בלי טעויות.
          </p>

          <Stepper step={step} />

          {step === 1 && (
            <PrepareStep
              stats={stats}
              receptionTime={receptionTime}
              setReceptionTime={setReceptionTime}
              venue={venue}
              setVenue={setVenue}
              busy={busy}
              onLock={doLock}
            />
          )}

          {step === 2 && (
            <ReviewStep
              preview={preview}
              loading={loadingPreview}
              busy={busy}
              search={search}
              setSearch={setSearch}
              activeTable={activeTable}
              setActiveTable={setActiveTable}
              onApproveAll={approveAllReady}
              onApproveOne={(n) => approveTables([n])}
              onRefresh={() => sessionId && loadPreview(sessionId)}
              canContinue={canContinue}
              onContinue={() => setStep(3)}
              guestsForTableNumber={(num) => {
                const table = state.tables.find(
                  (t) => tableNumberOf(t, state.tables) === num,
                );
                if (!table) return [];
                return guestsForTable(table.id, state.guests, state.seatAssignments);
              }}
            />
          )}

          {step === 3 && (
            <SendStep
              approvedTables={approvedSummary.tables}
              approvedGuests={approvedSummary.guests}
              busy={busy}
              onBack={() => setStep(2)}
              onSend={doSend}
            />
          )}

          {step === 4 && (
            <TrackStep
              status={status}
              onRetry={() => pump(true)}
              pumping={pumpingRef.current}
            />
          )}
        </div>
      </main>
    </>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ step }: { step: Step }) {
  const labels = ["הכנה", "סקירה", "שליחה", "מעקב"];
  return (
    <div className="mt-6 flex items-center gap-2" aria-label={`שלב ${step} מתוך 4`}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: active
                  ? "var(--accent)"
                  : done
                    ? "color-mix(in srgb, var(--accent) 22%, transparent)"
                    : "var(--background-2)",
                color: active ? "#1a1206" : "var(--foreground)",
              }}
            >
              <span
                className="grid place-items-center w-5 h-5 rounded-full text-[11px]"
                style={{
                  background: active ? "#1a1206" : "transparent",
                  color: active ? "var(--accent)" : "inherit",
                  border: active ? "none" : "1px solid var(--border)",
                }}
              >
                {done ? "✓" : n}
              </span>
              {label}
            </div>
            {i < labels.length - 1 && (
              <ChevronLeft size={14} style={{ color: "var(--foreground-muted)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 ─────────────────────────────────────────────────────────────────────
function PrepareStep({
  stats,
  receptionTime,
  setReceptionTime,
  venue,
  setVenue,
  busy,
  onLock,
}: {
  stats: {
    totalGuests: number;
    tables: number;
    seated: number;
    unseated: number;
    confirmedSeated: number;
  };
  receptionTime: string;
  setReceptionTime: (v: string) => void;
  venue: string;
  setVenue: (v: string) => void;
  busy: boolean;
  onLock: () => void;
}) {
  return (
    <div className="mt-7 card p-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<Users size={16} />} label="מוזמנים" value={stats.totalGuests} />
        <Stat icon={<MapPin size={16} />} label="שולחנות" value={stats.tables} />
        <Stat
          icon={<CheckCircle2 size={16} />}
          label="מאושרים ומושבים"
          value={stats.confirmedSeated}
        />
        <Stat
          icon={<AlertTriangle size={16} />}
          label="ללא שיוך"
          value={stats.unseated}
          warn={stats.unseated > 0}
        />
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Clock size={14} /> שעת קבלת פנים
          </span>
          <input
            type="time"
            value={receptionTime}
            onChange={(e) => setReceptionTime(e.target.value)}
            className="mt-1.5 w-full rounded-lg px-3 py-2 ltr-num"
            style={{ background: "var(--background-2)", border: "1px solid var(--border)" }}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold inline-flex items-center gap-1.5">
            <MapPin size={14} /> שם המקום
          </span>
          <input
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="אולם / גן האירועים · עיר"
            className="mt-1.5 w-full rounded-lg px-3 py-2"
            style={{ background: "var(--background-2)", border: "1px solid var(--border)" }}
          />
        </label>
      </div>

      {stats.unseated > 0 && (
        <p className="mt-4 text-xs" style={{ color: "var(--foreground-muted)" }}>
          ℹ️ {stats.unseated} מוזמנים עדיין ללא שולחן — הם לא יקבלו הודעה. אפשר
          להשלים שיוך ב<Link href="/seating" className="underline">סידורי ההושבה</Link>.
        </p>
      )}

      <button
        type="button"
        onClick={onLock}
        disabled={busy || stats.tables === 0}
        className="btn-gold mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        נעל רשימה והתחל
      </button>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: "var(--background-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="inline-flex items-center gap-1.5 text-xs"
        style={{ color: warn ? "#e0a800" : "var(--foreground-muted)" }}
      >
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold ltr-num mt-0.5">{value}</div>
    </div>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────────
function ReviewStep({
  preview,
  loading,
  busy,
  search,
  setSearch,
  activeTable,
  setActiveTable,
  onApproveAll,
  onApproveOne,
  onRefresh,
  canContinue,
  onContinue,
  guestsForTableNumber,
}: {
  preview: PreviewResponse | null;
  loading: boolean;
  busy: boolean;
  search: string;
  setSearch: (v: string) => void;
  activeTable: number | null;
  setActiveTable: (n: number | null) => void;
  onApproveAll: () => void;
  onApproveOne: (n: number) => void;
  onRefresh: () => void;
  canContinue: boolean;
  onContinue: () => void;
  guestsForTableNumber: (
    num: number,
  ) => { id: string; name: string; phone: string; status: string }[];
}) {
  if (loading || !preview) {
    return (
      <div className="mt-7 card p-10 grid place-items-center">
        <Loader2 className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  const { summary, tables, samples, diagnostics } = preview;
  const filtered = search.trim()
    ? tables.filter(
        (t) =>
          String(t.tableNumber).includes(search.trim()) ||
          (t.tableName ?? "").includes(search.trim()),
      )
    : tables;
  const active = activeTable != null ? tables.find((t) => t.tableNumber === activeTable) : null;

  return (
    <div className="mt-7 space-y-5">
      {/* diagnostics banner */}
      {(!diagnostics.templateConfigured || !diagnostics.whatsappConfigured || diagnostics.sandbox) && (
        <div
          className="card p-4 text-sm"
          style={{ borderColor: "#e0a800", background: "rgba(224,168,0,0.08)" }}
        >
          <strong>שימו לב לפני שליחה:</strong>
          <ul className="mt-1 list-disc pr-5 space-y-0.5">
            {!diagnostics.whatsappConfigured && <li>WhatsApp עדיין לא מחובר.</li>}
            {!diagnostics.templateConfigured && (
              <li>תבנית ההושבה (event_seating_he) טרם אושרה / הוגדרה.</li>
            )}
            {diagnostics.sandbox && (
              <li>המספר במצב Sandbox — רק מי שהצטרף ידנית יקבל הודעה.</li>
            )}
          </ul>
        </div>
      )}

      {/* 3 summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          tone="ok"
          icon={<CheckCircle2 size={18} />}
          label="תקינים"
          value={summary.okTables}
        />
        <SummaryCard
          tone="warn"
          icon={<AlertTriangle size={18} />}
          label="דורש תשומת לב"
          value={summary.warningTables}
        />
        <SummaryCard
          tone="err"
          icon={<XCircle size={18} />}
          label="חסום"
          value={summary.errorTables}
        />
      </div>

      {/* sample messages */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">דגימת הודעות</h3>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs inline-flex items-center gap-1 hover:text-white"
            style={{ color: "var(--foreground-muted)" }}
          >
            <RefreshCw size={12} /> רענן דגימה
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {samples.length === 0 && (
            <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              אין עדיין מוזמנים מאושרים עם שולחן לדגימה.
            </p>
          )}
          {samples.map((s, i) => (
            <div
              key={i}
              className="rounded-xl p-3 text-sm"
              style={{ background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.25)" }}
            >
              {s.text}
            </div>
          ))}
        </div>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="מצא שולחן (מספר או שם)…"
          className="flex-1 min-w-[180px] rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--background-2)", border: "1px solid var(--border)" }}
        />
        <button
          type="button"
          onClick={onApproveAll}
          disabled={busy}
          className="btn-secondary inline-flex items-center gap-2 disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          אשר את כל התקינים
        </button>
      </div>

      {/* table list */}
      <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
        {filtered.map((t) => (
          <button
            key={t.tableNumber}
            type="button"
            onClick={() => setActiveTable(t.tableNumber)}
            className="w-full flex items-center gap-3 p-3 text-right hover:bg-white/5 transition"
          >
            <StatusDot status={t.status} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                שולחן {t.tableNumber}
                {t.tableName ? ` — ${t.tableName}` : ""}
              </div>
              <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                {t.guestCount} מוזמנים · {t.sendableCount} יקבלו הודעה
                {t.issues.length > 0 && ` · ${t.issues[0].message}`}
              </div>
            </div>
            {t.approved ? (
              <span className="text-xs font-bold inline-flex items-center gap-1" style={{ color: "#25d366" }}>
                <CheckCircle2 size={14} /> מאושר
              </span>
            ) : (
              <ChevronLeft size={16} style={{ color: "var(--foreground-muted)" }} />
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm" style={{ color: "var(--foreground-muted)" }}>
            לא נמצאו שולחנות.
          </div>
        )}
      </div>

      {/* continue */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
          {canContinue
            ? "הכול מאושר — אפשר להמשיך."
            : "אשרו את כל השולחנות התקינים כדי להמשיך."}
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="btn-gold inline-flex items-center gap-2 disabled:opacity-40"
        >
          המשך לשליחה <ArrowRight size={16} />
        </button>
      </div>

      {/* drawer */}
      {active && (
        <TableDrawer
          table={active}
          guests={guestsForTableNumber(active.tableNumber)}
          busy={busy}
          onApprove={() => onApproveOne(active.tableNumber)}
          onClose={() => setActiveTable(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  tone,
  icon,
  label,
  value,
}: {
  tone: "ok" | "warn" | "err";
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const colors = {
    ok: { fg: "#25d366", bg: "rgba(37,211,102,0.10)" },
    warn: { fg: "#e0a800", bg: "rgba(224,168,0,0.10)" },
    err: { fg: "#ef4444", bg: "rgba(239,68,68,0.10)" },
  }[tone];
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: colors.bg, border: `1px solid ${colors.fg}33` }}
    >
      <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: colors.fg }}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold ltr-num mt-0.5">{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: "ok" | "warning" | "error" }) {
  const c = status === "ok" ? "#25d366" : status === "warning" ? "#e0a800" : "#ef4444";
  return (
    <span
      className="inline-block w-3 h-3 rounded-full shrink-0"
      style={{ background: c, boxShadow: `0 0 8px ${c}88` }}
      aria-label={status}
    />
  );
}

function TableDrawer({
  table,
  guests,
  busy,
  onApprove,
  onClose,
}: {
  table: PreviewTable;
  guests: { id: string; name: string; phone: string; status: string }[];
  busy: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal>
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div
        className="w-full max-w-sm h-full overflow-y-auto p-5"
        style={{ background: "var(--background)", borderInlineStart: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold">
            שולחן {table.tableNumber}
            {table.tableName ? ` — ${table.tableName}` : ""}
          </h3>
          <button type="button" onClick={onClose} aria-label="סגור" className="hover:text-white">
            <XCircle size={20} />
          </button>
        </div>

        {table.issues.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {table.issues.map((iss, i) => (
              <li
                key={i}
                className="text-xs rounded-lg px-2.5 py-1.5"
                style={{
                  background:
                    iss.severity === "error" ? "rgba(239,68,68,0.10)" : "rgba(224,168,0,0.10)",
                  color: iss.severity === "error" ? "#ef4444" : "#e0a800",
                }}
              >
                {iss.message}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 text-xs font-semibold" style={{ color: "var(--foreground-muted)" }}>
          מוזמנים ({guests.length})
        </div>
        <ul className="mt-2 space-y-1">
          {guests.map((g) => (
            <li key={g.id} className="flex items-center justify-between text-sm py-1">
              <span>{g.name}</span>
              <span
                className="text-xs ltr-num"
                style={{ color: g.status === "confirmed" ? "#25d366" : "var(--foreground-muted)" }}
              >
                {g.status === "confirmed" ? "אישר/ה" : "—"} · {g.phone || "ללא טלפון"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy || table.status === "error"}
            className="btn-gold flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-40"
            title={table.status === "error" ? "יש לתקן את השגיאות קודם" : ""}
          >
            <CheckCircle2 size={15} />
            {table.approved ? "אושר מחדש" : "אשר שולחן זה"}
          </button>
          <Link href="/seating" className="btn-secondary inline-flex items-center justify-center gap-2">
            תקן בהושבה
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────────────────
function SendStep({
  approvedTables,
  approvedGuests,
  busy,
  onBack,
  onSend,
}: {
  approvedTables: number;
  approvedGuests: number;
  busy: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  return (
    <div className="mt-7 card p-8 text-center">
      <div
        className="mx-auto w-14 h-14 rounded-full grid place-items-center"
        style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)" }}
      >
        <Send size={24} style={{ color: "var(--accent)" }} />
      </div>
      <h2 className="mt-4 text-lg font-bold">אישור אחרון לפני שליחה</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--foreground-muted)" }}>
        עומדים לשלוח הודעת WhatsApp עם מספר השולחן ל-
        <strong className="ltr-num"> {approvedGuests} </strong>
        מוזמנים, ב-
        <strong className="ltr-num"> {approvedTables} </strong>
        שולחנות מאושרים.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button type="button" onClick={onBack} className="btn-secondary">
          חזרה לסקירה
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={busy || approvedGuests === 0}
          className="btn-gold inline-flex items-center gap-2 disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          🚀 שלח עכשיו
        </button>
      </div>
    </div>
  );
}

// ── Step 4 ─────────────────────────────────────────────────────────────────────
function TrackStep({
  status,
  onRetry,
  pumping,
}: {
  status: StatusResponse | null;
  onRetry: () => void;
  pumping: boolean;
}) {
  if (!status) {
    return (
      <div className="mt-7 card p-10 grid place-items-center">
        <Loader2 className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  const { counts, session } = status;
  const done = counts.total > 0 ? counts.sent + counts.failed : 0;
  const pct = counts.total > 0 ? Math.round((done / counts.total) * 100) : 0;
  const finished = session.status === "completed";
  const pendingRetry = counts.retrying > 0;

  return (
    <div className="mt-7 space-y-5">
      {finished && counts.failed === 0 && (
        <div
          className="card p-6 text-center"
          style={{ background: "rgba(37,211,102,0.10)", borderColor: "rgba(37,211,102,0.3)" }}
        >
          <PartyPopper size={28} className="mx-auto" style={{ color: "#25d366" }} />
          <h2 className="mt-2 font-bold">כל ההודעות נשלחו! 🎉</h2>
          <p className="text-sm mt-1" style={{ color: "var(--foreground-muted)" }}>
            {counts.sent} מוזמנים קיבלו את מספר השולחן שלהם.
          </p>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">
            {finished ? "הושלם" : pumping ? "שולח…" : "מעקב שליחה"}
          </span>
          <span className="ltr-num" style={{ color: "var(--foreground-muted)" }}>
            {done}/{counts.total}
          </span>
        </div>
        <div
          className="mt-3 h-3 rounded-full overflow-hidden"
          style={{ background: "var(--background-2)" }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--accent), #25d366)",
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
          <Tally label="נשלחו" value={counts.sent} color="#25d366" />
          <Tally label="ממתינות" value={counts.queued + counts.sending} color="var(--foreground)" />
          <Tally label="ניסיון חוזר" value={counts.retrying} color="#e0a800" />
          <Tally label="נכשלו" value={counts.failed} color="#ef4444" />
        </div>
      </div>

      {pendingRetry && !pumping && (
        <p className="text-xs text-center" style={{ color: "var(--foreground-muted)" }}>
          {counts.retrying} הודעות ממתינות לניסיון חוזר אוטומטי (גם אם תסגרו את העמוד).
        </p>
      )}

      {/* live feed */}
      <div className="card p-4">
        <h3 className="font-bold text-sm">פעילות אחרונה</h3>
        <ul className="mt-3 space-y-1.5">
          {status.recent.map((r, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2">
                <FeedDot status={r.status} />
                {r.guest_name} · שולחן {r.table_number}
              </span>
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                {r.status === "sent"
                  ? "נשלח"
                  : r.status === "failed"
                    ? r.error_message?.slice(0, 30) || "נכשל"
                    : r.status === "retrying"
                      ? "ניסיון חוזר"
                      : "בתור"}
              </span>
            </li>
          ))}
          {status.recent.length === 0 && (
            <li className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              אין עדיין פעילות.
            </li>
          )}
        </ul>
      </div>

      {counts.failed > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "#ef4444" }}>
            {counts.failed} הודעות נכשלו.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={pumping}
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-40"
          >
            <RefreshCw size={14} /> נסה שוב את הכשלונות
          </button>
        </div>
      )}

      <div className="text-center">
        <Link href="/seating" className="text-sm underline" style={{ color: "var(--foreground-muted)" }}>
          חזרה לסידורי ההושבה
        </Link>
      </div>
    </div>
  );
}

function Tally({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-lg py-2"
      style={{ background: "var(--background-2)", border: "1px solid var(--border)" }}
    >
      <div className="text-lg font-extrabold ltr-num" style={{ color }}>
        {value}
      </div>
      <div style={{ color: "var(--foreground-muted)" }}>{label}</div>
    </div>
  );
}

function FeedDot({ status }: { status: string }) {
  const c =
    status === "sent"
      ? "#25d366"
      : status === "failed"
        ? "#ef4444"
        : status === "retrying"
          ? "#e0a800"
          : "var(--foreground-muted)";
  return (
    <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} aria-hidden />
  );
}
