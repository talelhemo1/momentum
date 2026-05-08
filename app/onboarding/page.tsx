"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { actions, useAppState } from "@/lib/store";
import { useUser, userActions, type ObservanceLevel } from "@/lib/user";
import { OBSERVANCE_DESCRIPTIONS, OBSERVANCE_LABELS } from "@/lib/israeliCalendar";
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
  useEffect(() => {
    if (userHydrated && !user) router.replace("/signup");
    else if (!isEdit && search.get("gate") !== "ok" && userHydrated && user) {
      router.replace("/start");
    }
  }, [userHydrated, user, router, isEdit, search]);

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
  // Observance level — controls whether reminders are suppressed on Shabbat / חג /
  // ימי אבל. Default "secular" so we don't accidentally muzzle reminders for
  // someone who didn't pick. Saved to UserAccount on handleFinish.
  const [observance, setObservance] = useState<ObservanceLevel>("secular");

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
    }
    // Pre-seed observance picker from the user's stored level (returning users).
    if (user?.observanceLevel) setObservance(user.observanceLevel);
    setPrefilled(true);
  }, [hydrated, isEdit, state.event, user, prefilled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalSteps = 4;
  const progress = ((step + 1) / totalSteps) * 100;
  const config = type ? EVENT_CONFIG[type] : null;

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
    // Persist the observance choice to the local user profile so reminders
    // gating can read it later. Best-effort — no profile = no save, no error.
    userActions.updateProfile({ observanceLevel: observance });
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
    router.push("/dashboard");
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
                observance={observance}
                setObservance={setObservance}
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
  observance,
  setObservance,
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
  observance: ObservanceLevel;
  setObservance: (o: ObservanceLevel) => void;
}) {
  const config = type ? EVENT_CONFIG[type] : null;
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
                הטלפון שלך לקבלת אישורי הגעה <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>(נדרש כדי שאורחים יוכלו להחזיר תשובה לוואטסאפ שלך)</span>
              </label>
              <input
                dir="ltr"
                className="input text-start"
                placeholder="050-1234567"
                value={hostPhone}
                onChange={(e) => setHostPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Observance level — drives reminder/notification gating around
              Shabbat, חגים, and ימי אבל. Optional question; defaults to "secular"
              so we never accidentally muzzle reminders for someone who skipped. */}
          <fieldset className="mt-7">
            <legend className="block text-sm mb-3" style={{ color: "var(--foreground-soft)" }}>
              באיזו רמה אתה שומר שבת וחגים?{" "}
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                (קובע מתי נשלח לך תזכורות)
              </span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(OBSERVANCE_LABELS) as ObservanceLevel[]).map((level) => {
                const active = observance === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setObservance(level)}
                    aria-pressed={active}
                    className="rounded-2xl px-4 py-3 text-start transition"
                    style={{
                      background: active ? "rgba(212,176,104,0.1)" : "var(--input-bg)",
                      border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                      color: active ? "var(--foreground)" : "var(--foreground-soft)",
                    }}
                  >
                    <div className="font-bold text-sm">
                      {OBSERVANCE_LABELS[level]}
                      {active && <span className="ms-2 text-[--accent]" aria-hidden>✓</span>}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
                      {OBSERVANCE_DESCRIPTIONS[level]}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

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

function Step2({ date, setDate, type }: { date: string; setDate: (s: string) => void; type: EventType | null }) {
  const now = useNow(null); // single snapshot is fine for the date picker
  const today = now ? new Date(now).toISOString().split("T")[0] : undefined;
  const days = daysUntil(date, now);
  const eventLabel = type ? EVENT_CONFIG[type].label : "האירוע";

  return (
    <div>
      <StepHeader
        icon={<CalendarDays size={24} />}
        title={`מתי ${eventLabel}?`}
        sub="התאריך מאפשר לנו לבנות לוח זמנים מדויק עבורך."
      />
      <div className="max-w-md mx-auto">
        <input
          type="date"
          min={today}
          className="input text-lg text-center"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
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
  const avg = type ? EVENT_CONFIG[type].avgPerGuest : 350;
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
                <div className="text-xs text-white/50">ממוצע ל{type ? EVENT_CONFIG[type].label : "אירוע"}</div>
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
