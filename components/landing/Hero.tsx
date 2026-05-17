import Link from "next/link";
import { ArrowLeft, PlayCircle } from "lucide-react";

/**
 * R42 — the landing hero. One calm gold orb, a launch banner, the
 * emotional H1, two CTAs and a trust line. Server component (no client
 * JS) — fade-up is CSS only.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-10 pb-20 md:pt-14 md:pb-28">
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[820px] h-[820px] -top-72 left-1/2 -translate-x-1/2 opacity-40"
      />

      <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center relative z-10">
        {/* Launch banner */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs sm:text-sm fade-up"
          style={{
            background:
              "linear-gradient(135deg, rgba(244,222,169,0.16), rgba(168,136,74,0.10))",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
          }}
        >
          🚀 השקה — רק 100 הזוגות הראשונים במחיר ₪99{" "}
          <span style={{ color: "var(--foreground-muted)" }}>
            (במקום ₪399)
          </span>
        </div>

        <h1
          className="mt-7 font-extrabold tracking-tight leading-[1.05] fade-up"
          style={{ animationDelay: "0.05s" }}
        >
          <span
            className="block gradient-gold"
            style={{ fontSize: "clamp(2.75rem, 9vw, 4.75rem)" }}
          >
            תכננו את האירוע.
          </span>
          <span
            className="block gradient-text font-bold"
            style={{ fontSize: "clamp(2rem, 6.5vw, 3.5rem)" }}
          >
            חיו את הרגעים.
          </span>
        </h1>

        <p
          className="mt-7 mx-auto max-w-2xl leading-relaxed fade-up"
          style={{
            fontSize: "clamp(1.05rem, 2.5vw, 1.35rem)",
            color: "var(--foreground-soft)",
            animationDelay: "0.1s",
          }}
        >
          בלי 300 הודעות בוואצפ. בלי 12 אקסלים. בלי בלאגן.
          <br className="hidden sm:block" />
          האפליקציה היחידה בארץ שמנהלת לכם את כל האירוע במקום אחד.
        </p>

        <div
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 fade-up"
          style={{ animationDelay: "0.15s" }}
        >
          <Link
            href="/signup"
            className="btn-gold inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            style={{ minHeight: 60, fontSize: "1.05rem", padding: "0 2rem" }}
          >
            התחל בחינם
            <ArrowLeft size={18} />
          </Link>
          <a
            href="#showcase"
            className="btn-secondary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            style={{ minHeight: 60 }}
          >
            <PlayCircle size={18} />
            צפו איך זה עובד
          </a>
        </div>

        <div
          className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs sm:text-sm fade-up"
          style={{ color: "var(--foreground-muted)", animationDelay: "0.2s" }}
        >
          <span>✓ ללא כרטיס אשראי</span>
          <span>✓ ביטול בכל רגע</span>
          <span>✓ בעברית, בארץ, בעיצוב יוקרתי</span>
        </div>
      </div>
    </section>
  );
}
