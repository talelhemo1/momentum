"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState } from "@/lib/types";
import { generateReport, type EventReport } from "@/lib/reportGenerator";
import { useCountUp } from "@/lib/useCountUp";
import { Confetti } from "@/components/managerLive/Confetti";
import { haptic } from "@/lib/haptic";
import { Loader2, Crown, Share2, ChevronRight, ChevronLeft } from "lucide-react";

/**
 * R27 — post-event "Wrapped"-style report. Auth (host OR accepted
 * manager) is preserved from the previous version; the data now comes
 * from local AppState via generateReport(). The render is a full-screen
 * auto-advancing slide deck — the peak emotional moment of the app.
 */
export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [authorized, setAuthorized] = useState(false);
  const [report, setReport] = useState<EventReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace(`/manage/${eventId}`);
      return;
    }
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      if (!m) {
        router.replace(`/manage/${eventId}`);
        return;
      }
      setAuthorized(true);

      let state: Partial<AppState> | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.app);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppState>;
          if (parsed.event?.id === eventId) state = parsed;
        }
      } catch {
        /* malformed local state — handled by the no-report branch */
      }
      setReport(state ? generateReport(state as AppState) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, router]);

  if (!authorized || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "#0B0A08" }}>
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!report) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5" style={{ background: "#0B0A08" }}>
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

  return <WrappedDeck report={report} backHref={`/manage/${eventId}`} />;
}

// ─────────────────────────── Wrapped deck ───────────────────────────

function WrappedDeck({
  report,
  backHref,
}: {
  report: EventReport;
  backHref: string;
}) {
  const slides = buildSlides(report);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const isLast = i === slides.length - 1;

  // Auto-advance every 5s (stops on the last slide / when paused).
  useEffect(() => {
    if (paused || isLast) return;
    const t = window.setTimeout(() => setI((n) => Math.min(slides.length - 1, n + 1)), 5000);
    return () => window.clearTimeout(t);
  }, [i, paused, isLast, slides.length]);

  useEffect(() => {
    haptic.light();
  }, [i]);

  const go = (dir: 1 | -1) =>
    setI((n) => Math.max(0, Math.min(slides.length - 1, n + dir)));

  return (
    <main
      className="fixed inset-0 z-[70] overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #2A2012, #0B0A08 70%)",
      }}
    >
      {isLast && <Confetti count={70} />}

      {/* Progress dots */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex gap-1.5 px-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        {slides.map((_, idx) => (
          <div
            key={idx}
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg,#F4DEA9,#A8884A)",
                width: idx < i ? "100%" : idx === i ? "100%" : "0%",
                transition: idx === i ? "width 5s linear" : "none",
              }}
            />
          </div>
        ))}
      </div>

      {/* Tap zones: right→prev, left→next (RTL) */}
      <button
        aria-label="הקודם"
        className="absolute inset-y-0 right-0 w-1/3 z-10"
        onClick={() => go(-1)}
      />
      <button
        aria-label="הבא"
        className="absolute inset-y-0 left-0 w-1/3 z-10"
        onClick={() => go(1)}
      />

      <button
        onClick={() => setPaused((p) => !p)}
        className="absolute top-4 left-4 z-20 text-xs px-2.5 py-1 rounded-full"
        style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", marginTop: "env(safe-area-inset-top)" }}
      >
        {paused ? "▶︎" : "❚❚"}
      </button>

      {/* Slide */}
      <div key={i} className="absolute inset-0 flex items-center justify-center px-8 text-center r26-rise">
        {slides[i].node}
      </div>

      {/* Bottom controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => go(-1)}
          disabled={i === 0}
          className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.07)", color: "#fff" }}
          aria-label="הקודם"
        >
          <ChevronRight size={20} />
        </button>

        {isLast ? (
          <ShareButton report={report} />
        ) : (
          <Link
            href={backHref}
            className="text-xs"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            דלג
          </Link>
        )}

        <button
          onClick={() => go(1)}
          disabled={isLast}
          className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.07)", color: "#fff" }}
          aria-label="הבא"
        >
          <ChevronLeft size={20} />
        </button>
      </div>
    </main>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-extrabold gradient-gold leading-none"
      style={{ fontSize: "clamp(56px, 20vw, 120px)" }}
    >
      {children}
    </div>
  );
}
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 text-lg md:text-xl" style={{ color: "rgba(255,255,255,0.8)" }}>
      {children}
    </p>
  );
}

function CountSlide({ value, suffix, caption }: { value: number; suffix?: string; caption: string }) {
  const n = useCountUp(value, 1600);
  return (
    <div>
      <Big>
        {n.toLocaleString("he-IL")}
        {suffix}
      </Big>
      <Cap>{caption}</Cap>
    </div>
  );
}

function buildSlides(r: EventReport): Array<{ node: React.ReactNode }> {
  const slides: Array<{ node: React.ReactNode }> = [];

  slides.push({
    node: (
      <div>
        <div className="r26-crown inline-block">
          <div className="r26-crown-inner">
            <Crown size={72} className="text-[--accent]" aria-hidden />
          </div>
        </div>
        <h1 className="mt-8 text-3xl md:text-4xl font-extrabold gradient-gold">
          {r.hostNames}
        </h1>
        <Cap>הסיכום של האירוע שלכם ✨</Cap>
      </div>
    ),
  });

  slides.push({
    node: <CountSlide value={r.durationHours} caption="שעות של חגיגה בלתי נשכחת" />,
  });

  slides.push({
    node: (
      <CountSlide
        value={r.totalArrivals}
        caption={`מוזמנים חגגו איתכם — ${Math.round(r.arrivalRate * 100)}% הגעה`}
      />
    ),
  });

  slides.push({
    node: (
      <div>
        <div className="text-6xl">🕺💃</div>
        <Cap>רחבת הריקודים לא נחה לרגע</Cap>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          הרגע שכולם חיכו לו
        </p>
      </div>
    ),
  });

  slides.push({
    node: (
      <div>
        <Big>{r.vendorNames.length || "—"}</Big>
        <Cap>ספקים יצרו את הקסם</Cap>
        {r.vendorNames.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-sm mx-auto">
            {r.vendorNames.map((v) => (
              <span
                key={v}
                className="text-sm px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(212,176,104,0.14)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                }}
              >
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    ),
  });

  if (r.envelopeTotal && r.envelopeTotal > 0) {
    slides.push({
      node: (
        <CountSlide
          value={Math.round(r.envelopeTotal)}
          suffix="₪"
          caption="נאספו במעטפות 💌"
        />
      ),
    });
  }

  slides.push({
    node: (
      <CountSlide
        value={r.memoryNotesCount}
        caption="רגעים נשמרו ב-Memory Album 📷"
      />
    ),
  });

  slides.push({
    node: (
      <div>
        <div className="text-6xl">💛</div>
        <h2 className="mt-6 text-2xl md:text-3xl font-extrabold gradient-gold">
          תודה ש-Momentum היה חלק מהיום שלכם
        </h2>
        <Cap>שיתוף הסיכום ⬇︎</Cap>
      </div>
    ),
  });

  return slides;
}

function ShareButton({ report }: { report: EventReport }) {
  const busy = useRef(false);

  const share = async () => {
    if (busy.current) return;
    busy.current = true;
    haptic.success();
    try {
      const W = 1080;
      const H = 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2A2012");
      g.addColorStop(1, "#0B0A08");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = "center";
      ctx.fillStyle = "#F4DEA9";
      ctx.font = "bold 64px sans-serif";
      ctx.fillText("Momentum", W / 2, 240);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 80px sans-serif";
      ctx.fillText(report.hostNames, W / 2, 520);

      ctx.fillStyle = "#E6C887";
      ctx.font = "bold 180px sans-serif";
      ctx.fillText(
        `${report.totalArrivals}`,
        W / 2,
        900,
      );
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "44px sans-serif";
      ctx.fillText("אורחים חגגו איתנו", W / 2, 1000);

      ctx.font = "52px sans-serif";
      ctx.fillStyle = "#E6C887";
      ctx.fillText(
        `${report.durationHours} שעות · ${Math.round(report.arrivalRate * 100)}% הגעה`,
        W / 2,
        1200,
      );

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "40px sans-serif";
      ctx.fillText("נבנה ב-Momentum 💛", W / 2, 1780);

      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png"),
      );
      if (!blob) return;
      const file = new File([blob], "momentum-wrapped.png", {
        type: "image/png",
      });

      const navAny = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
      };
      if (navAny.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: "הסיכום שלנו",
          text: "האירוע שלנו ב-Momentum 💛",
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "momentum-wrapped.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* user cancelled the share sheet — no-op */
    } finally {
      busy.current = false;
    }
  };

  return (
    <button
      onClick={share}
      className="btn-gold inline-flex items-center gap-2 py-3 px-6 text-sm font-bold"
    >
      <Share2 size={16} /> שתף את הסיכום
    </button>
  );
}
