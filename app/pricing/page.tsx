import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { COUPLE_TIERS, type CouplePricingTier } from "@/lib/pricing";
import {
  ArrowLeft,
  Briefcase,
  Check,
  Crown,
  Heart,
  ShieldCheck,
  X,
} from "lucide-react";

export const metadata = {
  title: "מסלולים ותמחור — Momentum",
  description:
    "מסלול חינם לתמיד, פרימיום ₪99 (מחיר השקה) חד-פעמי לאירוע, ומסלולי ספקים נפרדים.",
};

/**
 * R13 — pricing page redesign for a high-end, restrained aesthetic.
 *
 * Three cards, one row. No emojis (they read as casual). No comparison
 * table or FAQ block — the user wanted just the three options, presented
 * cleanly. Icon language is lucide throughout, matching the rest of the
 * app. Generous interior padding (p-9 ≈ 36px), thin gold dividers, and
 * an elevated `recommended` card communicate the hierarchy without
 * needing colored badges or contrasting backgrounds.
 *
 * Every feature listed corresponds to code that actually exists. AI
 * invitations, push notifications, and Excel export remain off the page.
 */
export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pb-24 px-5 relative overflow-hidden">
        {/* Soft glow orbs anchor the gold accent without competing with the cards. */}
        <div
          aria-hidden
          className="glow-orb glow-orb-gold w-[700px] h-[700px] -top-40 left-1/2 -translate-x-1/2 opacity-25"
        />

        <div className="max-w-6xl mx-auto pt-16 relative z-10">
          {/* Hero */}
          <header className="text-center max-w-2xl mx-auto fade-up">
            <span className="eyebrow inline-flex items-center gap-1.5">
              <ShieldCheck size={11} aria-hidden /> ערבות 14 יום · החזר מלא
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              <span className="gradient-gold">מסלולים ותמחור</span>
            </h1>
            <p
              className="mt-6 text-base md:text-lg leading-relaxed"
              style={{ color: "var(--foreground-soft)" }}
            >
              חינם לתמיד או{" "}
              <strong className="text-[--foreground]">תשלום חד-פעמי של ₪99 (מחיר השקה)</strong>{" "}
              לאירוע. ללא מנוי חודשי, ללא הפתעות.
            </p>
          </header>

          {/* Three tracks. items-stretch keeps cards equal-height even though
              the recommended one is scaled +2%. */}
          <section className="mt-16 grid lg:grid-cols-3 gap-5 lg:gap-6 items-stretch">
            <TierCard tier={COUPLE_TIERS[0]} icon={<Heart size={26} aria-hidden />} />
            <TierCard
              tier={COUPLE_TIERS[1]}
              icon={<Crown size={26} aria-hidden />}
              highlighted
            />
            <VendorTrackCard />
          </section>

          {/* Reassurance line below the cards — quiet, single-line, gold dot
              accent. Replaces the longer FAQ section by communicating the
              same point in one breath. */}
          <p
            className="mt-12 text-center text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            שדרוג בכל רגע · ללא חיובים אוטומטיים · החזר מלא תוך 14 ימים
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

// ───────────────────────── Components ─────────────────────────

function TierCard({
  tier,
  icon,
  highlighted,
}: {
  tier: CouplePricingTier;
  icon: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative ${highlighted ? "card-gold" : "card"} p-8 md:p-9 flex flex-col`}
      // 2% scale lift on the recommended tier feels intentional without
      // breaking the row's vertical rhythm. Stretches via items-stretch on
      // the grid, so the height auto-matches.
      style={
        highlighted
          ? {
              transform: "scale(1.02)",
              boxShadow:
                "0 24px 60px -20px rgba(212,176,104,0.35), 0 0 0 1px var(--border-gold) inset",
            }
          : undefined
      }
    >
      {tier.recommended && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold tracking-[0.2em] uppercase whitespace-nowrap"
          style={{
            background: "linear-gradient(135deg, #F4DEA9, #A8884A)",
            color: "#1A1310",
            boxShadow: "0 8px 20px -8px rgba(212,176,104,0.7)",
          }}
        >
          המומלץ
        </div>
      )}

      {/* Icon + label */}
      <div>
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-[--accent]"
          style={{
            background: "rgba(212,176,104,0.10)",
            border: "1px solid var(--border-gold)",
          }}
        >
          {icon}
        </div>
        <h2 className="mt-6 text-xl md:text-[22px] font-bold tracking-tight">
          {tier.label}
        </h2>
        <p
          className="mt-1.5 text-sm leading-relaxed"
          style={{ color: "var(--foreground-soft)" }}
        >
          {tier.tagline}
        </p>
      </div>

      {/* Price */}
      <div className="mt-7">
        <div className="text-5xl md:text-6xl font-extrabold tracking-tight ltr-num gradient-gold leading-none">
          {tier.priceLabel}
        </div>
        {tier.priceSubLabel && (
          <div
            className="mt-2 text-[11px] tracking-wide"
            style={{ color: "var(--foreground-muted)" }}
          >
            {tier.priceSubLabel}
          </div>
        )}
      </div>

      {/* Hairline divider */}
      <div
        className="my-7 h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--border-gold), transparent)",
        }}
        aria-hidden
      />

      {/* Features */}
      <ul className="space-y-3 text-sm flex-1">
        {tier.features.map((f, i) => (
          <li key={i} className="flex items-start gap-3 leading-relaxed">
            <Check
              size={15}
              className="text-[--accent] shrink-0 mt-[3px]"
              aria-hidden
            />
            <span style={{ color: "var(--foreground)" }}>{f}</span>
          </li>
        ))}
      </ul>

      {/* Not-included (free tier only) */}
      {tier.notIncluded && tier.notIncluded.length > 0 && (
        <>
          <div
            className="my-6 h-px w-full opacity-60"
            style={{ background: "var(--border)" }}
            aria-hidden
          />
          <ul className="space-y-2.5 text-sm">
            {tier.notIncluded.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-3 leading-relaxed"
              >
                <X
                  size={15}
                  className="shrink-0 mt-[3px] opacity-40"
                  aria-hidden
                  style={{ color: "var(--foreground-muted)" }}
                />
                <span style={{ color: "var(--foreground-muted)" }}>{f}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* CTA */}
      <Link
        href={tier.ctaHref}
        className={`mt-8 inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] ${
          highlighted ? "btn-gold" : ""
        }`}
        style={
          !highlighted
            ? {
                background: "var(--input-bg)",
                border: "1px solid var(--border-strong)",
                color: "var(--foreground)",
              }
            : undefined
        }
      >
        {tier.ctaLabel}
        <ArrowLeft size={15} aria-hidden />
      </Link>
    </div>
  );
}

function VendorTrackCard() {
  return (
    <div
      className="card p-8 md:p-9 flex flex-col"
      style={{ borderColor: "var(--border-strong)" }}
    >
      <div>
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-[--accent]"
          style={{
            background: "rgba(212,176,104,0.10)",
            border: "1px solid var(--border-gold)",
          }}
        >
          <Briefcase size={26} aria-hidden />
        </div>
        <h2 className="mt-6 text-xl md:text-[22px] font-bold tracking-tight">
          ספקים
        </h2>
        <p
          className="mt-1.5 text-sm leading-relaxed"
          style={{ color: "var(--foreground-soft)" }}
        >
          מסלולים נפרדים לבעלי עסקים שמופיעים בקטלוג
        </p>
      </div>

      {/* Price stack — three monthly tiers shown on one line. The em-dashes
          group price → label without needing extra rows. */}
      <div className="mt-7">
        <div className="text-3xl md:text-4xl font-extrabold tracking-tight ltr-num gradient-gold leading-none">
          ₪0 / ₪199 / ₪499
        </div>
        <div
          className="mt-2 text-[11px] tracking-wide"
          style={{ color: "var(--foreground-muted)" }}
        >
          3 מסלולים חודשיים · אישור ידני
        </div>
      </div>

      <div
        className="my-7 h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--border-gold), transparent)",
        }}
        aria-hidden
      />

      <ul className="space-y-3 text-sm flex-1">
        <li className="flex items-start gap-3 leading-relaxed">
          <Check size={15} className="text-[--accent] shrink-0 mt-[3px]" aria-hidden />
          <span>
            <strong className="font-semibold">חינם</strong> — listing בסיסי, עד 3 תמונות
          </span>
        </li>
        <li className="flex items-start gap-3 leading-relaxed">
          <Check size={15} className="text-[--accent] shrink-0 mt-[3px]" aria-hidden />
          <span>
            <strong className="font-semibold">רגיל ₪199 לחודש</strong> — עדיפות בחיפוש, 15 תמונות, מחירים
          </span>
        </li>
        <li className="flex items-start gap-3 leading-relaxed">
          <Check size={15} className="text-[--accent] shrink-0 mt-[3px]" aria-hidden />
          <span>
            <strong className="font-semibold">פרימיום ₪499 לחודש</strong> — Featured, ללא הגבלה, Analytics
          </span>
        </li>
        <li className="flex items-start gap-3 leading-relaxed">
          <Check size={15} className="text-[--accent] shrink-0 mt-[3px]" aria-hidden />
          <span>אישור ידני שלנו — איכות מובטחת</span>
        </li>
      </ul>

      {/* R19 P1#2: `/vendors/welcome` doesn't exist — points to the live
          /vendors/join route (vendor onboarding form). */}
      <Link
        href="/vendors/join"
        className="mt-8 inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--border-strong)",
          color: "var(--foreground)",
        }}
      >
        לפרטים מלאים
        <ArrowLeft size={15} aria-hidden />
      </Link>
    </div>
  );
}
