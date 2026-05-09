"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { DashboardSkeleton } from "@/components/skeletons/PageSkeletons";
import { useCountUp } from "@/lib/useCountUp";
import { useAppState } from "@/lib/store";
import { useUser } from "@/lib/user";
import { eventSlots } from "@/lib/eventSlots";
import { getJourneyForState, getProgress } from "@/lib/journey";
import { EVENT_TYPE_LABELS, REGION_LABELS } from "@/lib/types";
import { useNow, daysUntil } from "@/lib/useNow";
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
  Pencil,
  BookOpen,
  Trophy,
  GitBranch,
  Armchair,
  PartyPopper,
  Scale,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const now = useNow();

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    if (hydrated && !state.event) router.replace("/onboarding");
  }, [userHydrated, user, hydrated, state.event, router]);

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
          <Hero event={event} daysLeft={daysLeft} progress={progress} />

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

          <section className="mt-12">
            <div className="flex items-center gap-2 mb-4">
              <span className="eyebrow">כלים מתקדמים</span>
            </div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-5 stagger">
              <ToolLink href="/timeline" icon={<GitBranch size={18} />} label="ציר זמן" sub="כל המשימות בקו אחד" />
              <ToolLink href="/compare" icon={<Trophy size={18} />} label="השוואת ספקים" sub={`${state.compareVendors.length} בהשוואה`} />
              <ToolLink href="/seating" icon={<Armchair size={18} />} label="סידורי הושבה" sub={`${state.tables.length} שולחנות`} />
              <ToolLink href="/event-day" icon={<PartyPopper size={18} />} label="יום האירוע" sub="ציר זמן חי" />
              <ToolLink href="/balance" icon={<Scale size={18} />} label="מאזן" sub="רווח / הפסד" />
            </div>
          </section>

          <section className="mt-16">
            <div className="flex items-end justify-between mb-7 gap-4 flex-wrap">
              <div>
                <span className="eyebrow">המסע</span>
                <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight gradient-text">
                  המסע שלך
                </h2>
                <p className="mt-2 text-white/55">חמישה שלבים מהתכנון ועד היום הגדול.</p>
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
        </div>
      </main>
    </>
  );
}

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
  const dateFmt = new Date(event.date).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const eventLabel = EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_TYPE_LABELS];
  const regionLabel = REGION_LABELS[event.region as keyof typeof REGION_LABELS];
  const subjects = event.partnerName ? `${event.hostName} & ${event.partnerName}` : event.hostName;

  return (
    <section className="card-gold p-7 md:p-10 relative overflow-hidden fade-up">
      <div aria-hidden className="absolute -top-20 -end-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.18),transparent_70%)] blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <span className="pill pill-gold">
            <Sparkles size={11} /> {eventLabel}
          </span>
          <div className="flex items-center gap-2">
            <RestartButton />
            <Link
              href="/onboarding?edit=1"
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 transition"
            >
              <Pencil size={12} /> ערוך
            </Link>
          </div>
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
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9] transition-[width] duration-1000"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RestartButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    eventSlots.deleteActive();
    setOpen(false);
    router.push("/onboarding");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-red-300 border border-white/10 hover:border-red-400/40 rounded-full px-3 py-1.5 transition"
        title="התחל אירוע חדש מאפס"
      >
        <RefreshCw size={12} /> התחל מחדש
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card glass-strong p-7 w-full max-w-md scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-red-300 mb-4" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
              <AlertCircle size={22} />
            </div>
            <h3 className="text-xl font-bold">להתחיל מחדש?</h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
              הפעולה תמחק את האירוע הנוכחי, כולל המוזמנים, התקציב, סידורי ההושבה והצ׳קליסט. <strong>לא ניתן לשחזר אחרי הפעולה.</strong>
              <br />
              <br />
              אם אתה רוצה לשמור את האירוע הזה ופשוט להוסיף עוד אחד — לחץ על שם האירוע בכותרת, ובחר &quot;אירוע חדש&quot;.
            </p>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary">ביטול</button>
              <button onClick={onConfirm} className="rounded-full px-5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition">
                כן, מחק והתחל
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ToolLink({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link href={href} className="card card-hover p-4 flex flex-col gap-2 group">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-[--accent] group-hover:bg-[var(--secondary-button-bg-hover)] transition" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        {icon}
      </div>
      <div>
        <div className="font-bold text-sm">{label}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>{sub}</div>
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
  return (
    <Link
      href={href}
      className={`card card-hover p-6 block ${highlight ? "ring-gold" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-white/55 text-sm">{label}</div>
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
      <div className="text-xs text-white/45 mt-1.5">{sub}</div>
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
