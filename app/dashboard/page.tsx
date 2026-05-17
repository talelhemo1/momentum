"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { DashboardSkeleton } from "@/components/skeletons/PageSkeletons";
import { useAppState } from "@/lib/store";
import { useUser } from "@/lib/user";
import { getJourneyForState, getProgress } from "@/lib/journey";
import { type AppState } from "@/lib/types";
import { useNow, daysUntil } from "@/lib/useNow";
import { LiveModeCTA } from "@/components/LiveModeCTA";
import { InvitationActivityCard } from "@/components/dashboard/InvitationActivityCard";
import { IntimateHero } from "@/components/dashboard/IntimateHero";
import { JourneyPath } from "@/components/dashboard/JourneyPath";
import {
  ArrowLeft,
  Users,
  Wallet,
  Sparkles,
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

  // R41 — the big animated stat cards were replaced by the slim
  // StatsStrip (plain numbers), so the per-stat useCountUp hooks are
  // gone. No hook-order concern remains (just fewer hooks).
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
        {/* R41 — a single calm gold orb. The old big orb + event-type
            tinted second orb were trimmed to reduce visual overload. */}
        <div
          aria-hidden
          className="glow-orb glow-orb-gold w-[640px] h-[640px] -top-48 left-1/2 -translate-x-1/2 opacity-25"
        />

        <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-4 relative z-10">
          {showWelcome && (
            <WelcomeBanner onDismiss={() => setWelcomeDismissed(true)} />
          )}

          <IntimateHero event={event} daysLeft={daysLeft} />

          <TodayCard state={state} daysLeft={daysLeft} />

          <JourneyPath
            steps={getJourneyForState(state)}
            progress={progress}
          />

          <LiveModeCTA daysLeft={daysLeft} />

          {/* R32 — live "who opened the invitation" feed. */}
          {state.guests.length > 0 && (
            <InvitationActivityCard eventId={event.id} />
          )}

          <StatsStrip state={state} event={event} progress={progress} />

          {/* R41 — tools demoted to a quiet section at the bottom (no
              /menu route exists; removing tool access would be a
              regression, so they stay — just de-emphasized). */}
          <section className="mt-12">
            <h2
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--foreground-muted)" }}
            >
              כל הכלים
            </h2>
            <ToolsSection />
          </section>
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

// ─── R41: "מה היום?" card + slim Stats Strip ─────────────────────────────

function TodayCard({
  state,
  daysLeft,
}: {
  state: AppState;
  daysLeft: number | null;
}) {
  const { title, sub, href } = useMemo(() => {
    const pending = state.guests.filter(
      (g) => g.status === "pending",
    ).length;
    // <14 days out with guests still un-invited → that's the priority.
    if (
      daysLeft != null &&
      daysLeft >= 0 &&
      daysLeft <= 14 &&
      pending > 0
    ) {
      return {
        title: `שלחו הזמנה ל-${pending} מוזמנים שעוד מחכים`,
        sub: `נשארו ${daysLeft} ימים — אל תשאירו אישורים פתוחים`,
        href: "/guests",
      };
    }
    const next = getJourneyForState(state).find(
      (s) => s.unlocked && !s.complete,
    );
    if (next) {
      return {
        title: next.def.title,
        sub: next.def.description,
        href: next.def.href,
      };
    }
    return {
      title: "הכל מוכן ליום הגדול 🎉",
      sub: "סיימתם את כל שלבי התכנון — תיהנו!",
      href: "/event-day",
    };
  }, [state, daysLeft]);

  return (
    <Link
      href={href}
      className="card-gold p-6 mt-6 block transition group hover:translate-y-[-2px]"
      aria-label={`מה היום: ${title}`}
    >
      <div
        className="text-[11px] uppercase tracking-[0.2em] inline-flex items-center gap-2"
        style={{ color: "var(--foreground-muted)" }}
      >
        <Sparkles size={13} className="text-[--accent]" /> מה היום?
      </div>
      <div className="mt-2 text-xl md:text-2xl font-bold">{title}</div>
      {sub && (
        <div
          className="mt-1 text-sm leading-relaxed"
          style={{ color: "var(--foreground-soft)" }}
        >
          {sub}
        </div>
      )}
      <div
        className="mt-4 inline-flex items-center gap-2 font-semibold"
        style={{ color: "var(--accent)" }}
      >
        בצע עכשיו ←
      </div>
    </Link>
  );
}

function StatsStrip({
  state,
  event,
  progress,
}: {
  state: AppState;
  event: NonNullable<AppState["event"]>;
  progress: { done: number; total: number; percent: number };
}) {
  const confirmedHeads = state.guests
    .filter((g) => g.status === "confirmed")
    .reduce((s, g) => s + (g.attendingCount ?? 1), 0);
  const totalGuests = state.guests.length;
  const spent = state.budget.reduce(
    (s, b) => s + (b.actual ?? b.estimated ?? 0),
    0,
  );
  const pct =
    event.budgetTotal > 0
      ? Math.round((spent / event.budgetTotal) * 100)
      : 0;
  const vendors = state.selectedVendors.length;
  const openSteps = Math.max(0, progress.total - progress.done);

  const parts = [
    `👥 ${confirmedHeads}/${totalGuests} אישרו`,
    `💰 ₪${spent.toLocaleString("he-IL")} (${pct}%)`,
    `🤝 ${vendors} ספקים`,
    `⚡ ${openSteps} שלבים פתוחים`,
  ];

  return (
    <div
      className="mt-8 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm ltr-num"
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
        color: "var(--foreground-soft)",
      }}
    >
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-3">
          {i > 0 && <span style={{ color: "var(--border-gold)" }}>·</span>}
          {p}
        </span>
      ))}
    </div>
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

// R41 — StatCard / JourneyCard / Hero removed (replaced by StatsStrip /
// JourneyPath / IntimateHero).
