"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Heart, MapPin, Clock } from "lucide-react";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState } from "@/lib/types";

/**
 * R20 Phase 3 — public guest "welcome pass".
 *
 * URL: /pass/[eventId]/[guestId]
 *
 * Reached via the wa.me message a manager sends after door check-in. Shows
 * the guest their table, the hosts' names, the date, and the venue.
 *
 * MVP scope: data comes from `localStorage` on the host's device. If the
 * guest opens this on their phone (which won't have the host's AppState),
 * the page falls back to a graceful empty-state. Phase 4 will move event
 * state to a Supabase events table so any guest can resolve their pass.
 *
 * Single client component — the spec's server+client split in one file is
 * not valid Next.js; we use `useParams()` for the dynamic segments instead.
 */
export default function GuestPassPage() {
  const params = useParams();
  const eventId =
    typeof params.eventId === "string" ? params.eventId : "";
  const guestId =
    typeof params.guestId === "string" ? params.guestId : "";

  const [data, setData] = useState<{
    guestName: string;
    tableLabel: string;
    hostName: string;
    eventDate: string;
    venue?: string;
  } | null>(null);
  const [resolved, setResolved] = useState(false);

  // Read-localStorage-on-mount pattern. Multiple setState calls (the
  // resolved flag fires from 4 different paths). Disabling the rule for
  // the whole effect body — this is the documented "mirror an external
  // value into local state" pattern.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stateRaw = localStorage.getItem(STORAGE_KEYS.app);
      if (!stateRaw) {
        setResolved(true);
        return;
      }
      const state = JSON.parse(stateRaw) as Partial<AppState>;
      if (state.event?.id !== eventId) {
        setResolved(true);
        return;
      }
      const guest = state.guests?.find((g) => g.id === guestId);
      // Real schema: there's no Guest.tableId — assignments live in
      // state.seatAssignments. Look up the table id via the map.
      const tableId = state.seatAssignments?.[guestId];
      const table = state.tables?.find((t) => t.id === tableId);
      // SeatingTable.name (not .label). EventInfo exposes synagogue + city —
      // no `venue` field; we prefer synagogue (specific venue name) then
      // fall back to city.
      const venue = state.event.synagogue || state.event.city || undefined;

      setData({
        guestName: guest?.name ?? "",
        tableLabel: table?.name ?? "",
        hostName:
          state.event.hostName +
          (state.event.partnerName ? ` ו-${state.event.partnerName}` : ""),
        eventDate: state.event.date,
        venue,
      });
      setResolved(true);
    } catch (e) {
      console.error("[pass] failed to read local state", e);
      setResolved(true);
    }
  }, [eventId, guestId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!resolved) {
    return <main className="min-h-screen" aria-busy="true" />;
  }

  if (!data || !data.guestName || !data.tableLabel) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <p className="font-semibold">לא נמצא מידע על הכרטיס</p>
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--foreground-soft)" }}
          >
            ב-MVP הראשון פרטי הכרטיס נשמרים אצל המארחים. בקש מהם לפתוח את
            הקישור בנייד שלך פעם אחת, או פנה למארחי האירוע ישירות.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20">
      <section className="card-gold p-8 text-center relative overflow-hidden mx-5 mt-8 max-w-md md:mx-auto">
        <div
          aria-hidden
          className="absolute -top-20 -end-20 w-56 h-56 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(212,176,104,0.30), transparent 70%)" }}
        />
        <div className="relative">
          <Logo size={24} />
          <Heart size={32} className="mx-auto mt-6 text-[--accent]" aria-hidden />
          <h1 className="mt-4 text-2xl font-extrabold gradient-gold">
            ברוך/ה הבא/ה {data.guestName}!
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            {data.hostName}
          </p>
        </div>
      </section>

      <section className="max-w-md mx-auto mt-6 px-5">
        <div className="card-gold p-6 text-center">
          <div
            className="text-xs uppercase tracking-wider"
            style={{ color: "var(--foreground-muted)" }}
          >
            השולחן שלך
          </div>
          <div className="mt-3 text-5xl font-extrabold gradient-gold ltr-num">
            {data.tableLabel}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {data.eventDate && (
            <div className="card p-4 flex items-center gap-3">
              <Clock size={18} className="text-[--accent]" aria-hidden />
              <span className="text-sm">
                {(() => {
                  const d = new Date(data.eventDate);
                  return Number.isNaN(d.getTime())
                    ? data.eventDate
                    : d.toLocaleDateString("he-IL", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      });
                })()}
              </span>
            </div>
          )}
          {data.venue && (
            <div className="card p-4 flex items-center gap-3">
              <MapPin size={18} className="text-[--accent]" aria-hidden />
              <span className="text-sm">{data.venue}</span>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
