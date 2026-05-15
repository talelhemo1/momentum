"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState } from "@/lib/types";
import { buildGuestWelcomeWhatsapp } from "@/lib/guestWelcome";
import { haptic } from "@/lib/haptic";
import { playManagerSound } from "@/lib/managerSounds";
import { useCountUp } from "@/lib/useCountUp";
import { ArrowRight, Check, Loader2, UserPlus, Search, MessageCircle } from "lucide-react";

/**
 * R20 Phase 2 — door-check-in screen for the event manager.
 *
 * Why a search list, not a real camera scanner: in Phase-1 scope we don't
 * have QR codes attached to physical invitations yet, so the manager taps
 * names. The page is structured to swap in a camera scanner later — same
 * `handleCheckIn` action, different input.
 *
 * Auth: same as the dashboard — must be an accepted manager for this event.
 * Guests are read from the host's localStorage; arrivals are written to
 * Supabase so the host sees them too.
 */

interface CheckinGuest {
  id: string;
  name: string;
  phone: string;
  tableId?: string;
  arrived: boolean;
}

export default function CheckinPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [search, setSearch] = useState("");
  const [guests, setGuests] = useState<CheckinGuest[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  // marked_by on the guest_arrivals row takes the auth user's id, not the
  // event_managers row id (per the migration's foreign-key target).
  const [userId, setUserId] = useState<string | null>(null);
  const [recentlyChecked, setRecentlyChecked] = useState<string | null>(null);
  // R26 — short-lived (~240ms) flash on the row that just succeeded/failed.
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [flashErr, setFlashErr] = useState<string | null>(null);
  const flashRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      flashRef.current?.();
    };
  }, []);

  // R20 Phase 3 — we keep a snapshot of the host's AppState in memory so we
  // can build the guest-welcome WhatsApp message after a check-in. The
  // snapshot was already read in the guest-list effect below; we keep a
  // parallel state so we can look up the table name + host name on demand.
  const [localState, setLocalState] = useState<Partial<AppState> | null>(null);
  const [lastCheckedGuest, setLastCheckedGuest] = useState<{
    guestId: string;
    waUrl: string;
  } | null>(null);

  // Tracks the in-flight "recentlyChecked" timeout so unmount cancels it
  // instead of letting the callback fire on a dead component (P1 #6).
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // Auth gate — must be an accepted manager for this event.
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
      // Host (invited_by) OR accepted manager (user_id) — same fix as the
      // dashboard so the host can run check-in on their own event.
      const { data: rows } = (await supabase
        .from("event_managers")
        .select("id, status, invited_by")
        .eq("event_id", eventId)
        .or(`user_id.eq.${user.id},invited_by.eq.${user.id}`)
        .limit(1)) as {
        data: { id: string; status: string; invited_by: string }[] | null;
      };
      if (cancelled) return;
      const row = rows?.[0];
      const isAuthorized =
        !!row && (row.invited_by === user.id || row.status === "accepted");
      if (isAuthorized) {
        setUserId(user.id);
        setAuthorized(true);
      } else {
        router.replace(`/manage/${eventId}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, router]);

  // Load guests from local AppState + arrivals from Supabase.
  useEffect(() => {
    if (!authorized) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let allGuests: Omit<CheckinGuest, "arrived">[] = [];
    let snapshot: Partial<AppState> | null = null;
    try {
      const stateRaw = localStorage.getItem(STORAGE_KEYS.app);
      if (stateRaw) {
        const state = JSON.parse(stateRaw) as Partial<AppState>;
        if (state.event?.id === eventId) {
          snapshot = state;
          const assignments = state.seatAssignments ?? {};
          allGuests = (state.guests ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            phone: g.phone,
            tableId: assignments[g.id],
          }));
        }
      }
    } catch (e) {
      console.error("[manage/checkin] failed to read local state", e);
    }
    // Keep a copy in component state so handleCheckIn can resolve the
    // table label + host name without re-parsing localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalState(snapshot);

    let cancelled = false;
    (async () => {
      const { data } = (await supabase
        .from("guest_arrivals")
        .select("guest_id")
        .eq("event_id", eventId)) as { data: { guest_id: string }[] | null };
      if (cancelled) return;
      const arrivedSet = new Set((data ?? []).map((a) => a.guest_id));
      setGuests(
        allGuests.map((g) => ({ ...g, arrived: arrivedSet.has(g.id) })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized, eventId]);

  const handleCheckIn = async (guestId: string, plusOnes = 0) => {
    if (!userId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    // Optimistic update — flip the UI immediately, then write to Supabase.
    // The unique index on (event_id, guest_id) makes the insert idempotent;
    // a duplicate just means "already arrived" and we ignore it.
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, arrived: true } : g)),
    );
    setRecentlyChecked(guestId);
    const t = window.setTimeout(() => setRecentlyChecked(null), 2000);
    cleanupRef.current = () => window.clearTimeout(t);

    const { error } = (await supabase
      .from("guest_arrivals")
      .insert({
        event_id: eventId,
        guest_id: guestId,
        marked_by: userId,
        plus_ones: plusOnes,
      } as unknown as never)) as { error: { message?: string; code?: string } | null };

    if (error) {
      // Code 23505 = unique_violation (already arrived). That's a no-op, not
      // a real error — keep the optimistic state and silently succeed.
      const msg = error.message ?? "";
      const isDup = error.code === "23505" || /duplicate|unique/i.test(msg);
      if (!isDup) {
        console.error("[manage/checkin] arrival insert failed", error);
        haptic.error();
        setFlashErr(guestId);
        showToast("הסימון נכשל — נסו שוב", "error");
        // Roll back the optimistic flip.
        setGuests((prev) =>
          prev.map((g) => (g.id === guestId ? { ...g, arrived: false } : g)),
        );
        const te = window.setTimeout(() => setFlashErr(null), 240);
        flashRef.current = () => window.clearTimeout(te);
        return;
      }
    }

    // R26 — luxe success feedback: haptic + subtle sound + brief glow flash.
    haptic.success();
    playManagerSound("checkin");
    setFlashOk(guestId);
    const tf = window.setTimeout(() => setFlashOk(null), 240);
    flashRef.current = () => window.clearTimeout(tf);

    const checked = guests.find((g) => g.id === guestId);
    const checkedTable = checked?.tableId
      ? localState?.tables?.find((t) => t.id === checked.tableId)?.name
      : undefined;
    showToast(
      `✅ ${checked?.name ?? "האורח"} · שולחן ${checkedTable ?? "—"}`,
      "success",
    );

    // R20 Phase 3 — build the wa.me URL so the manager can send the guest
    // their table + welcome card with one tap. Only meaningful when the
    // guest has a phone AND we know their table (table label comes from
    // the assignments map → state.tables[i].name).
    const guest = guests.find((g) => g.id === guestId);
    if (guest?.phone && guest.tableId && localState?.event) {
      const table = localState.tables?.find((t) => t.id === guest.tableId);
      if (table) {
        const { url, valid } = buildGuestWelcomeWhatsapp({
          guestName: guest.name,
          guestPhone: guest.phone,
          guestId: guest.id,
          eventId,
          tableLabel: table.name,
          hostName: localState.event.hostName,
          partnerName: localState.event.partnerName,
        });
        if (valid) setLastCheckedGuest({ guestId, waUrl: url });
      }
    }
  };

  const filtered = guests.filter(
    (g) => !search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const arrivedCount = guests.filter((g) => g.arrived).length;
  // R26 — animate the arrivals number whenever it grows.
  const arrivedDisplay = useCountUp(arrivedCount, 1200);

  if (!authorized || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20 r26-rise">
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            href={`/manage/${eventId}`}
            aria-label="חזרה לדשבורד"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <ArrowRight size={20} aria-hidden />
          </Link>
          <div className="flex-1">
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--foreground-muted)" }}
            >
              צ&apos;ק-אין בכניסה
            </div>
            <div className="font-bold text-sm">
              <span className="ltr-num">{arrivedDisplay}</span> / <span className="ltr-num">{guests.length}</span> הגיעו
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-5 pt-4">
        <h1 className="text-lg font-bold mb-3">✏️ צ&apos;ק-אין ידני</h1>

        {/* R26 — decorative scanner-style frame. There is no camera; this is
            a stylistic nod around the existing search + results list. */}
        <div
          className="relative rounded-2xl p-4 mb-4"
          style={{
            border: "1px solid var(--border)",
            boxShadow: "0 0 24px -6px rgba(34,211,238,0.5)",
          }}
        >
          {/* 4 cyan corner brackets */}
          <span
            aria-hidden
            className="absolute top-2 right-2 rounded-tr-md"
            style={{
              width: 28,
              height: 28,
              borderTop: "2px solid rgb(34,211,238)",
              borderRight: "2px solid rgb(34,211,238)",
            }}
          />
          <span
            aria-hidden
            className="absolute top-2 left-2 rounded-tl-md"
            style={{
              width: 28,
              height: 28,
              borderTop: "2px solid rgb(34,211,238)",
              borderLeft: "2px solid rgb(34,211,238)",
            }}
          />
          <span
            aria-hidden
            className="absolute bottom-2 right-2 rounded-br-md"
            style={{
              width: 28,
              height: 28,
              borderBottom: "2px solid rgb(34,211,238)",
              borderRight: "2px solid rgb(34,211,238)",
            }}
          />
          <span
            aria-hidden
            className="absolute bottom-2 left-2 rounded-bl-md"
            style={{
              width: 28,
              height: 28,
              borderBottom: "2px solid rgb(34,211,238)",
              borderLeft: "2px solid rgb(34,211,238)",
            }}
          />

          <div className="relative">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
              style={{ color: "var(--foreground-muted)" }}
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש שם של אורח..."
              className="input pr-10 text-base"
              autoFocus
            />
          </div>

          {/* Looping cyan scan line */}
          <div
            aria-hidden
            className="relative mt-3 h-0.5 w-full overflow-hidden"
          >
            <div
              className="r26-scanline"
              style={{
                height: 2,
                width: "100%",
                background: "rgb(34,211,238)",
              }}
            />
          </div>
          <p
            className="mt-2 text-center text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            חפש אורח לצ&apos;ק-אין מהיר
          </p>
        </div>

        <div className="space-y-2">
          {filtered.map((g, i) => {
            // R20 Phase 3 — surface the WhatsApp welcome link only on the
            // guest that was JUST checked in (matches recentlyChecked +
            // lastCheckedGuest). It fades out 2s later when recentlyChecked
            // clears, so the row goes back to its compact one-line layout.
            const showWelcomeCta =
              recentlyChecked === g.id &&
              lastCheckedGuest?.guestId === g.id &&
              !!lastCheckedGuest.waUrl;
            return (
              <div
                key={g.id}
                className={`card p-4 transition ${
                  i < 6 ? "r26-rise-sm" : ""
                } ${recentlyChecked === g.id ? "ring-2 ring-emerald-400" : ""} ${
                  flashOk === g.id ? "r26-flash-ok" : ""
                } ${flashErr === g.id ? "r26-flash-err" : ""}`}
                style={i < 6 ? { animationDelay: `${i * 60}ms` } : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{g.name}</div>
                    {g.phone && (
                      <div
                        className="text-xs ltr-num"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        {g.phone}
                      </div>
                    )}
                  </div>
                  {g.arrived ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <Check size={14} aria-hidden /> הגיע
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCheckIn(g.id, 1)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold"
                        style={{
                          background: "var(--input-bg)",
                          border: "1px solid var(--border-strong)",
                        }}
                        aria-label={`סמן את ${g.name} כהגיע + 1 נוסף`}
                      >
                        <UserPlus size={12} aria-hidden /> +1
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCheckIn(g.id, 0)}
                        className="btn-gold inline-flex items-center gap-1 px-4 py-2 text-sm"
                        aria-label={`סמן את ${g.name} כהגיע`}
                      >
                        <Check size={14} aria-hidden /> הגיע
                      </button>
                    </div>
                  )}
                </div>
                {showWelcomeCta && (
                  <a
                    href={lastCheckedGuest.waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition w-full justify-center"
                  >
                    <MessageCircle size={14} aria-hidden /> שלח לו פרטי שולחן ב-WhatsApp
                  </a>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div
              className="card p-8 text-center text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              {search.trim() ? "אין תוצאות" : "אין אורחים ברשימה"}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
