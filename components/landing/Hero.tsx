import Link from "next/link";
import { ArrowLeft, PlayCircle } from "lucide-react";

/**
 * R48 — the landing hero. Calm gold orb + two very-soft accent orbs, a
 * "made in Israel" badge, the launch banner, the emotional shimmering
 * H1, two CTAs, a social-proof row and a trust line. Server component
 * (no client JS) — fade-up + shimmer are CSS only.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pt-10 pb-20 md:pt-14 md:pb-28">
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[820px] h-[820px] -top-72 left-1/2 -translate-x-1/2 opacity-40"
      />
      {/* R48 — two whisper-quiet accent orbs for depth (don't shout). */}
      <div
        aria-hidden
        className="glow-orb glow-orb-rose w-[360px] h-[360px] -top-20 left-0 opacity-[0.15]"
      />
      <div
        aria-hidden
        className="glow-orb glow-orb-emerald w-[420px] h-[420px] bottom-0 right-0 opacity-[0.15]"
      />

      <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center relative z-10">
        {/* Made-in-Israel badge */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] sm:text-xs fade-up"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--border)",
            color: "var(--foreground-muted)",
          }}
        >
          ✨ נבנה בישראל · בעברית מלאה
        </div>

        {/* Calm value chip — replaces the launch/pricing banner. No price,
            no countdown, just the one-line promise. */}
        <div
          className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs sm:text-sm fade-up"
          style={{
            background:
              "linear-gradient(135deg, rgba(244,222,169,0.18), rgba(168,136,74,0.10))",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
          }}
        >
          💍 כל האירוע — במערכת אחת
        </div>

        <h1
          className="mt-7 font-extrabold tracking-tight leading-[1.05] fade-up"
          style={{ animationDelay: "0.05s" }}
        >
          <span
            className="block gradient-gold-shimmer"
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
          מוזמנים, אישורי הגעה ב-WhatsApp ובשיחה אוטומטית, תקציב חכם, סידור
          הושבה ויום-האירוע עצמו.
          <br className="hidden sm:block" />
          הכל מתנהל במקום אחד — בלי עשרות הודעות ובלי אקסלים.
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
            התחילו עכשיו
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

        {/* R118 — sub-CTA row for the two existing-user paths. Sits
            below the hero buttons in a smaller, calmer style so it
            never competes with the primary "התחילו בחינם" CTA. Two
            elegantly-bordered pills: regular sign-in (couples app) +
            vendor sign-in (vendor dashboard). Mobile-first: the pair
            wraps vertically + centers on small screens. */}
        <div
          className="mt-5 flex flex-wrap items-center justify-center gap-2 fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <span
            className="text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            כבר רשומים?
          </span>
          <Link
            href="/signup?mode=signin"
            className="inline-flex items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition hover:translate-y-[-1px]"
            style={{
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              minHeight: 38,
              background: "var(--surface-2)",
            }}
          >
            כניסה לזוגות
          </Link>
          <span
            className="text-xs"
            style={{ color: "var(--foreground-muted)" }}
            aria-hidden
          >
            ·
          </span>
          <Link
            href="/signup?mode=signin&role=vendor"
            className="inline-flex items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition hover:translate-y-[-1px]"
            style={{
              border: "1px solid var(--border-gold)",
              color: "var(--accent)",
              minHeight: 38,
              background:
                "color-mix(in srgb, var(--gold-100) 8%, transparent)",
              boxShadow: "0 4px 14px -8px var(--accent-glow)",
            }}
          >
            כניסה כספק
            <ArrowLeft size={14} aria-hidden />
          </Link>
        </div>

        {/* R151 — honest trust line. No fabricated counts, no pricing
            claims. Every item here is literally true of the product. */}
        <div
          className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs sm:text-sm fade-up"
          style={{ color: "var(--foreground-muted)", animationDelay: "0.2s" }}
        >
          <span>✓ מותאם לישראל · בעברית מלאה</span>
          <span>✓ נשמר אוטומטית בענן</span>
          <span>✓ האורחים לא צריכים להוריד כלום</span>
        </div>
      </div>
    </section>
  );
}
