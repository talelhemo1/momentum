"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { DashboardSkeleton } from "@/components/skeletons/PageSkeletons";
import { useCountUp } from "@/lib/useCountUp";
import { useAppState } from "@/lib/store";
import { useUser } from "@/lib/user";
import { getJourneyForState, getProgress } from "@/lib/journey";
import { formatEventDate } from "@/lib/format";
import { EVENT_TYPE_LABELS, REGION_LABELS, type AppState } from "@/lib/types";
import { useNow, daysUntil } from "@/lib/useNow";
import { LiveModeCTA } from "@/components/LiveModeCTA";
import { buildNavigationLinks } from "@/lib/navigationLinks";
import {
  CheckCircle2,
  Lock,
  ArrowLeft,
  Users,
  Wallet,
  Building2,
  CalendarDays,
  Sparkles,
  MapPin,
  Navigation,
  Pencil,
  BookOpen,
  Armchair,
  PartyPopper,
  Scale,
  Wine,
  ListChecks,
  ClipboardList,
  PieChart,
  Clock,
  Briefcase,
  X,
} from "lucide-react";

/**
 * R14 — dashboard restructure.
 *
 * Goal: a new user must understand the next action within 30 seconds.
 * Order top-to-bottom:
 *   1. Optional welcome banner (?welcome=1, post-onboarding)
 *   2. Hero (event identity + countdown + progress)
 *   3. NextActionCard (the single most actionable next step)
 *   4. StatCards (guests / budget / vendors)
 *   5. Journey (full 7 stages, expanded)
 *   6. Tools — all 11 helpers, always visible (R15 reverted phase filtering)
 *
 * RestartButton was moved to /settings under a danger zone.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const now = useNow();

  // ?welcome=1 means we just came from onboarding finish. We read it once,
  // commit it to local state, then strip the query param so a refresh never
  // re-fires the banner. The user can also dismiss with the X button.
  const initialWelcome = searchParams.get("welcome") === "1";
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcome = initialWelcome && !welcomeDismissed;

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    if (hydrated && !state.event) router.replace("/onboarding");
  }, [userHydrated, user, hydrated, state.event, router]);

  // R17 P1#1: scrub `?welcome=1` from the URL as soon as we've captured it
  // into local state. The banner stays mounted for the lifetime of this
  // session (until X or navigation), but a hard refresh won't bring it back.
  useEffect(() => {
    if (!initialWelcome) return;
    const t = setTimeout(() => {
      router.replace("/dashboard", { scroll: false });
    }, 100);
    return () => clearTimeout(t);
  }, [initialWelcome, router]);

  // Hooks must run unconditionally — keep all useCountUp calls BEFORE the
  // skeleton early-return. We read the stat sources defensively (default 0
  // when state.event is missing) so the hooks always get a real number.
  const confirmedGuests = state.guests
    .filter((g) => g.status === "confirmed")
    .reduce((sum, g) => sum + g.attendingCount, 0);
  const budgetSpent = state.budget.reduce(
    (s, b) => s + (b.actual ?? b.estimated),
    0,
  );
  const animConfirmed = useCountUp(confirmedGuests);
  const animBudget = useCountUp(budgetSpent);
  const animVendors = useCountUp(state.selectedVendors.length);

  if (!hydrated || !state.event) {
    return (
      <>
        <Header />
        <DashboardSkeleton />
      </>
    );
  }

  const event = state.event;
  const progress = getProgress(state);
  // `daysLeft` is null until the client mounts (avoids hydration mismatch from
  // calling Date.now() during render). The Hero handles the null case.
  const daysLeft = daysUntil(event.date, now);

  return (
    <>
      <Header />
      <main className="flex-1 pb-28 relative">
        {/* Glow accent tinted by event type. Pure additive radial — does NOT
            alter design tokens; we just layer a second hued orb on top of
            the gold one. Falls back to gold-only for "other" / unknown. */}
        <div aria-hidden className="glow-orb glow-orb-gold w-[800px] h-[800px] -top-60 left-1/2 -translate-x-1/2 opacity-40" />
        {(() => {
          const tints: Partial<Record<typeof event.type, { color: string; offset: string }>> = {
            wedding:        { color: "rgba(248, 180, 217, 0.30)", offset: "20%" }, // rose
            engagement:     { color: "rgba(248, 180, 217, 0.30)", offset: "20%" },
            "bar-mitzvah":  { color: "rgba(166, 227, 244, 0.28)", offset: "80%" }, // cool blue
            "bat-mitzvah":  { color: "rgba(166, 227, 244, 0.28)", offset: "80%" },
            brit:           { color: "rgba(167, 243, 208, 0.30)", offset: "50%" }, // mint
            corporate:      { color: "rgba(244, 222, 169, 0.40)", offset: "50%" }, // champagne
          };
          const t = tints[event.type];
          if (!t) return null;
          return (
            <div
              aria-hidden
              className="pointer-events-none absolute -top-40 w-[500px] h-[500px] rounded-full opacity-90"
              style={{
                left: t.offset,
                background: `radial-gradient(circle, ${t.color} 0%, transparent 70%)`,
                filter: "blur(60px)",
              }}
            />
          );
        })()}

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          {showWelcome && <WelcomeBanner onDismiss={() => setWelcomeDismissed(true)} />}

          <Hero event={event} daysLeft={daysLeft} progress={progress} />

          <NextActionCard state={state} />

          <div className="mt-8 grid gap-4 md:grid-cols-3 stagger">
            <StatCard
              icon={<Users size={20} />}
              label="אישרו הגעה"
              value={`${animConfirmed}`}
              sub={`מתוך ${state.guests.length} מוזמנים`}
              href="/guests"
            />
            <StatCard
              icon={<Wallet size={20} />}
              label="תקציב נוכחי"
              value={`₪${animBudget.toLocaleString("he-IL")}`}
              sub={`מתוך ₪${event.budgetTotal.toLocaleString("he-IL")}`}
              href="/budget"
              highlight
            />
            <StatCard
              icon={<Building2 size={20} />}
              label="ספקים שמורים"
              value={`${animVendors}`}
              sub="מתוך הספקים באזור"
              href="/vendors"
            />
          </div>

          {/* Journey — moved up: it's the spine of the experience.
              Tools are now under it, filtered by phase. */}
          <section className="mt-16">
            <div className="flex items-end justify-between mb-7 gap-4 flex-wrap">
              <div>
                <span className="eyebrow">המסע</span>
                <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight gradient-text">
                  המסע שלך
                </h2>
                <p className="mt-2 text-white/55">שלבים מהתכנון ועד היום הגדול.</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/45 mb-1">התקדמות</div>
                <div className="text-3xl md:text-4xl font-extrabold gradient-gold ltr-num">
                  {progress.percent}%
                </div>
              </div>
            </div>

            <div className="relative">
              {/* Connecting line */}
              <div className="absolute top-0 bottom-0 right-6 w-px bg-gradient-to-b from-[var(--border-gold)] via-white/10 to-transparent" />

              <div className="space-y-4 stagger">
                {getJourneyForState(state).map((step) => (
                  <JourneyCard
                    key={step.def.id}
                    n={step.order}
                    title={step.def.title}
                    desc={step.def.description}
                    href={step.def.href}
                    locked={!step.unlocked}
                    complete={step.complete}
                  />
                ))}
              </div>
            </div>
          </section>

          <LiveModeCTA daysLeft={daysLeft} />

          <ToolsSection />
        </div>
      </main>
    </>
  );
}

// ─── Welcome banner (post-onboarding) ────────────────────────────────────

function WelcomeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    // R19 P2#5: this is a transient notice, not a section heading. Using
    // role="status" + aria-live so screen readers announce it without
    // breaking the page's heading outline (the Hero's <h1> comes next).
    <div
      role="status"
      aria-live="polite"
      className="card-gold p-6 mb-6 text-center fade-up relative"
    >
      {/* R19 P2#6: 44×44 minimum touch target (WCAG 2.5.5). The icon stays
          small but the hit area is comfortably large for thumbs. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגור את הודעת הברוכים-הבאים"
        className="absolute top-2 start-2 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
        style={{ color: "var(--foreground-muted)" }}
      >
        <X size={18} aria-hidden />
      </button>
      <div
        className="inline-flex w-12 h-12 rounded-full items-center justify-center text-[--accent]"
        style={{ background: "rgba(212,176,104,0.18)", border: "1px solid var(--border-gold)" }}
      >
        <PartyPopper size={22} aria-hidden />
      </div>
      {/* R19 P2#5: was <h2> — promoting a transient banner to h2 broke the
          page's outline (h2 appeared before the Hero's h1). Styled the same
          via classes; semantics now match its temporary nature. */}
      <p className="mt-3 text-xl md:text-2xl font-bold gradient-gold">
        יצירת האירוע הצליחה!
      </p>
      <p
        className="mt-2 text-sm leading-relaxed max-w-md mx-auto"
        style={{ color: "var(--foreground-soft)" }}
      >
        עכשיו הצעד החשוב הראשון: הוסף את 5 המוזמנים הראשונים שלך
      </p>
      <Link
        href="/guests"
        className="btn-gold mt-5 inline-flex items-center gap-2"
      >
        בוא נוסיף אורחים
        <ArrowLeft size={14} aria-hidden />
      </Link>
    </div>
  );
}

// ─── Next action card (the 30-second clue) ───────────────────────────────

function NextActionCard({ state }: { state: AppState }) {
  // First step that's both unlocked (visible) and not yet complete. If
  // everything is done we render nothing — the journey card itself will say
  // "ready for the day".
  const next = useMemo(() => {
    const journey = getJourneyForState(state);
    return journey.find((step) => step.unlocked && !step.complete);
  }, [state]);

  if (!next) return null;

  return (
    <Link
      href={next.def.href}
      aria-label={`הצעד הבא: ${next.def.title}`}
      className="card-gold p-6 mt-8 block transition group hover:translate-y-[-2px]"
    >
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-[--accent]"
          style={{ background: "rgba(212,176,104,0.15)", border: "1px solid var(--border-gold)" }}
        >
          <Sparkles size={26} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "var(--foreground-muted)" }}
          >
            הצעד הבא שלך
          </div>
          <div className="mt-1 text-lg md:text-xl font-bold truncate">
            {next.def.title}
          </div>
          {next.def.description && (
            <div
              className="mt-1 text-sm leading-relaxed line-clamp-2"
              style={{ color: "var(--foreground-soft)" }}
            >
              {next.def.description}
            </div>
          )}
        </div>
        <ArrowLeft
          size={20}
          className="text-[--accent] opacity-60 group-hover:opacity-100 shrink-0"
          aria-hidden
        />
      </div>
    </Link>
  );
}

// ─── Tools section ───────────────────────────────────────────────────────
// R15: phase-based filtering removed. All 11 tools are now visible on every
// dashboard render — the previous filter hid /balance pre-event, /event-day
// before D-1, etc., which caused users to think the app was missing features.
// Returning to the "show everything" model.

interface DashboardTool {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function ToolsSection() {
  const tools: DashboardTool[] = [
    { href: "/checklist", label: "צ'קליסט", icon: <ListChecks size={20} /> },
    { href: "/guests", label: "אורחים", icon: <Users size={20} /> },
    { href: "/seating", label: "סידור הושבה", icon: <Armchair size={20} /> },
    { href: "/vendors", label: "ספקים", icon: <Briefcase size={20} /> },
    { href: "/vendors/my", label: "הספקים שלי", icon: <ClipboardList size={20} /> },
    { href: "/budget", label: "תקציב", icon: <Wallet size={20} /> },
    { href: "/balance", label: "מאזן", icon: <PieChart size={20} /> },
    { href: "/timeline", label: "ציר זמן", icon: <Clock size={20} /> },
    { href: "/compare", label: "השוואת ספקים", icon: <Scale size={20} /> },
    { href: "/alcohol", label: "מחשבון אלכוהול", icon: <Wine size={20} /> },
    { href: "/event-day", label: "מצב יום האירוע", icon: <Sparkles size={20} /> },
  ];

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <span className="eyebrow">כלי עזר</span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 stagger">
        {tools.map((t) => (
          <ToolLink key={t.href} {...t} />
        ))}
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Hero({
  event,
  daysLeft,
  progress,
}: {
  event: { type: string; hostName: string; partnerName?: string; synagogue?: string; date: string; region: string; city?: string };
  /** `null` until the client mounts — `useNow` returns null on the first render to avoid SSR/CSR drift. */
  daysLeft: number | null;
  progress: { done: number; total: number; percent: number };
}) {
  // R18 §N — shared helper instead of an ad-hoc option object.
  const dateFmt = formatEventDate(event.date, "long");
  const eventLabel = EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_TYPE_LABELS];
  const regionLabel = REGION_LABELS[event.region as keyof typeof REGION_LABELS];
  const subjects = event.partnerName ? `${event.hostName} & ${event.partnerName}` : event.hostName;
  // R31 — quick navigation. Prefer the most specific address parts the
  // host gave (synagogue/city); region alone is too coarse for Waze.
  const navLinks = buildNavigationLinks(
    [event.synagogue, event.city].filter(Boolean).join(" · "),
  );

  // Bar fills 0 → progress.percent on mount. We start the rendered width at 0
  // and flip to the real percent in an effect so the CSS transition animates;
  // setting the real percent in render would freeze with no animation.
  const [renderedPercent, setRenderedPercent] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderedPercent(progress.percent);
  }, [progress.percent]);

  return (
    <section className="card-gold p-7 md:p-10 relative overflow-hidden fade-up">
      <div aria-hidden className="absolute -top-20 -end-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.18),transparent_70%)] blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <span className="pill pill-gold">
            <Sparkles size={11} /> {eventLabel}
          </span>
          {/* RestartButton was moved to /settings (danger zone) in R14 — the
              dashboard hero now only carries the safe "edit event" affordance. */}
          <Link
            href="/onboarding?edit=1"
            className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 transition"
          >
            <Pencil size={12} /> ערוך
          </Link>
        </div>

        <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
          <span className="gradient-text">{subjects}</span>
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-white/60 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={15} className="text-[--accent]" /> {dateFmt}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} className="text-[--accent]" />
            {regionLabel}{event.city ? `, ${event.city}` : ""}
          </span>
          {event.synagogue && (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen size={15} className="text-[--accent]" />
              {event.synagogue}
            </span>
          )}
          {navLinks && (
            <a
              href={navLinks.waze}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[--accent] hover:text-white transition"
            >
              <Navigation size={14} />
              פתח ב-Waze
            </a>
          )}
        </div>

        <div className="mt-9 grid sm:grid-cols-[auto_1fr] gap-8 items-end">
          <div>
            <div className="text-xs text-white/55 uppercase tracking-wider">ימים לאירוע</div>
            <div
              className="text-7xl md:text-8xl font-extrabold tracking-tight gradient-gold ltr-num leading-none mt-2"
              suppressHydrationWarning
            >
              {daysLeft ?? "—"}
            </div>
          </div>
          <div className="pb-3">
            <div className="flex justify-between text-xs text-white/55 mb-2">
              <span><span className="ltr-num">{progress.done}</span> מתוך <span className="ltr-num">{progress.total}</span> שלבים</span>
              <span className="ltr-num">{progress.percent}%</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--input-bg)" }}
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`התקדמות במסע ${progress.percent}%`}
            >
              <div
                className="h-full bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9]"
                style={{
                  width: `${renderedPercent}%`,
                  transition: "width 1500ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolLink({
  href,
  icon,
  label,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  /** R15: `sub` made optional. The new tool list shows label-only cards. */
  sub?: string;
}) {
  return (
    <Link href={href} className="card card-hover p-4 flex flex-col gap-2 group">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-[--accent] group-hover:bg-[var(--secondary-button-bg-hover)] transition" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        {icon}
      </div>
      <div>
        <div className="font-bold text-sm">{label}</div>
        {sub && (
          <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>
            {sub}
          </div>
        )}
      </div>
    </Link>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  href,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
  highlight?: boolean;
}) {
  // Pulse the card whenever the displayed value increases — useful signal
  // when a guest just confirmed, the counter ticked up, the budget grew, etc.
  // Compare the rendered string so a "₪1,200" → "₪1,300" change still fires.
  const prevRef = useRef(value);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (prevRef.current === value) return;
    prevRef.current = value;
    setPulseKey((k) => k + 1);
  }, [value]);

  return (
    <Link
      href={href}
      key={pulseKey ? `pulse-${pulseKey}` : "stat"}
      className={`card card-hover p-6 block ${highlight ? "ring-gold" : ""} ${pulseKey ? "stat-pulse" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>{label}</div>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
          highlight
            ? "bg-gradient-to-br from-[#F4DEA9]/20 to-[#A8884A]/10 border border-[var(--border-gold)] text-[--accent]"
            : "bg-white/[0.05] border border-white/[0.08] text-[--accent]"
        }`}>
          {icon}
        </div>
      </div>
      <div className={`mt-4 text-3xl font-bold ltr-num ${highlight ? "gradient-gold" : ""}`}>
        {value}
      </div>
      <div className="text-xs mt-1.5" style={{ color: "var(--foreground-muted)" }}>{sub}</div>
    </Link>
  );
}

function JourneyCard({
  n,
  title,
  desc,
  href,
  locked,
  complete,
}: {
  n: number;
  title: string;
  desc: string;
  href: string;
  locked: boolean;
  complete: boolean;
}) {
  const Wrap: React.ElementType = locked ? "div" : Link;
  const props = locked ? {} : { href };
  return (
    <Wrap
      {...props}
      className={`card relative p-5 md:p-6 flex items-center gap-5 ${
        locked ? "opacity-50 cursor-not-allowed" : "card-hover"
      } ${complete ? "border-[var(--border-gold)]" : ""}`}
    >
      <div
        className={`relative w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 z-10 ${
          complete
            ? "bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black shadow-[0_8px_24px_-8px_rgba(212,176,104,0.6)]"
            : locked
              ? "bg-white/[0.04] text-white/30 border border-white/[0.08]"
              : "bg-white/[0.08] text-white border border-white/15"
        }`}
      >
        {complete ? <CheckCircle2 size={22} /> : locked ? <Lock size={18} /> : n}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg md:text-xl font-semibold">{title}</h3>
          {complete && <span className="pill pill-gold">הושלם</span>}
          {locked && <span className="pill pill-muted">נעול</span>}
        </div>
        <p className="text-sm text-white/55 mt-1">{desc}</p>
      </div>
      {!locked && <ArrowLeft size={18} className="text-white/35 shrink-0" />}
    </Wrap>
  );
}
