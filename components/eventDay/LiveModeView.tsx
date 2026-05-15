"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, BellRing, Crown, Loader2, Navigation } from "lucide-react";
import type { EventInfo } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { buildNavigationLinks } from "@/lib/navigationLinks";
import { useAppState } from "@/lib/store";
import { StatBubble } from "@/components/managerLive/StatBubble";
import { haptic } from "@/lib/haptic";
import { playManagerSound } from "@/lib/managerSounds";

interface ArrivalRow {
  guest_id: string;
  arrived_at: string;
  plus_ones: number | null;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "הרגע";
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  return `לפני ${h} שע׳`;
}

/**
 * R27 — the couple's "live mode" the day of the event. Real-time
 * arrival count, manager presence, latest-activity feed, quick actions.
 * Mobile-first; the couple holds a phone, not a laptop.
 */
export function LiveModeView({ event }: { event: EventInfo }) {
  const { state } = useAppState();
  const totalHeads = (state.guests ?? []).reduce(
    (s, g) => s + Math.max(1, g.attendingCount || 1),
    0,
  );
  const guestNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of state.guests ?? []) m.set(g.id, g.name);
    return m;
  }, [state.guests]);
  // R31 — one-tap navigation to the venue from live mode.
  const navLinks = useMemo(
    () =>
      buildNavigationLinks(
        [event.synagogue, event.city].filter(Boolean).join(" · "),
      ),
    [event.synagogue, event.city],
  );

  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [managerLive, setManagerLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const prevCount = useRef(0);
  // R30 — gate realtime callbacks until the initial load has set the
  // baseline. A realtime event arriving before Promise.all resolves
  // otherwise set prevCount from a partial snapshot and spuriously fired
  // haptic/sound when the slower initial load landed.
  const initialDone = useRef(false);

  // Initial load + realtime subscription on guest_arrivals.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let cancelled = false;

    void (async () => {
      const [arr, mgr] = await Promise.all([
        supabase
          .from("guest_arrivals")
          .select("guest_id, arrived_at, plus_ones")
          .eq("event_id", event.id)
          .order("arrived_at", { ascending: false }),
        supabase
          .from("event_managers")
          .select("invitee_name, status")
          .eq("event_id", event.id)
          .in("status", ["invited", "accepted"])
          .order("status", { ascending: true })
          .limit(1),
      ]);
      if (cancelled) return;
      const rows = (arr.data ?? []) as ArrivalRow[];
      setArrivals(rows);
      prevCount.current = rows.length;
      const m = (mgr.data ?? [])[0] as
        | { invitee_name: string; status: string }
        | undefined;
      setManagerName(m?.invitee_name ?? null);
      setManagerLive(m?.status === "accepted");
      initialDone.current = true;
      setLoaded(true);
    })();

    const channel = supabase
      .channel(`live_${event.id}_arrivals`)
      .on(
        // event_arrivals isn't in a generated Database type
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "guest_arrivals",
          filter: `event_id=eq.${event.id}`,
        } as never,
        () => {
          void (async () => {
            if (!initialDone.current) return; // baseline not set yet
            const { data } = await supabase
              .from("guest_arrivals")
              .select("guest_id, arrived_at, plus_ones")
              .eq("event_id", event.id)
              .order("arrived_at", { ascending: false });
            if (cancelled) return;
            const rows = (data ?? []) as ArrivalRow[];
            if (rows.length > prevCount.current) {
              haptic.success();
              playManagerSound("checkin");
            }
            prevCount.current = rows.length;
            setArrivals(rows);
          })();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [event.id]);

  const arrivedHeads = arrivals.reduce(
    (s, a) => s + 1 + Math.max(0, a.plus_ones ?? 0),
    0,
  );
  const pct =
    totalHeads > 0 ? Math.min(100, Math.round((arrivedHeads / totalHeads) * 100)) : 0;
  const remaining = Math.max(0, totalHeads - arrivedHeads);

  return (
    <main
      className="min-h-screen pb-28 px-5 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 70% at 50% -10%, rgba(212,176,104,0.16), transparent 60%), var(--background)",
      }}
    >
      <div aria-hidden className="glow-orb glow-orb-gold w-[320px] h-[320px] -top-24 right-[-60px] opacity-25 float-slow" />

      <div className="max-w-2xl mx-auto pt-10 relative z-10">
        <div className="text-center r26-rise">
          <span className="pill pill-gold">
            <Crown size={11} /> מצב חי · היום
          </span>
          <h1 className="mt-3 text-3xl md:text-4xl font-extrabold gradient-gold">
            {event.partnerName
              ? `${event.hostName} ו-${event.partnerName}`
              : event.hostName}
          </h1>
          {navLinks && (
            <a
              href={navLinks.waze}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-full px-4 py-2 transition active:scale-95"
              style={{
                background: "rgba(212,176,104,0.15)",
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }}
            >
              <Navigation size={15} /> ניווט לאולם
            </a>
          )}
        </div>

        {/* Real-time arrivals */}
        <section className="grid grid-cols-3 gap-2 mt-8 r26-rise" style={{ animationDelay: "0.08s" }}>
          <StatBubble label="הגיעו" value={arrivedHeads} />
          <StatBubble label="אחוז" value={pct} suffix="%" ring={pct} />
          <StatBubble label="נותרו" value={remaining} />
        </section>

        {/* Manager presence */}
        <div
          className="mt-7 card-gold p-5 flex items-center gap-4 r26-rise"
          style={{ animationDelay: "0.16s" }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(212,176,104,0.15)", color: "var(--accent)" }}
          >
            <Crown size={22} aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold">
              {managerName
                ? `${managerName} מנהל/ת את האירוע`
                : "אין מנהל פעיל"}
            </div>
            <div className="text-xs mt-0.5 inline-flex items-center gap-1.5" style={{ color: "var(--foreground-soft)" }}>
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: managerLive ? "rgb(52,211,153)" : "var(--foreground-muted)" }}
              />
              {managerLive ? "מחובר/ת" : managerName ? "ממתין לאישור" : "—"}
            </div>
          </div>
        </div>

        {/* Latest activity */}
        <section className="mt-7">
          <h2 className="font-bold text-lg mb-3">הפעילות האחרונה</h2>
          {!loaded ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-[--accent]" size={26} aria-hidden />
            </div>
          ) : arrivals.length === 0 ? (
            <div
              className="card p-6 text-center text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              עדיין אף אחד לא צ׳ק-אין. ברגע שאורחים יגיעו — תראו את זה כאן בזמן אמת.
            </div>
          ) : (
            <div className="space-y-2">
              {arrivals.slice(0, 10).map((a, i) => (
                <div
                  key={`${a.guest_id}-${a.arrived_at}`}
                  className="card p-3.5 flex items-center justify-between r26-rise-sm"
                  style={{ animationDelay: `${Math.min(i, 6) * 0.05}s` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm"
                      style={{ background: "rgba(52,211,153,0.15)", color: "rgb(110,231,183)" }}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className="font-medium truncate">
                      {guestNameById.get(a.guest_id) ?? "אורח/ת"}
                      {a.plus_ones && a.plus_ones > 0
                        ? ` +${a.plus_ones}`
                        : ""}
                    </span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "var(--foreground-muted)" }}>
                    {relTime(a.arrived_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Sticky quick actions */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        style={{
          background:
            "linear-gradient(to top, var(--background) 60%, transparent)",
        }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-2">
          <Link
            href={`/live/${event.id}?mode=upload`}
            className="btn-gold py-3 inline-flex items-center justify-center gap-2 text-sm"
          >
            <Camera size={16} /> Memory Album
          </Link>
          <Link
            href="/guests"
            className="py-3 rounded-2xl inline-flex items-center justify-center gap-2 text-sm font-semibold"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
              color: "var(--foreground-soft)",
            }}
          >
            <BellRing size={16} /> תזכורת למוזמנים
          </Link>
        </div>
      </div>
    </main>
  );
}
