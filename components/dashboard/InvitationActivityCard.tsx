"use client";

import { useEffect, useMemo, useRef } from "react";
import { Eye, UserCheck, UserCircle2 } from "lucide-react";
import { useInvitationViews } from "@/lib/useInvitationViews";
import { useCountUp } from "@/lib/useCountUp";
import { useNow } from "@/lib/useNow";
import { showToast } from "@/components/Toast";
import { haptic } from "@/lib/haptic";

function relTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "הרגע";
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  const d = Math.floor(h / 24);
  return `לפני ${d} ימים`;
}

/**
 * R32 — "who opened my invitation", live. Big animated total, last-hour
 * stat, and a feed of the 5 most recent opens. Every genuinely new open
 * (arriving after mount, recent) fires a toast + light haptic so the
 * couple feels it land. `prefers-reduced-motion` is honored by useCountUp
 * and the CSS (`.r26-rise-sm` no-ops under the reduced-motion query).
 */
export function InvitationActivityCard({ eventId }: { eventId: string }) {
  const views = useInvitationViews(eventId);

  // `useNow` (not `Date.now()` in render — that trips react-hooks/purity).
  // 60s refresh keeps "לפני N דק׳" honest without a per-second clock.
  // null only on the pre-mount frame; the dashboard already gates this
  // card behind `hydrated`, so 0 is never actually shown.
  const now = useNow(60_000) ?? 0;

  const total = views.length;
  const animatedTotal = useCountUp(total);
  const lastHour = useMemo(
    () =>
      views.filter((v) => now - new Date(v.viewed_at).getTime() < 3_600_000)
        .length,
    [views, now],
  );

  // Toast only genuinely-new opens: skip the initial fetch batch, then
  // for any unseen id that's recent (<45s) surface it once.
  const knownIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      for (const v of views) knownIds.current.add(v.id);
      return;
    }
    // Date.now() is fine inside an effect (purity rule is render-only) —
    // and we want a precise clock here, not the 60s-bucketed `now`.
    const nowMs = Date.now();
    let firstNew: (typeof views)[number] | null = null;
    for (const v of views) {
      if (knownIds.current.has(v.id)) continue;
      knownIds.current.add(v.id);
      const fresh = nowMs - new Date(v.viewed_at).getTime() < 45_000;
      if (fresh && !firstNew) firstNew = v;
    }
    if (firstNew) {
      showToast(
        `👁️ ${firstNew.guest_name ?? "מוזמן"} פתח/ה את ההזמנה`,
        "info",
      );
      haptic.light();
    }
  }, [views]);

  const feed = views.slice(0, 5);

  return (
    <section className="card-gold p-6 md:p-7 mt-8 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-16 -end-16 w-48 h-48 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.18),transparent_70%)] blur-2xl"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-[--accent]" aria-hidden />
            <h3 className="font-bold text-lg">פתיחות הזמנה</h3>
          </div>
          <span className="pill pill-gold">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "rgb(110,231,183)" }}
              aria-hidden
            />
            חי
          </span>
        </div>

        <div className="mt-5 flex items-end gap-5">
          <div>
            <div className="text-6xl md:text-7xl font-extrabold tracking-tight gradient-gold ltr-num leading-none">
              {animatedTotal}
            </div>
            <div
              className="text-xs mt-2"
              style={{ color: "var(--foreground-muted)" }}
            >
              סה״כ פתיחות
            </div>
          </div>
          {total > 0 && (
            <div className="pb-1">
              <div className="text-lg font-bold ltr-num text-[--accent]">
                {lastHour}
              </div>
              <div
                className="text-[11px]"
                style={{ color: "var(--foreground-muted)" }}
              >
                בשעה האחרונה
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          {feed.length === 0 ? (
            <div
              className="card p-5 text-center text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              עדיין אף אחד לא פתח את ההזמנה. ברגע שמוזמן ילחץ — תראו את זה
              כאן בזמן אמת.
            </div>
          ) : (
            <div className="space-y-2">
              {feed.map((v, i) => (
                <div
                  key={v.id}
                  className="card p-3.5 flex items-center justify-between r26-rise-sm"
                  style={{ animationDelay: `${Math.min(i, 5) * 0.05}s` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: v.guest_name
                          ? "rgba(212,176,104,0.15)"
                          : "rgba(255,255,255,0.06)",
                        color: v.guest_name
                          ? "var(--accent)"
                          : "var(--foreground-muted)",
                      }}
                      aria-hidden
                    >
                      {v.guest_name ? (
                        <UserCheck size={17} />
                      ) : (
                        <UserCircle2 size={17} />
                      )}
                    </span>
                    <span className="font-medium truncate">
                      {v.guest_name ? (
                        <>
                          <span className="text-[--accent]">✨ </span>
                          {v.guest_name}
                          <span
                            className="font-normal"
                            style={{ color: "var(--foreground-soft)" }}
                          >
                            {" "}
                            פתח/ה את ההזמנה
                          </span>
                        </>
                      ) : (
                        <span
                          style={{ color: "var(--foreground-soft)" }}
                        >
                          👤 פתיחה אנונימית
                        </span>
                      )}
                    </span>
                  </div>
                  <span
                    className="text-xs shrink-0"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {relTime(v.viewed_at, now)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
