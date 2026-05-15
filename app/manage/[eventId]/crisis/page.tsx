"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { CRISIS_PLAYBOOKS } from "@/lib/crisisPlaybooks";
import { detectCrises, type Crisis, type CrisisContext } from "@/lib/crisis";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState } from "@/lib/types";
import { VENDORS } from "@/lib/vendors";
import { showToast } from "@/components/Toast";
import { haptic } from "@/lib/haptic";
import { ArrowRight, AlertTriangle, Loader2 } from "lucide-react";

/**
 * R27 Momentum Live Phase 3 — Crisis Control Room.
 *
 * Live, auto-detecting crisis surface on top of the original R20 Phase 5
 * playbooks index. A `CrisisContext` is built from the local AppState
 * snapshot (same localStorage source as the manager dashboard) and fed to
 * the pure `detectCrises()` rule engine every 30s. Each active crisis gets
 * an expanded card with one-tap call / SMS / broadcast-to-managers actions.
 *
 * Auth-gated to the event manager (host or accepted manager) — identical
 * gate to the dashboard + check-in pages.
 */
export default function CrisisIndexPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  // Live crisis state. `crises` is recomputed from the local snapshot on a
  // 30s tick; `nowTick` re-renders the "active since" timers on the same
  // cadence. `dismissed` hides resolved ids — deterministic crisis ids mean
  // a dismissed situation never re-adds itself.
  const [crises, setCrises] = useState<Crisis[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  // Per-crisis "active for N minutes" snapshot, recomputed on each 30s
  // compute tick. Derived into state (rather than reading the firstSeen
  // ref + Date.now() at render time) so render stays pure — satisfies
  // react-hooks/refs + react-hooks/purity.
  const [activeMins, setActiveMins] = useState<Map<string, number>>(
    () => new Map(),
  );

  // First-seen wall-clock per crisis id → drives the "פעיל כבר X דק׳"
  // relative timer. A ref (not state) so seeding it never triggers a render.
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  // Critical ids we've already buzzed for — haptic.heavy() once per id.
  const buzzedRef = useRef<Set<string>>(new Set());

  // Manager-auth gate — host (invited_by) OR accepted manager (user_id).
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
      const { data: m } = (await supabase
        .from("event_managers")
        .select("id")
        .eq("event_id", eventId)
        .or(`user_id.eq.${user.id},invited_by.eq.${user.id}`)
        .maybeSingle()) as { data: { id: string } | null };
      if (cancelled) return;
      if (m) {
        setAuthorized(true);
      } else {
        router.replace(`/manage/${eventId}`);
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, router]);

  // Build a CrisisContext from the local AppState snapshot and run the
  // detector. Pure + cheap (no network) so we re-run every 30s; the same
  // tick advances the relative timers below.
  useEffect(() => {
    if (!authorized) return;

    const compute = () => {
      let detected: Crisis[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.app);
        if (raw) {
          const state = JSON.parse(raw) as Partial<AppState>;
          const guests = state.guests ?? [];
          const totalGuests =
            guests.length > 0
              ? guests.reduce(
                  (sum, g) => sum + Math.max(1, g.attendingCount ?? 1),
                  0,
                )
              : 0;
          const arrivedGuests = guests.filter(
            (g) => g.status === "confirmed",
          ).length;

          const now = new Date();
          const eventDate = state.event?.date
            ? new Date(state.event.date)
            : null;
          const minutesToEvent =
            eventDate && !Number.isNaN(eventDate.getTime())
              ? Math.round((eventDate.getTime() - now.getTime()) / 60_000)
              : Number.POSITIVE_INFINITY;

          const vendors: CrisisContext["vendors"] = (
            state.savedVendors ?? []
          ).map((sv) => {
            const catalog = VENDORS.find((c) => c.id === sv.vendorId);
            return {
              id: sv.vendorId,
              name: catalog?.name ?? sv.vendorId,
              ...(catalog?.phone ? { phone: catalog.phone } : {}),
              paymentDue: !!sv.agreedPrice && !sv.depositAmount,
            };
          });

          const ctx: CrisisContext = {
            minutesToEvent,
            totalGuests,
            arrivedGuests,
            nowLabel: now.toLocaleTimeString("he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            vendors,
          };
          detected = detectCrises(ctx);
        }
      } catch (e) {
        // Malformed localStorage must never blank the control room — we
        // just show "no active crises" instead of crashing.
        console.error("[manage/crisis] failed to read local state", e);
      }

      // Seed first-seen + fire a one-shot heavy haptic per *new* critical.
      const now = Date.now();
      const seenAt = firstSeenRef.current;
      for (const c of detected) {
        if (!seenAt.has(c.id)) seenAt.set(c.id, now);
        if (
          c.severity === "critical" &&
          !buzzedRef.current.has(c.id) &&
          !dismissed.has(c.id)
        ) {
          buzzedRef.current.add(c.id);
          haptic.heavy();
        }
      }

      // Snapshot the relative timers off the ref here (effect context, ref
      // access is allowed) so render only reads plain state.
      const mins = new Map<string, number>();
      for (const c of detected) {
        const seen = seenAt.get(c.id) ?? now;
        mins.set(c.id, Math.max(0, Math.floor((now - seen) / 60_000)));
      }

      setCrises(detected);
      setActiveMins(mins);
    };

    compute();
    const interval = setInterval(compute, 30_000);
    return () => clearInterval(interval);
  }, [authorized, dismissed]);

  if (checking || !authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  const visibleCrises = crises.filter((c) => !dismissed.has(c.id));

  // "פעיל כבר X דק׳" — pure read of the state snapshot computed on the
  // 30s tick (no ref / Date.now() touched during render).
  const activeMinutes = (id: string): number => activeMins.get(id) ?? 0;

  const broadcast = async (crisis: Crisis) => {
    haptic.medium();
    const supabase = getSupabase();
    const token = supabase
      ? (await supabase.auth.getSession()).data.session?.access_token
      : undefined;
    try {
      const res = await fetch("/api/crisis/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          eventId,
          message: `${crisis.title} — ${crisis.description}`,
        }),
      });
      const json = (await res.json()) as { sent?: number };
      showToast(`שודר ל-${json.sent ?? 0} מנהלים`, "success");
    } catch (e) {
      console.error("[manage/crisis] broadcast failed", e);
      showToast("השידור נכשל — נסו שוב", "error");
    }
  };

  const dismissCrisis = (id: string) => {
    haptic.light();
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const severityRing: Record<string, string> = {
    critical: "border-red-500/40 hover:border-red-500/70",
    high: "border-amber-500/40 hover:border-amber-500/70",
    medium: "border-white/10 hover:border-white/30",
  };

  // Big tap targets — every crisis action is ≥44px high.
  const actionBtn =
    "flex items-center justify-center gap-2 rounded-xl font-bold text-sm transition hover:translate-y-[-2px] active:translate-y-0";

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
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-400" aria-hidden />
            <div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                Crisis Mode
              </div>
              <div className="font-bold text-sm">חדר בקרת חירום</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Live crisis control room ───────────────────────────────── */}
      <section
        className="r26-critical-pulse"
        style={{
          background: "linear-gradient(160deg,#7A4A1A,#2A1A0A)",
          borderBottom: "1px solid rgba(245,158,11,0.25)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 pt-8 pb-7">
          <h1
            className="font-extrabold leading-tight"
            style={{
              fontSize: 32,
              backgroundImage:
                "linear-gradient(95deg,#F87171 0%,#FBBF24 60%,#F4DEA9 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 2px 18px rgba(248,113,113,0.35)",
            }}
          >
            🚨 מצב חירום פעיל
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "rgba(244,222,169,0.78)" }}
          >
            ניטור חי של האירוע — אנחנו נצביע על מה שדורש טיפול, אתם מחליטים.
          </p>

          {visibleCrises.length === 0 ? (
            <div
              className="mt-6 rounded-2xl p-6 border text-center"
              style={{
                borderColor: "rgba(52,211,153,0.35)",
                background: "rgba(52,211,153,0.10)",
              }}
            >
              <p
                className="font-bold"
                style={{ color: "rgb(110,231,183)" }}
              >
                ✅ אין התראות חירום פעילות — הכל תחת שליטה
              </p>
              <p
                className="mt-2 text-xs"
                style={{ color: "rgba(167,243,208,0.7)" }}
              >
                נמשיך לנטר ברקע. אם משהו ישתבש — תדעו ראשונים.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {visibleCrises.map((c) => {
                const isCritical = c.severity === "critical";
                const mins = activeMinutes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`rounded-2xl p-5 border ${
                      isCritical ? "r26-critical-pulse" : ""
                    }`}
                    style={{
                      borderColor: isCritical
                        ? "rgba(248,113,113,0.45)"
                        : "rgba(245,158,11,0.40)",
                      background: "rgba(10,8,5,0.55)",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span
                          className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                          style={{
                            background: isCritical
                              ? "rgba(248,113,113,0.20)"
                              : "rgba(245,158,11,0.20)",
                            color: isCritical
                              ? "rgb(252,165,165)"
                              : "rgb(252,211,77)",
                          }}
                        >
                          {isCritical ? "קריטי" : "אזהרה"}
                        </span>
                        <h2 className="mt-2 font-extrabold text-lg leading-tight">
                          {c.title}
                        </h2>
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "rgba(244,222,169,0.78)" }}
                        >
                          {c.description}
                        </p>
                        <p
                          className="mt-2 text-xs font-semibold ltr-num"
                          style={{ color: "rgba(252,211,77,0.85)" }}
                        >
                          ⏱ פעיל כבר {mins} דק׳
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      <div className="grid sm:grid-cols-3 gap-2">
                        {c.vendorPhone ? (
                          <a
                            href={`tel:${c.vendorPhone}`}
                            onClick={() => haptic.medium()}
                            className={actionBtn}
                            style={{
                              minHeight: 44,
                              background:
                                "linear-gradient(135deg,#34D399,#059669)",
                              color: "#04130C",
                            }}
                          >
                            📞 התקשר לספק
                          </a>
                        ) : null}
                        {c.vendorPhone ? (
                          <a
                            href={`sms:${c.vendorPhone}`}
                            onClick={() => haptic.medium()}
                            className={actionBtn}
                            style={{
                              minHeight: 44,
                              background:
                                "linear-gradient(135deg,#60A5FA,#2563EB)",
                              color: "#04122B",
                            }}
                          >
                            💬 SMS לספק
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void broadcast(c)}
                          className={`${actionBtn} ${
                            c.vendorPhone ? "" : "sm:col-span-3"
                          }`}
                          style={{
                            minHeight: 44,
                            background:
                              "linear-gradient(135deg,#FBBF24,#D97706)",
                            color: "#1A1006",
                          }}
                        >
                          📢 שדר לכל המנהלים
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissCrisis(c.id)}
                        className="flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border transition hover:bg-white/5"
                        style={{
                          minHeight: 44,
                          borderColor: "rgba(255,255,255,0.18)",
                          color: "rgba(244,222,169,0.85)",
                        }}
                      >
                        ✅ סומן כפתור — סגור התראה
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Original R20 Phase 5 playbooks index ───────────────────── */}
      <div className="max-w-3xl mx-auto px-5 pt-8">
        <div
          className="flex items-center gap-3 mb-5"
          aria-hidden
        >
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border)" }}
          />
          <span
            className="text-xs font-bold tracking-wider"
            style={{ color: "var(--foreground-muted)" }}
          >
            📋 Playbooks מפורטים
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border)" }}
          />
        </div>

        <div
          className="card p-5 mb-6 border"
          style={{ borderColor: "rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.05)" }}
        >
          <p className="font-bold">נשמו עמוק. אנחנו פה.</p>
          <p className="text-sm mt-2" style={{ color: "var(--foreground-soft)" }}>
            כל playbook נכתב על ידי אנשי תעשייה מנוסים. בחרו את הסיטואציה — נדריך אתכם צעד אחר צעד.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {CRISIS_PLAYBOOKS.map((p) => (
            <Link
              key={p.id}
              href={`/manage/${eventId}/crisis/${p.id}`}
              className={`card p-5 transition border ${severityRing[p.severity] ?? severityRing.medium} hover:translate-y-[-2px]`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl shrink-0" aria-hidden>
                  {p.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{p.title}</div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    {p.tagline}
                  </div>
                  {p.severity === "critical" && (
                    <div className="mt-2 inline-block text-[10px] uppercase tracking-wider font-bold text-red-400">
                      קריטי
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
