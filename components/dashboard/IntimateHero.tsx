"use client";

import type { EventInfo } from "@/lib/types";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { EVENT_TYPE_EMOJI } from "@/lib/invitationMessage";
import { formatEventDate } from "@/lib/format";
import { LivingSpark } from "@/components/dashboard/LivingSpark";
import { LiveCountdown } from "@/components/dashboard/LiveCountdown";

/**
 * R138 — IntimateHero, "Save-the-Date" luxury edition.
 *
 * The user's request: make the names + date block the most beautiful
 * thing in the app. R77 already polished it (smaller, shimmer text,
 * orb). R138 re-architects it as a ceremonial save-the-date card:
 *
 *   1. Layered background — slow rotating conic gold halo (~28s),
 *      a paper-grain SVG noise overlay, layered radial gold orbs.
 *   2. Inner double-hairline frame — "passe-partout" effect, the
 *      printed-invitation cue your eye reads as ceremonial.
 *   3. Corner ornaments — small SVG filigrees in all four corners.
 *   4. Names in Frank Ruhl Libre (the Hebrew display serif used by
 *      Haaretz + premium Israeli editorial design) with a slow gold
 *      shimmer + soft glow text-shadow + a beating gold floret
 *      between the partners' names.
 *   5. Date in engraved/letterpressed style — caps + wide tracking +
 *      gold, framed between two hairline rules + a diamond floret.
 *   6. LivingSpark sits inside a soft breathing gold halo; the
 *      live countdown follows, anchored by a thin gold rule.
 *
 * All animations gracefully fall back under prefers-reduced-motion
 * (handled in globals.css). The CSS lives under `.hero-luxury*`.
 */
export function IntimateHero({
  event,
  daysLeft,
  progress,
}: {
  event: EventInfo;
  /** null until the client mounts (useNow) — render a calm placeholder. */
  daysLeft: number | null;
  /** 0–100 journey progress — enriches the spark's aria description. */
  progress?: number;
}) {
  const hasPartner = !!event.partnerName?.trim();
  const emoji = EVENT_TYPE_EMOJI[event.type] ?? "✨";
  const typeLabel = EVENT_TYPE_LABELS[event.type] ?? "אירוע";
  const dateStr = formatEventDate(event.date, "long");

  const past = daysLeft != null && daysLeft < 0;
  const today = daysLeft === 0;

  // R76 (R63) — contextual subtitle paired with the live countdown.
  // Phrasing stays the same as R77; rendered with refined typography
  // under the countdown so it reads as a quiet whisper rather than UI.
  let countdownCaption = "";
  if (daysLeft != null && daysLeft > 0) {
    if (daysLeft > 30) {
      countdownCaption = "עוד יש זמן — תקבלו החלטות בקצב הנכון";
    } else if (daysLeft > 7) {
      countdownCaption = "החודש הבא קריטי — כל פגישה חשובה";
    } else if (daysLeft > 1) {
      countdownCaption = "השבוע האחרון. תהיו מרוכזים בעצמכם";
    } else {
      countdownCaption = "מחר אתם מתחתנים. עוצרים, נושמים, מתרגשים.";
    }
  }

  return (
    <section
      className="hero-luxury mt-4"
      style={{
        // Base background: warm dark gradient that lets the conic
        // halo bloom through. Border kept hairline because the
        // inner-frame (double hairline) does the heavy visual work.
        background:
          "radial-gradient(140% 80% at 50% -20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%), linear-gradient(180deg, var(--background-2) 0%, var(--background) 100%)",
        border: "1px solid var(--border-gold)",
        boxShadow:
          "inset 0 1px 0 rgba(244,222,169,0.18), 0 30px 70px -30px var(--accent-glow), 0 12px 40px -12px rgba(0,0,0,0.55)",
      }}
      aria-label="כותרת האירוע"
    >
      {/* Background layers — order matters: conic first (lowest),
          then grain, then frame, then ornaments. All pointer-events
          none so the content above stays interactive (none of the
          children of this hero are interactive today, but futureproof). */}
      <div aria-hidden className="hero-luxury-conic" />
      <div aria-hidden className="hero-luxury-grain" />
      <div aria-hidden className="hero-luxury-frame" />
      {/* R159 — premium foil sheen sweep + twinkling gold sparkles.
          Desktop-only / reduced-motion-safe (see globals.css). */}
      <div aria-hidden className="hero-luxury-sheen" />
      <Spark className="hero-luxury-spark s1" />
      <Spark className="hero-luxury-spark s2" />
      <Spark className="hero-luxury-spark s3" />
      <Spark className="hero-luxury-spark s4" />

      {/* Four corner ornaments. Each is the same SVG path; the CSS
          (`.tl/.tr/.bl/.br`) flips them with scaleX/scaleY so the
          flourish always opens INTO the corner. Stroke uses
          `currentColor` so theme accent + opacity from CSS apply. */}
      <Ornament className="hero-luxury-ornament tl" />
      <Ornament className="hero-luxury-ornament tr" />
      <Ornament className="hero-luxury-ornament bl" />
      <Ornament className="hero-luxury-ornament br" />

      {/* R139 — overall tightened: padding 10/12 → 6/7, inner gaps shrunk.
          The card now reads as a refined miniature save-the-date instead
          of a dominating hero. */}
      <div className="relative z-10 flex flex-col items-center text-center px-5 sm:px-8 py-6 md:py-7">
        {/* Eyebrow — type pill in muted gold. Caps + tracking gives it
            the "engraved metal nameplate" vibe above the names. */}
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-semibold"
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <span aria-hidden>{emoji}</span>
          {typeLabel}
        </span>

        {/* Names — the centerpiece. Frank Ruhl Libre, gradient-gold-shimmer
            for the slow sheen, with a floret ornament between partners
            (or just the single name when it's a solo host event like a
            bar mitzvah). R139 — names font size shrunk in CSS. */}
        <h1 className="hero-luxury-names gradient-gold-shimmer mt-3 mb-1">
          {hasPartner ? (
            <span className="inline-flex items-baseline justify-center flex-wrap">
              <span>{event.hostName}</span>
              <span className="hero-luxury-amp" aria-hidden>
                <AmpFloret />
              </span>
              <span>{event.partnerName}</span>
            </span>
          ) : (
            <span>{event.hostName}</span>
          )}
        </h1>

        {/* Date — engraved style, framed by two hairline rules with a
            diamond floret. Only renders if we have a meaningful date
            string (formatEventDate returns "" for unset dates). */}
        {dateStr && (
          <div className="hero-luxury-rule" aria-label={`תאריך האירוע: ${dateStr}`}>
            <span aria-hidden className="line" />
            <span aria-hidden className="floret" />
            <time className="hero-luxury-date">{dateStr}</time>
            <span aria-hidden className="floret" />
            <span aria-hidden className="line" />
          </div>
        )}

        {/* LivingSpark — wrapped in the halo. R139 — shrunk 220→160 so
            the proportions sit alongside the compacter title instead
            of dominating the card. */}
        <div className="hero-luxury-spark-wrap mt-4">
          <LivingSpark daysUntilEvent={daysLeft} progress={progress} size={160} />
        </div>

        {/* Slim gold rule between spark and countdown — repeats the
            ceremonial "thin line ornament" rhythm without re-using a
            floret (one is plenty for the date). */}
        <div
          aria-hidden
          className="mx-auto mt-3 mb-3 w-14 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
            opacity: 0.7,
          }}
        />

        {past ? (
          <span className="hero-luxury-date text-lg md:text-xl gradient-gold-shimmer" style={{ letterSpacing: "0.05em" }}>
            🎉 חגגתם! תודה שתכננתם איתנו
          </span>
        ) : today ? (
          <span className="text-xl md:text-3xl font-extrabold gradient-gold-shimmer animate-pulse">
            🎉 היום הגדול הגיע!
          </span>
        ) : (
          // R139 — pass size="compact" to shrink the digits ~40% so
          // they don't overpower the new compacter title block above.
          <LiveCountdown targetDate={event.date} size="compact" />
        )}

        {countdownCaption && (
          <div
            className="mt-3 text-[11px] md:text-xs max-w-md leading-relaxed"
            style={{ color: "var(--foreground-muted)", fontStyle: "italic" }}
          >
            {countdownCaption}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Corner filigree SVG. A small flourish that "opens" into the
 * corner of the card. Drawn at 56×56 with stroke=currentColor so
 * the page's accent + the wrapper's opacity control color/contrast.
 *
 * Geometry: a 90° arc, two inward leaf curves, and a centered dot.
 * Reads as a printed-invitation corner ornament without being
 * busy enough to compete with the names.
 */
function Ornament({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Outer 90° arc, hugs the inner-frame radius. */}
      <path d="M 4 28 Q 4 4 28 4" opacity="0.95" />
      {/* Secondary parallel arc — gives a "double rule" engraved feel. */}
      <path d="M 4 36 Q 4 0 40 0" opacity="0.45" strokeWidth="0.75" />
      {/* Inward floret — a small petal pointing toward center. */}
      <path d="M 10 22 Q 16 18 22 22 Q 18 28 22 34 Q 16 30 10 34 Q 14 28 10 22 Z" opacity="0.7" />
      {/* Sharp dot at the very corner — punctuation. */}
      <circle cx="4" cy="4" r="1.6" fill="currentColor" opacity="0.9" stroke="none" />
      {/* Tiny dot at the end of the secondary arc — finish detail. */}
      <circle cx="40" cy="0.5" r="1" fill="currentColor" opacity="0.6" stroke="none" />
    </svg>
  );
}

/**
 * R159 — a tiny four-point gold sparkle. Positioned + twinkled by the
 * `.hero-luxury-spark.sN` CSS classes. Decorative only.
 */
function Spark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
    </svg>
  );
}

/**
 * Ornamental floret rendered between the two partner names —
 * a stylized four-pointed gold star inside a soft halo. Sized via
 * `1em` so it scales naturally with the names' clamp() font size.
 */
function AmpFloret() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="amp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F4DEA9" />
          <stop offset="55%" stopColor="#D4B068" />
          <stop offset="100%" stopColor="#A8884A" />
        </linearGradient>
        <radialGradient id="amp-halo">
          <stop offset="0%" stopColor="rgba(244,222,169,0.55)" />
          <stop offset="60%" stopColor="rgba(212,176,104,0.10)" />
          <stop offset="100%" stopColor="rgba(168,136,74,0)" />
        </radialGradient>
      </defs>
      {/* Soft halo behind the star */}
      <circle cx="16" cy="16" r="14" fill="url(#amp-halo)" />
      {/* Four-pointed sparkle — formed from two intersecting diamonds */}
      <path
        d="M 16 2 L 19 14 L 30 16 L 19 18 L 16 30 L 13 18 L 2 16 L 13 14 Z"
        fill="url(#amp-grad)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="0.4"
      />
      {/* Tiny center dot — keeps the star centered visually */}
      <circle cx="16" cy="16" r="1.4" fill="rgba(255,255,255,0.7)" />
    </svg>
  );
}
