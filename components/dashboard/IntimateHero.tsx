"use client";

import { Sparkles } from "lucide-react";
import type { EventInfo } from "@/lib/types";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { EVENT_TYPE_EMOJI } from "@/lib/invitationMessage";
import { formatEventDate } from "@/lib/format";
import { useCountUp } from "@/lib/useCountUp";

/**
 * R41 — the intimate dashboard hero. The couple's names, the date, and
 * a big animated countdown — nothing transactional. Gradient-only
 * background (EventInfo has no cover-photo field; the spec's optional
 * `coverPhotoUrl` branch is intentionally omitted rather than adding an
 * unused schema field). `useCountUp` already honors reduced-motion.
 */
export function IntimateHero({
  event,
  daysLeft,
}: {
  event: EventInfo;
  /** null until the client mounts (useNow) — render a calm placeholder. */
  daysLeft: number | null;
}) {
  const names = event.partnerName
    ? `${event.hostName} ו-${event.partnerName}`
    : event.hostName;
  const emoji = EVENT_TYPE_EMOJI[event.type] ?? "✨";
  const typeLabel = EVENT_TYPE_LABELS[event.type] ?? "אירוע";
  const dateStr = formatEventDate(event.date, "long");

  const safeDays = daysLeft != null && daysLeft > 0 ? daysLeft : 0;
  const animDays = useCountUp(safeDays);
  const past = daysLeft != null && daysLeft < 0;
  const today = daysLeft === 0;

  return (
    <section
      className="relative overflow-hidden rounded-3xl mt-4"
      style={{
        minHeight: "min(60vh, 460px)",
        background:
          "radial-gradient(120% 80% at 50% -10%, rgba(212,176,104,0.22), transparent 60%), linear-gradient(180deg, #0E0B07 0%, #07060A 100%)",
        border: "1px solid var(--border-gold)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full opacity-50 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(244,222,169,0.18), transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-6 py-12 md:py-16">
        <span
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
          }}
        >
          <span aria-hidden>{emoji}</span>
          {typeLabel}
        </span>

        <h1
          className="mt-6 font-extrabold tracking-tight gradient-gold leading-[1.08]"
          style={{ fontSize: "clamp(2.5rem, 7vw, 3.5rem)" }}
        >
          {names}
        </h1>

        {dateStr && (
          <p
            className="mt-4 text-lg md:text-xl"
            style={{ color: "var(--foreground-soft)" }}
          >
            {dateStr}
          </p>
        )}

        <div className="mt-10">
          {daysLeft == null ? (
            <div
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              <Sparkles size={14} className="text-[--accent]" />
              סופרים את הימים…
            </div>
          ) : past ? (
            <div className="text-2xl md:text-3xl font-bold gradient-gold">
              🎉 חגגתם! תודה שתכננתם איתנו
            </div>
          ) : today ? (
            <div className="text-3xl md:text-5xl font-extrabold gradient-gold">
              🎉 היום הגדול הגיע!
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div
                className="text-xs uppercase tracking-[0.25em]"
                style={{ color: "var(--foreground-muted)" }}
              >
                עוד
              </div>
              <div
                className="font-extrabold gradient-gold ltr-num tabular-nums leading-none mt-2"
                style={{ fontSize: "clamp(3.5rem, 14vw, 6rem)" }}
              >
                {animDays}
              </div>
              <div
                className="text-base md:text-lg mt-1"
                style={{ color: "var(--foreground-soft)" }}
              >
                {safeDays === 1 ? "יום לאירוע" : "ימים לאירוע"}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
