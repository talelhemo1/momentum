"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { actions, useAppState } from "@/lib/store";
import { useUser } from "@/lib/user";
import { fireConfettiOnce } from "@/lib/confetti";
import { generateSigningKey } from "@/lib/crypto";
import { useNow, daysUntil } from "@/lib/useNow";
import {
  EVENT_TYPE_LABELS,
  MINOR_EVENT_TYPES,
  REGION_LABELS,
  type EventType,
  type Region,
} from "@/lib/types";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import {
  Heart,
  Cake,
  Star,
  Briefcase,
  Baby,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  MapPin,
  Wallet,
  CheckCircle2,
  BookOpen,
  HandHeart,
  Crown,
} from "lucide-react";

const EVENT_OPTIONS: { value: EventType; icon: React.ReactNode }[] = [
  { value: "wedding", icon: <Heart size={22} /> },
  { value: "bar-mitzvah", icon: <Star size={22} /> },
  { value: "bat-mitzvah", icon: <Crown size={22} /> },
  { value: "shabbat-chatan", icon: <BookOpen size={22} /> },
  { value: "engagement", icon: <HandHeart size={22} /> },
  { value: "brit", icon: <Baby size={22} /> },
  { value: "birthday", icon: <Cake size={22} /> },
  { value: "corporate", icon: <Briefcase size={22} /> },
  { value: "other", icon: <Sparkles size={22} /> },
];

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const search = useSearchParams();
  const isEdit = search.get("edit") === "1";
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();

  // Gate: redirect to signup if no account yet. New users go through /start
  // first (the pricing gate); we redirect there too if they hit /onboarding
  // directly before passing the gate.
  //
  // R6 fix: returning users (anyone with an existing event) bypass the gate
  // entirely — `state.event` proves they've completed onboarding before. The
  // earlier check only looked at the `?gate=ok` query param, so any "ערוך
  // אירוע"/"חזור" link from /dashboard, /guests, /alcohol, /budget, etc.
  // bounced the user to /start, /start re-routed back, /onboarding re-routed
  // to /start ... infinite loop.
  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    if (!userHydrated || !user) return;
    // Returning user with an event — skip the pricing gate.
    if (state.event) return;
    // First-time onboarding requires explicit consent that pricing was seen
    // (`?gate=ok`) OR an explicit edit intent (`?edit=1`).
    if (!isEdit && search.get("gate") !== "ok") {
      router.replace("/start");
    }
  }, [userHydrated, user, router, isEdit, search, state.event]);

  const [step, setStep] = useState(0);

  const [type, setType] = useState<EventType | null>(null);
  const [hostName, setHostName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [synagogue, setSynagogue] = useState("");
  const [hostPhone, setHostPhone] = useState("");
  const [date, setDate] = useState("");
  const [region, setRegion] = useState<Region | null>(null);
  const [city, setCity] = useState("");
  const [budgetTotal, setBudgetTotal] = useState<string>("");
  const [guestEstimate, setGuestEstimate] = useState<string>("");
  const [prefilled, setPrefilled] = useState(false);
  // Required for events celebrating a minor (brit, bar/bat mitzvah). The
  // checkbox below the names confirms the host is the legal guardian and is
  // acting on the minor's behalf. Persisted into the EventInfo on finish.
  const [guardianConsent, setGuardianConsent] = useState(false);
  const isMinorEvent = type ? MINOR_EVENT_TYPES.includes(type) : false;

  // One-time seed of form fields from external state (the existing event in
  // edit mode, or the user's phone if signed up via OTP). The
  // `set-state-in-effect` lint warnings are suppressed for the whole block:
  // the only alternatives are accessing refs during render (also banned in
  // React 19) or skipping SSR for the whole page. This effect runs exactly
  // once via the `prefilled` guard.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || prefilled) return;
    if (isEdit && state.event) {
      setType(state.event.type);
      setHostName(state.event.hostName);
      setPartnerName(state.event.partnerName ?? "");
      setSynagogue(state.event.synagogue ?? "");
      setHostPhone(state.event.hostPhone ?? "");
      setDate(state.event.date);
      setRegion(state.event.region);
      setCity(state.event.city ?? "");
      setBudgetTotal(String(state.event.budgetTotal));
      setGuestEstimate(String(state.event.guestEstimate));
      // Pre-mark guardian consent only if it was already on file — older events
      // created before this requirement won't have it and will need re-affirmation.
      if (state.event.guardianConsent) setGuardianConsent(true);
    } else if (user?.method === "phone" && user.identifier) {
      setHostPhone(user.identifier);
    } else if (user && (user.method === "google" || user.method === "email")) {
      // R18 §1C — Google/email signups don't carry a phone in the local
      // profile. Try the Supabase auth user (some providers expose a
      // verified phone). Fire-and-forget; if it returns nothing the
      // field stays empty and is flagged required in the UI below.
      void (async () => {
        try {
          const { getSupabase } = await import("@/lib/supabase");
          const supabase = getSupabase();
          if (!supabase) return;
          const { data } = await supabase.auth.getUser();
          const ph = data.user?.phone;
          if (ph) setHostPhone((cur) => cur || ph);
        } catch {
          // Soft failure — the field just stays empty + required.
        }
      })();
    }
    setPrefilled(true);
    // R12 §3O — depend on event.id only. The prefill is a one-shot
    // snapshot guarded by `prefilled`; further mutations shouldn't
    // re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isEdit, state.event?.id, user, prefilled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalSteps = 4;
  const progress = ((step + 1) / totalSteps) * 100;
  // R15 §1C — defensive lookup behind the null-guard.
  const config = type ? (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding) : null;

  const canNext = (() => {
    if (!type) return false;
    const subject = config!.subject;
    switch (step) {
      case 0:
        if (!hostName.trim()) return false;
        if (subject.hasPartner && !partnerName.trim()) return false;
        // Block forward navigation on minor events without guardian consent.
        if (isMinorEvent && !guardianConsent) return false;
        return true;
      case 1:
        return !!date;
      case 2:
        return !!region;
      case 3:
        return !!budgetTotal && !!guestEstimate;
      default:
        return false;
    }
  })();

  const handleFinish = () => {
    if (!type || !region) return;
    // Defense in depth: canNext should already block this, but never persist
    // a minor event without guardian consent.
    if (MINOR_EVENT_TYPES.includes(type) && !guardianConsent) return;
    const existing = state.event;
    // Preserve a prior consent timestamp on edit; otherwise stamp now.
    const consentRecord = MINOR_EVENT_TYPES.includes(type)
      ? (existing?.guardianConsent ?? { acceptedAt: new Date().toISOString() })
      : undefined;
    actions.setEvent({
      id: existing?.id ?? crypto.randomUUID(),
      type,
      // Generate a per-event HMAC signing key on first creation. Reused on edit
      // so existing invitation URLs in the wild remain valid.
      signingKey: existing?.signingKey ?? generateSigningKey(),
      hostName: hostName.trim(),
      partnerName: partnerName.trim() || undefined,
      synagogue: synagogue.trim() || undefined,
      hostPhone: hostPhone.trim() || undefined,
      date,
      region,
      city: city.trim() || undefined,
      budgetTotal: Number(budgetTotal),
      guestEstimate: Number(guestEstimate),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      guardianConsent: consentRecord,
    });
    // First-event-created milestone: confetti once per session — `existing`
    // was just narrowed to null by the `!existing` guard, so we use a fixed
    // key. Subsequent visits won't re-fire (localStorage gate).
    if (!existing) {
      fireConfettiOnce("event-created-first", 1500);
    }
    // R14: ?welcome=1 triggers the celebratory banner + "add 5 guests" CTA
    // on the dashboard. The banner only appears on this exact load — once
    // the user navigates anywhere else the param is dropped and won't reappear.
    router.push(existing ? "/dashboard" : "/dashboard?welcome=1");
  };

  return (
    <>
      <Header />
      <main className="flex-1 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[700px] h-[700px] -top-40 left-1/2 -translate-x-1/2 opacity-30" />

        <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-10 pb-24 relative z-10">
          <Link href={isEdit ? "/dashboard" : "/"} className="text-sm text-white/50 hover:text-white inline-flex items-center gap-1.5">
            <ArrowRight size={14} /> {isEdit ? "חזרה למסע" : "חזרה לדף הבית"}
          </Link>

          {isEdit && (
            <div className="mt-4 inline-flex items-center gap-2 text-xs rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-white/70">
              <Sparkles size={12} className="text-[--accent]" />
              עריכת פרטי האירוע
            </div>
          )}

          <div className="mt-7">
            <div className="flex justify-between text-xs text-white/50 mb-2">
              <span>שלב <span className="ltr-num">{step + 1}</span> מתוך <span className="ltr-num">{totalSteps}</span></span>
              <span className="ltr-num">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9] transition-[width] duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-12 fade-up" key={step}>
            {step === 0 && (
              <Step1
                type={type}
                setType={setType}
                hostName={hostName}
                setHostName={setHostName}
                partnerName={partnerName}
                setPartnerName={setPartnerName}
                synagogue={synagogue}
                setSynagogue={setSynagogue}
                hostPhone={hostPhone}
                setHostPhone={setHostPhone}
                guardianConsent={guardianConsent}
                setGuardianConsent={setGuardianConsent}
              />
            )}
            {step === 1 && <Step2 date={date} setDate={setDate} type={type} />}
            {step === 2 && (
              <Step3 region={region} setRegion={setRegion} city={city} setCity={setCity} />
            )}
            {step === 3 && (
              <Step4
                type={type}
                budgetTotal={budgetTotal}
                setBudgetTotal={setBudgetTotal}
                guestEstimate={guestEstimate}
                setGuestEstimate={setGuestEstimate}
              />
            )}
          </div>

          <div className="mt-10 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="btn-secondary disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <ArrowRight size={16} />
              חזרה
            </button>

            {step < totalSteps - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="btn-gold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                המשך
                <ArrowLeft size={16} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={!canNext}
                className="btn-gold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isEdit ? "שמור שינויים" : "צא לדרך"}
                <CheckCircle2 size={18} />
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function StepHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="text-center mb-12">
      <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/15 to-[#A8884A]/5 border border-[var(--border-gold)] items-center justify-center text-[--accent]">
        {icon}
      </div>
      <h2 className="mt-6 text-3xl md:text-5xl font-bold tracking-tight gradient-text">{title}</h2>
      <p className="mt-3 text-white/55">{sub}</p>
    </div>
  );
}

function Step1({
  type,
  setType,
  hostName,
  setHostName,
  partnerName,
  setPartnerName,
  synagogue,
  setSynagogue,
  hostPhone,
  setHostPhone,
  guardianConsent,
  setGuardianConsent,
}: {
  type: EventType | null;
  setType: (t: EventType) => void;
  hostName: string;
  setHostName: (s: string) => void;
  partnerName: string;
  setPartnerName: (s: string) => void;
  synagogue: string;
  setSynagogue: (s: string) => void;
  hostPhone: string;
  setHostPhone: (s: string) => void;
  guardianConsent: boolean;
  setGuardianConsent: (v: boolean) => void;
}) {
  // R15 §1C — defensive lookup behind the null-guard.
  const config = type ? (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding) : null;
  const isMinorEvent = type ? MINOR_EVENT_TYPES.includes(type) : false;
  const justPicked = useRef(false);

  // Scroll the form into view AFTER it's rendered, but only when the user explicitly picked.
  useEffect(() => {
    if (!type || !justPicked.current) return;
    justPicked.current = false;
    const el = document.getElementById("event-form");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    // Try smooth scroll first; fall back to instant if the environment ignores it.
    window.scrollTo({ top, behavior: "smooth" });
    setTimeout(() => {
      if (Math.abs(window.scrollY - top) > 50) window.scrollTo({ top, behavior: "auto" });
    }, 350);
  }, [type]);

  const onPickType = (t: EventType) => {
    justPicked.current = true;
    setType(t);
  };

  return (
    <div>
      <StepHeader
        icon={<Sparkles size={24} />}
        title={config ? config.subject.step1Title : "איזה אירוע אתה מתכנן?"}
        sub={config ? config.subject.step1Subtitle : "בחר את סוג האירוע — נתאים את השאר אליו."}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {EVENT_OPTIONS.map((opt) => {
          const active = type === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onPickType(opt.value)}
              className={`card p-5 flex flex-col items-center gap-3 transition-all ${
                active ? "card-selected" : "card-hover"
              }`}
            >
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                active ? "bg-[--accent] text-black" : "bg-white/[0.04] text-[--accent]"
              }`}>
                {opt.icon}
              </span>
              <span className="text-sm font-medium">{EVENT_TYPE_LABELS[opt.value]}</span>
            </button>
          );
        })}
      </div>

      {config && (
        <div id="event-form" className="mt-10">
          <div className="card-gold p-6 mb-6">
            <p className="text-sm text-white/65 leading-relaxed">
              <span className="text-[--accent] font-semibold">{config.label}: </span>
              {config.tagline}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">{config.subject.hostLabel}</label>
              <input
                className="input"
                placeholder={config.subject.hostPlaceholder}
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
              />
            </div>
            {config.subject.hasPartner && (
              <div>
                <label className="block text-sm text-white/70 mb-2">{config.subject.partnerLabel}</label>
                <input
                  className="input"
                  placeholder={config.subject.partnerPlaceholder}
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                />
              </div>
            )}
            {config.subject.hasSynagogue && (
              <div className={config.subject.hasPartner ? "sm:col-span-2" : ""}>
                <label className="block text-sm text-white/70 mb-2">
                  {config.subject.synagogueLabel} <span className="text-white/40 text-xs">(לא חובה)</span>
                </label>
                <input
                  className="input"
                  placeholder="שם בית הכנסת או מקום הטקס"
                  value={synagogue}
                  onChange={(e) => setSynagogue(e.target.value)}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-sm mb-2" style={{ color: "var(--foreground-soft)" }}>
                הטלפון שלך לקבלת אישורי הגעה{" "}
                <span aria-hidden style={{ color: "rgb(248,113,113)" }}>*</span>
              </label>
              <input
                dir="ltr"
                className="input text-start"
                placeholder="050-1234567"
                value={hostPhone}
                onChange={(e) => setHostPhone(e.target.value)}
                aria-required
              />
              {/* R18 §1C — explicit consequence text instead of a vague
                  "(required)" so the user understands WHY it matters. */}
              <p
                className="mt-1.5 text-xs"
                style={{
                  color: hostPhone.trim()
                    ? "var(--foreground-muted)"
                    : "rgb(248,113,113)",
                }}
              >
                ללא טלפון אורחים לא יוכלו לאשר הגעה
              </p>
            </div>
          </div>

          {/* Guardian consent — REQUIRED for minor events. Without this checkbox
              the "Continue" button stays disabled (gated upstream in canNext). */}
          {isMinorEvent && (
            <label
              className="mt-6 flex items-start gap-3 rounded-2xl px-4 py-3.5 cursor-pointer"
              style={{
                background: "rgba(212,176,104,0.06)",
                border: `1px solid ${guardianConsent ? "var(--border-gold)" : "var(--border)"}`,
              }}
            >
              <input
                type="checkbox"
                checked={guardianConsent}
                onChange={(e) => setGuardianConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded shrink-0"
                style={{ accentColor: "var(--accent)" }}
                aria-required
              />
              <span className="text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
                <strong className="font-semibold" style={{ color: "var(--foreground)" }}>
                  אני ההורה או האפוטרופוס החוקי של החוגג/ת ומאשר/ת בשמו/ה
                </strong>
                <span className="block mt-1 text-xs" style={{ color: "var(--foreground-muted)" }}>
                  אישור זה נדרש כדי להמשיך לתכנון אירוע של קטין.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Manual day / month / year inputs in Hebrew RTL order. We deliberately
 * avoid `<input type="date">` because the OS calendar overlay it opens
 * confused hosts on mobile (they expected a typeable field). Three short
 * numeric inputs feel snappier and don't take over the screen.
 *
 * The component still emits the same `YYYY-MM-DD` string that the rest
 * of the app expects, so consumers don't need to change.
 */
function HebrewDateField({
  date,
  setDate,
  minToday = true,
}: {
  date: string;
  setDate: (s: string) => void;
  minToday?: boolean;
}) {
  // Parse the incoming `YYYY-MM-DD` into 3 separate strings (so the user
  // can clear a single field without losing the rest).
  const initial = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return m ? { y: m[1], mo: m[2], d: m[3] } : { y: "", mo: "", d: "" };
  })();
  const [day, setDay] = useState(initial.d);
  const [month, setMonth] = useState(initial.mo);
  const [year, setYear] = useState(initial.y);

  // Keep inputs in sync if the parent prop changes externally (edit mode
  // pre-fill, "back" navigation in onboarding). The setState-in-effect rule
  // doesn't fit this pattern: we're synchronizing internal state to an
  // external source, which is the documented use of useEffect. Suppress.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return;
    if (m[3] !== day) setDay(m[3]);
    if (m[2] !== month) setMonth(m[2]);
    if (m[1] !== year) setYear(m[1]);
  }, [date]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // R18 §1D — push the ISO string up ONLY when all three fields form a
  // valid (and not-in-the-past) date. Previously this effect *cleared*
  // the parent on every incomplete/invalid keystroke, which wiped a
  // perfectly good date the moment the user touched a digit to edit it.
  // Now we keep the last valid value and simply DON'T push until the new
  // input is itself valid — non-destructive editing.
  useEffect(() => {
    if (!day || !month || !year) return;
    const dNum = Number(day);
    const moNum = Number(month);
    const yNum = Number(year);
    if (!Number.isFinite(dNum) || !Number.isFinite(moNum) || !Number.isFinite(yNum)) return;
    if (yNum < 1900 || yNum > 9999) return;
    if (moNum < 1 || moNum > 12) return;
    if (dNum < 1 || dNum > 31) return;
    // Construct a Date in local time, then check the round-trip — catches
    // 31 בפברואר, 30 בפברואר etc. which JS otherwise normalizes to March.
    const probe = new Date(yNum, moNum - 1, dNum);
    if (
      probe.getFullYear() !== yNum ||
      probe.getMonth() !== moNum - 1 ||
      probe.getDate() !== dNum
    ) {
      return;
    }
    if (minToday) {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      if (probe.getTime() < todayMidnight.getTime()) return;
    }
    const iso = `${String(yNum).padStart(4, "0")}-${String(moNum).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
    if (iso !== date) setDate(iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, month, year, minToday]);

  // R18 §1D — native picker is now the primary affordance; the 3-field
  // manual entry is opt-in behind "או הקלד ידנית".
  const [showManual, setShowManual] = useState(false);
  const todayIso = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
  const onNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; // already YYYY-MM-DD or ""
    if (!v) return; // don't wipe a good value if they clear the native field
    if (minToday && v < todayIso) return;
    setDate(v);
  };

  // Refs for focus jumping (day → month → year, RTL).
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Inline change handlers — read refs at event time, never during render.
  // The linter's `react-hooks/refs` rule rejects passing refs as function
  // args during render, so we close over them here in event scope only.
  const onDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    setDay(v);
    if (v.length === 2) monthRef.current?.focus();
  };
  const onMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    setMonth(v);
    if (v.length === 2) yearRef.current?.focus();
  };
  const onYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setYear(v);
  };

  const sharedFieldStyle: React.CSSProperties = {
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
  };

  return (
    <div>
      {/* R18 §1D — native date picker first (most users just want the
          calendar). Manual day/month/year stays available below. */}
      <input
        type="date"
        dir="ltr"
        className="input text-start w-full text-lg"
        min={minToday ? todayIso : undefined}
        value={date}
        onChange={onNativeChange}
        aria-label="תאריך האירוע"
      />
      <button
        type="button"
        onClick={() => setShowManual((v) => !v)}
        className="mt-3 text-xs underline"
        style={{ color: "var(--foreground-muted)" }}
      >
        {showManual ? "הסתר הקלדה ידנית" : "או הקלד ידנית"}
      </button>

      {showManual && (
    <div className="grid grid-cols-3 gap-2 mt-3" dir="rtl">
      <label className="block">
        <span className="block text-xs text-center mb-1.5" style={{ color: "var(--foreground-muted)" }}>
          יום
        </span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="1-31"
          aria-label="יום באירוע"
          className="rounded-2xl px-3 py-3 text-lg text-center w-full ltr-num"
          style={sharedFieldStyle}
          value={day}
          onChange={onDayChange}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-center mb-1.5" style={{ color: "var(--foreground-muted)" }}>
          חודש
        </span>
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="1-12"
          aria-label="חודש האירוע"
          className="rounded-2xl px-3 py-3 text-lg text-center w-full ltr-num"
          style={sharedFieldStyle}
          value={month}
          onChange={onMonthChange}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-center mb-1.5" style={{ color: "var(--foreground-muted)" }}>
          שנה
        </span>
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="2026"
          aria-label="שנה של האירוע"
          className="rounded-2xl px-3 py-3 text-lg text-center w-full ltr-num"
          style={sharedFieldStyle}
          value={year}
          onChange={onYearChange}
        />
      </label>
    </div>
      )}
    </div>
  );
}

function Step2({ date, setDate, type }: { date: string; setDate: (s: string) => void; type: EventType | null }) {
  const now = useNow(null); // single snapshot is fine for the date picker
  const days = daysUntil(date, now);
  // R15 §1C — defensive lookup behind the null-guard.
  const eventLabel = type ? (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding).label : "האירוע";

  return (
    <div>
      <StepHeader
        icon={<CalendarDays size={24} />}
        title={`מתי ${eventLabel}?`}
        sub="התאריך מאפשר לנו לבנות לוח זמנים מדויק עבורך."
      />
      <div className="max-w-md mx-auto">
        <HebrewDateField date={date} setDate={setDate} />
        {date && days != null && (
          <p className="mt-4 text-center text-white/60 text-sm" suppressHydrationWarning>
            עוד <span className="ltr-num font-bold text-[--accent]">{days}</span> ימים לאירוע
          </p>
        )}
      </div>
    </div>
  );
}

function Step3({
  region,
  setRegion,
  city,
  setCity,
}: {
  region: Region | null;
  setRegion: (r: Region) => void;
  city: string;
  setCity: (s: string) => void;
}) {
  const regions = Object.entries(REGION_LABELS) as [Region, string][];
  return (
    <div>
      <StepHeader
        icon={<MapPin size={24} />}
        title="איפה האירוע?"
        sub="נציג לך את הספקים הכי טובים מהאזור שלך."
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
        {regions.map(([key, label]) => {
          const active = region === key;
          return (
            <button
              key={key}
              onClick={() => setRegion(key)}
              className={`card p-5 text-sm font-medium transition-all ${
                active ? "card-selected" : "card-hover"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-8 max-w-md mx-auto">
        <label className="block text-sm text-white/70 mb-2">
          עיר ספציפית <span className="text-white/40 text-xs">(לא חובה)</span>
        </label>
        <input
          className="input"
          placeholder="לדוגמה: תל אביב, רמת גן..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
    </div>
  );
}

function Step4({
  type,
  budgetTotal,
  setBudgetTotal,
  guestEstimate,
  setGuestEstimate,
}: {
  type: EventType | null;
  budgetTotal: string;
  setBudgetTotal: (s: string) => void;
  guestEstimate: string;
  setGuestEstimate: (s: string) => void;
}) {
  // R15 §1C — defensive lookup behind the null-guard.
  const avg = type ? (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding).avgPerGuest : 350;
  const presets = (() => {
    if (!type) return [50000, 100000, 150000, 250000];
    const base = avg;
    return [base * 50, base * 100, base * 200, base * 400].map((v) => Math.round(v / 5000) * 5000);
  })();
  const guestPresets = type === "brit" || type === "shabbat-chatan" ? [30, 80, 150, 300] : [50, 150, 300, 500];

  const computed = budgetTotal && guestEstimate && Number(guestEstimate) > 0
    ? Math.round(Number(budgetTotal) / Number(guestEstimate))
    : null;
  const benchmark = computed ? (computed < avg * 0.7 ? "tight" : computed > avg * 1.4 ? "premium" : "balanced") : null;

  return (
    <div>
      <StepHeader
        icon={<Wallet size={24} />}
        title="תקציב והיקף"
        sub="זה יעזור לנו להמליץ ספקים שמתאימים לך."
      />

      <div className="space-y-8">
        <div>
          <label className="block text-sm text-white/70 mb-2">תקציב כולל</label>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              className="input text-lg pe-10"
              placeholder="100,000"
              value={budgetTotal}
              onChange={(e) => setBudgetTotal(e.target.value)}
            />
            <span className="absolute end-4 top-1/2 -translate-y-1/2 text-white/40">₪</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setBudgetTotal(String(p))}
                className="text-xs rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5"
              >
                <span className="ltr-num">₪{p.toLocaleString("he-IL")}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-2">כמה מוזמנים אתה צופה?</label>
          <input
            type="number"
            inputMode="numeric"
            className="input text-lg"
            placeholder="200"
            value={guestEstimate}
            onChange={(e) => setGuestEstimate(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {guestPresets.map((p) => (
              <button
                key={p}
                onClick={() => setGuestEstimate(String(p))}
                className="text-xs rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5"
              >
                <span className="ltr-num">{p}</span>
              </button>
            ))}
          </div>
        </div>

        {computed !== null && (
          <div className="card-gold p-6 fade-up">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm text-white/60">עלות ממוצעת לאורח</div>
                <div className="text-4xl font-bold mt-2 gradient-gold ltr-num">
                  ₪{computed.toLocaleString("he-IL")}
                </div>
              </div>
              <div className="text-end">
                <div className="text-xs text-white/50">ממוצע ל{type ? (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding).label : "אירוע"}</div>
                <div className="text-sm font-semibold text-white/80 ltr-num mt-2">
                  ~₪{avg.toLocaleString("he-IL")}
                </div>
              </div>
            </div>
            {benchmark && (
              <div className="mt-4 text-sm">
                {benchmark === "tight" && (
                  <span className="text-amber-300/80">תקציב צמוד — אפשרי, אבל נצטרך להיות חכמים בבחירת ספקים.</span>
                )}
                {benchmark === "balanced" && (
                  <span className="text-emerald-300/80">תקציב מאוזן — תוכל לבחור ספקים איכותיים בלי דאגות.</span>
                )}
                {benchmark === "premium" && (
                  <span className="text-[--accent]">תקציב פרימיום — תוכל להרשות לעצמך את הטובים ביותר.</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
