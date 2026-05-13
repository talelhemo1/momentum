"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState } from "@/lib/types";
import { generateSmartAlerts, type SmartAlert } from "@/lib/managerLive";
import {
  ScanLine,
  Phone,
  Loader2,
  AlertCircle,
  Music,
  Camera,
  UtensilsCrossed,
  MicVocal,
  Check,
  Clock,
  MapPin,
  ArrowLeft,
  Lightbulb,
  X,
  AlertTriangle,
  Award,
} from "lucide-react";

/**
 * R20 Phase 2 — manager dashboard.
 *
 * Composition:
 *   - Sticky header with arrivals counter
 *   - Big "scan check-in" CTA → /manage/[eventId]/checkin
 *   - 3 stat boxes (arrived / waiting / tables)
 *   - 5 vendor quick-action buttons → manager_actions table
 *   - Tables overview (per-table arrival ratio)
 *   - Recent arrivals feed (last 8)
 *
 * Data sources (per Phase-1 scope, no `events` table in Supabase yet):
 *   - Event/guests/tables come from the manager's localStorage IF the
 *     couple opened the app on this device. Otherwise we show a "ask the
 *     host to log in on this device first" notice — Phase 3 will move
 *     state to a Supabase events table that any manager can read.
 *   - Arrivals come from Supabase (guest_arrivals table) so they sync
 *     across the host and any manager device in real time.
 */

interface DashboardGuest {
  id: string;
  name: string;
  tableId?: string;
  arrivedAt?: string;
  plusOnes?: number;
}

interface DashboardTable {
  id: string;
  label: string;
  capacity: number;
  guestIds: string[];
}

interface DashboardEvent {
  id: string;
  hostName: string;
  partnerName?: string;
  date: string;
}

interface DashboardData {
  event: DashboardEvent;
  guests: DashboardGuest[];
  tables: DashboardTable[];
  totalGuests: number;
  arrivedCount: number;
}

const VENDOR_ACTIONS = [
  {
    id: "dj-up",
    label: "DJ — העלה את הקצב",
    icon: <Music size={20} aria-hidden />,
    color: "from-purple-500/20 to-purple-700/10",
  },
  {
    id: "dj-slow",
    label: "DJ — הורד את הקצב",
    icon: <Music size={20} aria-hidden />,
    color: "from-blue-500/20 to-blue-700/10",
  },
  {
    id: "photo-now",
    label: "צלם — תמונה משפחתית עכשיו",
    icon: <Camera size={20} aria-hidden />,
    color: "from-amber-500/20 to-amber-700/10",
  },
  {
    id: "catering-next",
    label: "קייטרינג — הגיש את המנה הבאה",
    icon: <UtensilsCrossed size={20} aria-hidden />,
    color: "from-rose-500/20 to-rose-700/10",
  },
  {
    id: "mc-announce",
    label: "MC — הכרזה הבאה",
    icon: <MicVocal size={20} aria-hidden />,
    color: "from-emerald-500/20 to-emerald-700/10",
  },
] as const;

// (Polling constant removed in R20 Phase 3 — see Supabase Realtime channel below.)

export default function ManagerDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  // managerId is the row ID in event_managers — used for manager_actions FK.
  // marked_by on guest_arrivals takes the user_id directly (per schema).
  const [managerId, setManagerId] = useState<string | null>(null);

  // R20 Phase 3 — AI Co-Pilot state. `eventStartedAt` anchors the rule timings
  // (90 min for hora reminder, etc.) to dashboard open time; future versions
  // can let the host pick a real start time.
  const [smartAlerts, setSmartAlerts] = useState<SmartAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(
    () => new Set(),
  );
  // P1 #7 — persist the event-start clock across refreshes so AI Co-Pilot
  // alerts (90-min hora, etc.) don't reset every time the host reloads.
  // Keyed per-event so two events on the same device stay independent.
  const [eventStartedAt] = useState(() => {
    if (typeof window === "undefined") return Date.now();
    try {
      // R12 §3S — centralized prefix, dot separator (was `:`).
      const key = `${STORAGE_KEYS.eventStartedPrefix}.${eventId}`;
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
      const now = Date.now();
      window.localStorage.setItem(key, String(now));
      return now;
    } catch {
      return Date.now();
    }
  });

  // P1 #6 — track the action-flash timeout so unmount cancels it instead of
  // running setActionInFlight on a dead component.
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const loadData = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !eventId) return;

    // Arrivals come from Supabase (cross-device sync).
    const { data: arrivalsData } = (await supabase
      .from("guest_arrivals")
      .select("guest_id, arrived_at, plus_ones")
      .eq("event_id", eventId)) as {
      data: { guest_id: string; arrived_at: string; plus_ones: number | null }[] | null;
    };

    // Event + guests + tables come from this device's localStorage. Until
    // we move event state to a Supabase events table (Phase 3), a manager
    // needs the host's device or shared localStorage to populate the
    // dashboard. We tolerate the missing case with a clear empty state.
    let event: DashboardEvent | null = null;
    let guests: DashboardGuest[] = [];
    let tables: DashboardTable[] = [];

    try {
      const stateRaw = localStorage.getItem(STORAGE_KEYS.app);
      if (stateRaw) {
        const state = JSON.parse(stateRaw) as Partial<AppState>;
        if (state.event?.id === eventId) {
          event = {
            id: state.event.id,
            hostName: state.event.hostName,
            partnerName: state.event.partnerName,
            date: state.event.date,
          };
          // Real schema: seating assignments live on state.seatAssignments
          // (Record<guestId, tableId>), NOT a tableId field on each guest.
          const assignments = state.seatAssignments ?? {};
          guests = (state.guests ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            tableId: assignments[g.id],
          }));
          // SeatingTable uses `name`, not `label`. Derive guestIds[] from
          // the reverse of the assignments map.
          tables = (state.tables ?? []).map((t) => ({
            id: t.id,
            label: t.name,
            capacity: t.capacity,
            guestIds: Object.entries(assignments)
              .filter(([, tid]) => tid === t.id)
              .map(([gid]) => gid),
          }));
        }
      }
    } catch (e) {
      // Malformed localStorage shouldn't crash the dashboard. We just leave
      // guests/tables empty and the page still renders with arrivals only.
      console.error("[manage/dashboard] failed to read local state", e);
    }

    if (!event) {
      // No event matched on this device — Phase 3 will resolve this via a
      // Supabase events table. For now we show a banner via setData null.
      setLoading(false);
      return;
    }

    // Merge arrivals into the guest list.
    const arrivedMap = new Map(
      (arrivalsData ?? []).map((a) => [a.guest_id, a]),
    );
    guests = guests.map((g) => {
      const arrival = arrivedMap.get(g.id);
      return arrival
        ? {
            ...g,
            arrivedAt: arrival.arrived_at,
            plusOnes: arrival.plus_ones ?? 0,
          }
        : g;
    });

    setData({
      event,
      guests,
      tables,
      totalGuests: guests.length,
      arrivedCount: guests.filter((g) => g.arrivedAt).length,
    });
    setLoading(false);
  }, [eventId]);

  // Manager-auth gate — must be the user_id on an accepted event_managers row.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // Documented "mirror an external value (supabase config) into local
      // state" pattern — sets a one-shot flag so the page can render its
      // "not configured" branch. setState in effect is intentional here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/signup");
        return;
      }
      // Host (invited_by) OR accepted manager (user_id) both see the
      // dashboard. The host's row never has user_id set, so the prior
      // user_id=eq query locked them out of their own event (P0 #3).
      const { data: managerData } = (await supabase
        .from("event_managers")
        .select("id, status, invited_by")
        .eq("event_id", eventId)
        .or(`user_id.eq.${user.id},invited_by.eq.${user.id}`)
        .limit(1)) as {
        data: { id: string; status: string; invited_by: string }[] | null;
      };
      if (cancelled) return;
      const row = managerData?.[0];
      const isAuthorized =
        !!row && (row.invited_by === user.id || row.status === "accepted");
      if (isAuthorized && row) {
        setAuthorized(true);
        setManagerId(row.id);
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, router]);

  // R20 Phase 3 — Supabase Realtime subscription replaces the 5s polling
  // loop. We subscribe to INSERTs on guest_arrivals + manager_actions
  // scoped to THIS event_id, and re-pull state when anything fires. The
  // initial load still happens on mount so the dashboard never starts
  // empty before the first realtime event arrives.
  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`event_${eventId}_live`)
      .on(
        // postgres_changes is the supabase-js realtime event for DB CDC.
        // Typing here is loose (any) because supabase-js's overload set is
        // generic-only and our DB types aren't generated — same pattern as
        // the rest of the project's Supabase calls.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "guest_arrivals",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          void loadData();
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "manager_actions",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          void loadData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authorized, loadData, eventId]);

  // R20 Phase 3 — recompute AI Co-Pilot alerts every 30s. Cheap pure-fn
  // call (no network) — re-uses the locally-cached `data` snapshot.
  useEffect(() => {
    if (!data) return;
    const computeAlerts = () => {
      const now = Date.now();
      const fifteenMinAgo = now - 15 * 60_000;
      const recentRate = data.guests.filter(
        (g) =>
          g.arrivedAt && new Date(g.arrivedAt).getTime() > fifteenMinAgo,
      ).length;
      setSmartAlerts(
        generateSmartAlerts({
          eventStartedAt,
          totalGuests: data.totalGuests,
          arrivedCount: data.arrivedCount,
          recentArrivalRate: recentRate,
          tables: data.tables.map((t) => ({
            id: t.id,
            label: t.label,
            capacity: t.capacity,
            expectedCount: t.guestIds.length,
            arrivedCount: t.guestIds.filter(
              (gid) => data.guests.find((g) => g.id === gid)?.arrivedAt,
            ).length,
          })),
          now,
        }),
      );
    };
    computeAlerts();
    const interval = setInterval(computeAlerts, 30_000);
    return () => clearInterval(interval);
  }, [data, eventStartedAt]);

  const handleVendorAction = async (actionId: string, actionLabel: string) => {
    if (!managerId) return;
    setActionInFlight(actionId);

    const supabase = getSupabase();
    if (!supabase) {
      setActionInFlight(null);
      return;
    }

    // Cast through never — manager_actions isn't in a generated Database type.
    // Date.now() is impure; React 19's purity lint flags it even inside an
    // async event handler. Suppress on the single line — we genuinely want
    // wall-clock time here for the audit log payload.
    // eslint-disable-next-line react-hooks/purity
    const timestamp = Date.now();
    const { error } = (await supabase
      .from("manager_actions")
      .insert({
        event_id: eventId,
        manager_id: managerId,
        action_type: actionId,
        payload: { label: actionLabel, timestamp },
      } as unknown as never)) as { error: { message: string } | null };

    if (error) {
      console.error("[manage/dashboard] action insert failed", error);
      showToast("הפעולה נכשלה", "error");
      setActionInFlight(null);
      return;
    }
    showToast(`✓ ${actionLabel}`, "success");
    // Visual feedback persists 1.5s so the user sees the green check.
    const t = window.setTimeout(() => setActionInFlight(null), 1500);
    cleanupRef.current = () => window.clearTimeout(t);
  };

  if (!authChecked || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle size={32} className="mx-auto text-amber-400" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">אין לך הרשאה לדשבורד הזה</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
            רק מנהלים שאושרו על ידי המארחים רואים את הדשבורד.
          </p>
          <Link
            href="/"
            className="text-xs underline mt-4 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-6 text-center max-w-md">
          <p className="font-semibold">לא נטענו פרטי האירוע במכשיר הזה</p>
          <p className="mt-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
            ב-MVP הראשון פרטי האירוע מגיעים מהמכשיר של המארח. בקש מהזוג לפתוח את
            האפליקציה במכשיר הזה פעם אחת, או לחיצה על &quot;רענן&quot;.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-gold mt-4"
          >
            רענן
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20" style={{ background: "var(--surface-0)" }}>
      {/* Sticky header with running arrivals counter */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                Momentum Live
              </div>
              <div className="font-bold text-sm">
                {data.event.hostName}
                {data.event.partnerName ? ` ו-${data.event.partnerName}` : ""}
              </div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-2xl font-extrabold ltr-num gradient-gold">
              {data.arrivedCount}
              <span className="text-sm font-normal" style={{ color: "var(--foreground-muted)" }}>
                /{data.totalGuests}
              </span>
            </div>
            <div className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
              הגיעו
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 pt-6">
        {/* Primary CTA — Check-in scanner */}
        <Link
          href={`/manage/${eventId}/checkin`}
          className="card-gold p-5 flex items-center justify-between group hover:translate-y-[-2px] transition mb-3"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/30 to-[#A8884A]/15 flex items-center justify-center text-[--accent]">
              <ScanLine size={28} aria-hidden />
            </div>
            <div>
              <div className="font-bold">סריקת QR בכניסה</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--foreground-soft)" }}>
                סרוק אורחים שמגיעים — קליק אחד
              </div>
            </div>
          </div>
          <ArrowLeft
            size={20}
            className="text-[--accent] opacity-60 group-hover:opacity-100"
            aria-hidden
          />
        </Link>

        {/* Phase 5 + 6 — Crisis Mode + post-event report. */}
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <Link
            href={`/manage/${eventId}/crisis`}
            className="card p-4 flex items-center gap-3 border hover:translate-y-[-2px] transition"
            style={{ borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.05)" }}
          >
            <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center text-red-300 shrink-0">
              <AlertTriangle size={22} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-red-300">משהו השתבש?</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--foreground-soft)" }}>
                7 playbooks לחירום באירוע
              </div>
            </div>
          </Link>
          <Link
            href={`/manage/${eventId}/report`}
            className="card p-4 flex items-center gap-3 border hover:translate-y-[-2px] transition"
            style={{ borderColor: "rgba(212,176,104,0.35)", background: "rgba(212,176,104,0.05)" }}
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F4DEA9]/30 to-[#A8884A]/15 flex items-center justify-center text-[--accent] shrink-0">
              <Award size={22} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm gradient-gold">דוח אחרי האירוע</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--foreground-soft)" }}>
                סטטיסטיקות + תודה לאורחים
              </div>
            </div>
          </Link>
        </div>

        {/* R20 Phase 3 — AI Co-Pilot smart alerts. Shows up to 3 active
            alerts; dismissed ones never re-fire (id-based dismissal set). */}
        {smartAlerts.filter((a) => !dismissedAlerts.has(a.id)).length > 0 && (
          <section className="mb-6">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Lightbulb size={20} className="text-amber-400" aria-hidden />
              AI Co-Pilot
            </h2>
            <div className="space-y-2">
              {smartAlerts
                .filter((a) => !dismissedAlerts.has(a.id))
                .slice(0, 3)
                .map((alert) => (
                  <SmartAlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={() =>
                      setDismissedAlerts((prev) => {
                        const next = new Set(prev);
                        next.add(alert.id);
                        return next;
                      })
                    }
                    onAction={() => {
                      if (alert.actionType) {
                        void handleVendorAction(
                          alert.actionType,
                          alert.actionLabel ?? alert.title,
                        );
                      }
                      setDismissedAlerts((prev) => {
                        const next = new Set(prev);
                        next.add(alert.id);
                        return next;
                      });
                    }}
                  />
                ))}
            </div>
          </section>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBox label="הגיעו" value={data.arrivedCount} color="emerald" />
          <StatBox
            label="ממתינים"
            value={data.totalGuests - data.arrivedCount}
            color="amber"
          />
          <StatBox label="שולחנות" value={data.tables.length} color="gold" />
        </div>

        {/* Vendor quick actions */}
        <section className="mb-8">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Phone size={20} className="text-[--accent]" aria-hidden />
            תיאום ספקים — לחיצה אחת
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {VENDOR_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => void handleVendorAction(action.id, action.label)}
                disabled={actionInFlight === action.id}
                className="card p-4 text-start hover:translate-y-[-2px] transition disabled:opacity-50 inline-flex items-center gap-3"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center text-[--accent] shrink-0`}
                >
                  {actionInFlight === action.id ? (
                    <Check size={20} className="text-emerald-400" aria-hidden />
                  ) : (
                    action.icon
                  )}
                </div>
                <div className="text-sm font-semibold">{action.label}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Tables overview */}
        {data.tables.length > 0 && (
          <section className="mb-8">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <MapPin size={20} className="text-[--accent]" aria-hidden />
              שולחנות
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.tables.map((table) => {
                const arrived = table.guestIds.filter(
                  (gid) => data.guests.find((g) => g.id === gid)?.arrivedAt,
                ).length;
                const total = table.guestIds.length;
                const ratio = total > 0 ? arrived / total : 0;
                return (
                  <div key={table.id} className="card p-3 text-center">
                    <div className="text-xs font-bold">{table.label}</div>
                    <div
                      className="mt-1 text-xl font-extrabold ltr-num"
                      style={{
                        color:
                          ratio === 1
                            ? "rgb(52,211,153)"
                            : ratio > 0.5
                              ? "var(--accent)"
                              : "var(--foreground-soft)",
                      }}
                    >
                      {arrived}/{total}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent arrivals */}
        <section>
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Clock size={20} className="text-[--accent]" aria-hidden />
            הגיעו לאחרונה
          </h2>
          <div className="space-y-2">
            {data.guests
              .filter((g) => g.arrivedAt)
              .sort(
                (a, b) =>
                  new Date(b.arrivedAt!).getTime() -
                  new Date(a.arrivedAt!).getTime(),
              )
              .slice(0, 8)
              .map((g) => (
                <div
                  key={g.id}
                  className="card p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-sm">{g.name}</div>
                    {g.plusOnes && g.plusOnes > 0 && (
                      <div className="text-xs" style={{ color: "var(--accent)" }}>
                        +{g.plusOnes} לא צפויים
                      </div>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                    {new Date(g.arrivedAt!).toLocaleTimeString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            {data.guests.filter((g) => g.arrivedAt).length === 0 && (
              <div
                className="card p-8 text-center text-sm"
                style={{ color: "var(--foreground-muted)" }}
              >
                עדיין לא הגיעו אורחים
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "emerald" | "amber" | "gold";
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    gold: "gradient-gold",
  };
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl font-extrabold ltr-num ${colorMap[color]}`}>{value}</div>
      <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
    </div>
  );
}

/**
 * R20 Phase 3 — single AI Co-Pilot alert. Severity drives the tint:
 * warning (amber), critical (red), success (emerald), info (sky). Optional
 * one-click action dispatches the same vendor-action that the manual
 * vendor-action buttons use, so the audit log stays consistent.
 */
function SmartAlertCard({
  alert,
  onDismiss,
  onAction,
}: {
  alert: SmartAlert;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const colorMap: Record<SmartAlert["severity"], string> = {
    info: "border-sky-400/30 bg-sky-400/5",
    warning: "border-amber-400/30 bg-amber-400/5",
    success: "border-emerald-400/30 bg-emerald-400/5",
    critical: "border-red-400/30 bg-red-400/5",
  };
  return (
    <div
      className={`rounded-2xl p-4 border ${colorMap[alert.severity]} flex items-start gap-3`}
    >
      <div className="text-2xl shrink-0" aria-hidden>
        {alert.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold">{alert.title}</div>
        <div className="text-xs mt-1" style={{ color: "var(--foreground-soft)" }}>
          {alert.description}
        </div>
        {alert.actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="btn-gold text-xs mt-3 px-3 py-1.5"
          >
            {alert.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="התעלם מההתראה"
        className="p-1 rounded-lg hover:bg-white/5 shrink-0"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
