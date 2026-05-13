"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState, GuestArrival, ManagerAction } from "@/lib/types";
import {
  buildEventReport,
  exportReportToCSV,
  type EventReportData,
} from "@/lib/eventReport";
import { buildThankYouMessage } from "@/lib/thankYouMessages";
import {
  ArrowRight,
  Loader2,
  Award,
  Users,
  PartyPopper,
  Download,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from "lucide-react";

/**
 * R20 Phase 6 — post-event report.
 *
 * Auth: open to BOTH the host (event_managers.invited_by) and any accepted
 * manager (event_managers.user_id). Done with .or() so a single round-trip
 * answers either side. Falls back to the dashboard route if neither matches.
 *
 * Data: local AppState provides the guest list, tables, and event title;
 * Supabase provides arrivals + actions. Aggregation lives in lib/eventReport.
 */
export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [authorized, setAuthorized] = useState(false);
  const [report, setReport] = useState<EventReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<"arrived" | "noshow" | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace(`/manage/${eventId}`);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace(`/manage/${eventId}`);
        return;
      }
      // Host OR accepted manager — host is whoever sent the manager invite
      // (event_managers.invited_by = host's user_id).
      const { data: m } = (await supabase
        .from("event_managers")
        .select("id")
        .eq("event_id", eventId)
        .or(`user_id.eq.${user.id},invited_by.eq.${user.id}`)
        .maybeSingle()) as { data: { id: string } | null };
      if (cancelled) return;
      if (!m) {
        router.replace(`/manage/${eventId}`);
        return;
      }
      setAuthorized(true);

      // Pull arrivals + actions in parallel.
      const [arrivalsRes, actionsRes] = await Promise.all([
        supabase
          .from("guest_arrivals")
          .select("id, event_id, guest_id, arrived_at, marked_by, plus_ones, notes")
          .eq("event_id", eventId),
        supabase
          .from("manager_actions")
          .select("id, event_id, manager_id, action_type, payload, created_at")
          .eq("event_id", eventId),
      ]);
      if (cancelled) return;
      const arrivals = (arrivalsRes.data ?? []) as GuestArrival[];
      const actions = (actionsRes.data ?? []) as ManagerAction[];

      let state: Partial<AppState> | null = null;
      try {
        const stateRaw = localStorage.getItem(STORAGE_KEYS.app);
        if (stateRaw) {
          const parsed = JSON.parse(stateRaw) as Partial<AppState>;
          if (parsed.event?.id === eventId) state = parsed;
        }
      } catch (e) {
        console.error("[manage/report] failed to read local state", e);
      }

      const built = state
        ? buildEventReport({ state, arrivals, actions })
        : null;
      setReport(built);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, router]);

  if (!authorized || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!report) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <p className="font-semibold">לא נטענו פרטי האירוע במכשיר הזה</p>
          <p className="mt-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
            בקש מהמארחים לפתוח את האפליקציה במכשיר הזה פעם אחת.
          </p>
          <Link
            href={`/manage/${eventId}`}
            className="text-xs underline mt-4 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לדשבורד
          </Link>
        </div>
      </main>
    );
  }

  const downloadCSV = () => {
    const csv = exportReportToCSV(report);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `momentum-report-${report.eventId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const subjects = report.partnerName
    ? `${report.hostName} ו-${report.partnerName}`
    : report.hostName;

  return (
    <main className="min-h-screen pb-20">
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            href={`/manage/${eventId}`}
            aria-label="חזרה לדשבורד"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <ArrowRight size={20} aria-hidden />
          </Link>
          <div className="flex-1 min-w-0">
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--foreground-muted)" }}
            >
              דוח האירוע
            </div>
            <div className="font-bold text-sm truncate">{subjects}</div>
          </div>
          <button
            type="button"
            onClick={downloadCSV}
            className="btn-gold inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <Download size={14} aria-hidden /> CSV
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 pt-6 space-y-6">
        <section className="card-gold p-8 text-center relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-20 -end-20 w-56 h-56 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(212,176,104,0.30), transparent 70%)" }}
          />
          <div className="relative">
            <PartyPopper size={36} className="mx-auto text-[--accent]" aria-hidden />
            <h1 className="mt-4 text-3xl font-extrabold gradient-gold">
              איזה ערב היה!
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              {subjects}
              {report.eventDate &&
                ` — ${(() => {
                  const d = new Date(report.eventDate);
                  return Number.isNaN(d.getTime())
                    ? report.eventDate
                    : d.toLocaleDateString("he-IL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      });
                })()}`}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox
            label="הגיעו"
            value={report.totalArrived}
            sub={`מתוך ${report.totalGuests}`}
            color="emerald"
          />
          <StatBox
            label="אחוז הגעה"
            value={`${Math.round(report.arrivalRate)}%`}
            color="gold"
          />
          <StatBox
            label="+1 נוספים"
            value={report.totalPlusOnes}
            color="amber"
          />
          <StatBox
            label="פעולות ספקים"
            value={report.totalActions}
            color="gold"
          />
        </section>

        {report.topTables.length > 0 && (
          <section>
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Award size={20} className="text-[--accent]" aria-hidden />
              5 השולחנות המובילים
            </h2>
            <div className="space-y-2">
              {report.topTables.map((t, i) => (
                <div
                  key={t.tableId}
                  className="card p-4 flex items-center gap-3"
                >
                  <div className="text-2xl font-extrabold gradient-gold ltr-num w-8 text-center shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{t.label}</div>
                    <div
                      className="text-xs ltr-num"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {t.arrivedCount} / {t.expectedCount} אורחים
                    </div>
                  </div>
                  <div className="text-sm font-bold text-emerald-400 ltr-num">
                    {Math.round(t.fillPercent)}%
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {report.actions.length > 0 && (
          <section>
            <h2 className="font-bold text-lg mb-3">פעולות ספקים</h2>
            <div className="space-y-2">
              {report.actions.map((a) => (
                <div
                  key={a.actionType}
                  className="card p-3 flex items-center justify-between"
                >
                  <div className="font-semibold text-sm truncate">{a.label}</div>
                  <div className="text-sm font-bold text-[--accent] ltr-num">
                    {a.count}×
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Users size={20} className="text-[--accent]" aria-hidden />
            תודה אישית לכל אורח
          </h2>

          <ExpandableGuestList
            title={`${report.arrivedGuests.length} שהגיעו`}
            expanded={expanded === "arrived"}
            onToggle={() =>
              setExpanded((e) => (e === "arrived" ? null : "arrived"))
            }
            tone="emerald"
            guests={report.arrivedGuests}
            hostName={report.hostName}
            partnerName={report.partnerName}
            variant="attended"
          />

          <div className="mt-3" />

          <ExpandableGuestList
            title={`${report.noShowGuests.length} שלא הגיעו`}
            expanded={expanded === "noshow"}
            onToggle={() =>
              setExpanded((e) => (e === "noshow" ? null : "noshow"))
            }
            tone="amber"
            guests={report.noShowGuests}
            hostName={report.hostName}
            partnerName={report.partnerName}
            variant="noshow"
          />
        </section>
      </div>
    </main>
  );
}

function StatBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: "emerald" | "amber" | "gold";
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    gold: "gradient-gold",
  };
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl font-extrabold ltr-num ${colorMap[color]}`}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
      {sub && (
        <div className="text-[10px] mt-0.5" style={{ color: "var(--foreground-soft)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ExpandableGuestList({
  title,
  expanded,
  onToggle,
  tone,
  guests,
  hostName,
  partnerName,
  variant,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  tone: "emerald" | "amber";
  guests: { guestId: string; name: string; phone: string; plusOnes: number; tableLabel?: string }[];
  hostName: string;
  partnerName?: string;
  variant: "attended" | "noshow";
}) {
  const toneClass = tone === "emerald" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-start"
      >
        <div className={`font-bold ${toneClass}`}>{title}</div>
        {expanded ? (
          <ChevronUp size={18} aria-hidden />
        ) : (
          <ChevronDown size={18} aria-hidden />
        )}
      </button>
      {expanded && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          {guests.length === 0 ? (
            <div
              className="p-4 text-center text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              אין אורחים בקטגוריה זו
            </div>
          ) : (
            <ul>
              {guests.map((g) => {
                const { url, valid } = buildThankYouMessage({
                  guestName: g.name,
                  guestPhone: g.phone,
                  hostName,
                  partnerName,
                  attended: variant === "attended",
                  plusOnes: g.plusOnes,
                });
                return (
                  <li
                    key={g.guestId}
                    className="px-4 py-3 flex items-center justify-between border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{g.name}</div>
                      {g.tableLabel && (
                        <div
                          className="text-xs"
                          style={{ color: "var(--foreground-muted)" }}
                        >
                          {g.tableLabel}
                        </div>
                      )}
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        valid
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                          : "bg-white/5 text-white/60 border-white/10"
                      } transition`}
                      aria-label={`שלח תודה ל-${g.name}`}
                    >
                      <MessageCircle size={12} aria-hidden /> תודה
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
