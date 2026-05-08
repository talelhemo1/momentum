"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/lib/store";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/types";
import type { GuestStatus } from "@/lib/types";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import { Logo } from "@/components/Logo";
import { trackEvent } from "@/lib/analytics";
import {
  decodeInvitation,
  buildGuestResponseWhatsappLink,
  type InvitationPayload,
} from "@/lib/invitation";
import {
  Heart,
  CalendarDays,
  MapPin,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Send,
  Copy,
  Users,
  ListChecks,
  Armchair,
  ArrowLeft,
} from "lucide-react";

export default function RsvpPageRouter() {
  return (
    <Suspense fallback={null}>
      <RsvpInner />
    </Suspense>
  );
}

function RsvpInner() {
  const searchParams = useSearchParams();
  const dParam = searchParams.get("d");
  const sigParam = searchParams.get("sig");
  const { state, hydrated } = useAppState();
  const [count, setCount] = useState(2);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState<null | "confirmed" | "declined" | "maybe">(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const passthroughSig = sigParam || undefined;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const payload: InvitationPayload | null = useMemo(() => {
    if (!dParam) return null;
    return decodeInvitation(dParam);
  }, [dParam]);

  const resolved = useMemo(() => {
    if (payload) {
      return {
        eventId: payload.e.id,
        eventType: payload.e.type,
        hostName: payload.e.host,
        partnerName: payload.e.partner,
        date: payload.e.date,
        city: payload.e.city,
        synagogue: payload.e.synagogue,
        hostPhone: payload.e.hostPhone,
        guest: { id: payload.g.id, name: payload.g.name },
      };
    }
    if (state.event) return null;
    return null;
  }, [payload, state.event]);

  // Track view on first render with a resolved payload — only once per page load.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || !resolved) return;
    trackedRef.current = true;
    trackEvent("rsvp_view", { eventId: resolved.eventId, eventType: resolved.eventType });
  }, [resolved]);

  if (!hydrated && !payload) {
    return <main className="min-h-screen flex items-center justify-center" style={{ color: "var(--foreground-muted)" }}>טוען...</main>;
  }

  if (!resolved) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-10 text-center max-w-md">
          <h1 className="text-2xl font-bold">הקישור לא תקין</h1>
          <p className="mt-3" style={{ color: "var(--foreground-soft)" }}>
            ייתכן שהקישור פגום או שגוי. אנא פנו למארח האירוע ובקשו ממנו לשלוח שוב.
          </p>
        </div>
      </main>
    );
  }

  const config = EVENT_CONFIG[resolved.eventType];
  const subjects = config.invitationHostPhrase(resolved.hostName, resolved.partnerName);

  const respond = (status: GuestStatus) => {
    if (!resolved) return;
    const finalStatus = status as "confirmed" | "declined" | "maybe";
    const finalCount = finalStatus === "confirmed" ? count : 0;

    // CRITICAL: window.open MUST be synchronous inside the click handler so
    // browsers don't classify it as an unsolicited popup. We compute first,
    // open, THEN update React state.
    const { url, valid } = buildGuestResponseWhatsappLink(
      origin,
      { hostPhone: resolved.hostPhone, hostName: resolved.hostName, partnerName: resolved.partnerName },
      resolved.guest,
      resolved.eventId,
      finalStatus,
      finalCount,
      passthroughSig,
      note.trim() || undefined,
    );
    if (valid) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    trackEvent(`rsvp_${finalStatus}`, {
      eventId: resolved.eventId,
      eventType: resolved.eventType,
      attendingCount: finalCount,
      hasNote: note.trim().length > 0,
    });
    setSubmitted(finalStatus);
    if (finalStatus === "confirmed") {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 2400);
    }
  };

  return (
    <main className="min-h-screen pb-16 relative overflow-x-hidden">
      <ParallaxBackdrop />
      {showConfetti && <Confetti />}

      <div className="max-w-xl mx-auto px-5 pt-8 relative z-10">
        <div className="flex justify-center">
          <Logo size={26} />
        </div>

        <Hero
          eventType={resolved.eventType}
          subjects={subjects}
          dateISO={resolved.date}
          city={resolved.city}
          synagogue={resolved.synagogue}
          guestName={resolved.guest.name}
        />

        {submitted ? (
          <>
            <ResponseSentCard
              status={submitted}
              count={submitted === "confirmed" ? count : 0}
              guestName={resolved.guest.name}
              note={note.trim() || undefined}
              origin={origin}
              event={{ hostPhone: resolved.hostPhone, hostName: resolved.hostName, partnerName: resolved.partnerName }}
              guest={resolved.guest}
              eventId={resolved.eventId}
              passthroughSignature={passthroughSig}
              onChange={() => setSubmitted(null)}
            />
            <ViralCTA eventType={resolved.eventType} />
          </>
        ) : (
          <ResponsePicker
            count={count}
            setCount={setCount}
            note={note}
            setNote={setNote}
            onRespond={respond}
            hasPartner={config.subject.hasPartner}
          />
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs" style={{ color: "var(--foreground-muted)" }}>
          <Heart size={12} /> מופעל על ידי Momentum
        </div>
      </div>
    </main>
  );
}

// ───────────────────────────────────── Hero with countdown ─────────────────────────────────────

function Hero({
  eventType,
  subjects,
  dateISO,
  city,
  synagogue,
  guestName,
}: {
  eventType: EventType;
  subjects: string;
  dateISO: string;
  city?: string;
  synagogue?: string;
  guestName: string;
}) {
  const dateFmt = new Date(dateISO).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="card-gold p-7 md:p-9 mt-8 relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 -end-24 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.22),transparent_70%)] blur-2xl" />
      <div aria-hidden className="absolute -bottom-20 -start-20 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(244,222,169,0.16),transparent_70%)] blur-3xl" />

      <div className="relative text-center">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--border-gold)" }}>
          <Sparkles size={13} className="text-[--accent]" />
          {EVENT_TYPE_LABELS[eventType]}
        </div>

        <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight gradient-gold leading-[1.1]">
          {subjects}
        </h1>

        <p className="mt-4" style={{ color: "var(--foreground-soft)" }}>
          שלום <strong style={{ color: "var(--foreground)" }}>{guestName}</strong>, אתם מוזמנים לחגוג איתנו!
        </p>

        <div className="mt-6 flex flex-col items-center gap-2" style={{ color: "var(--foreground-soft)" }}>
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[--accent]" />
            <span className="font-medium">{dateFmt}</span>
          </div>
          {(city || synagogue) && (
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-[--accent]" />
              <span>{[synagogue, city].filter(Boolean).join(" · ")}</span>
            </div>
          )}
        </div>

        <CountdownTimer targetISO={dateISO} />
      </div>
    </section>
  );
}

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  past: boolean;
}

function diffParts(target: number, now: number): Countdown {
  const past = now > target;
  const ms = Math.abs(target - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { days, hours, minutes, seconds, past };
}

function CountdownTimer({ targetISO }: { targetISO: string }) {
  const target = new Date(targetISO).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null || Number.isNaN(target)) return null;
  const c = diffParts(target, now);

  if (c.past && c.days > 0) {
    return (
      <div className="mt-7 text-sm" style={{ color: "var(--foreground-soft)" }}>
        🎉 האירוע כבר היה. תודה שהיית חלק מזה!
      </div>
    );
  }

  return (
    <div className="mt-7" aria-label="ספירה לאחור לאירוע">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
        עוד
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 max-w-md mx-auto">
        <CountUnit value={c.days} label="ימים" />
        <CountUnit value={c.hours} label="שעות" />
        <CountUnit value={c.minutes} label="דקות" />
        <CountUnit value={c.seconds} label="שניות" />
      </div>
    </div>
  );
}

function CountUnit({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-2xl py-3 px-2 text-center"
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid var(--border-gold)",
      }}
    >
      <div className="text-2xl md:text-3xl font-extrabold ltr-num gradient-gold tabular-nums">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--foreground-muted)" }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────── Parallax + confetti ───────────────────────────────────

function ParallaxBackdrop() {
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const onScroll = () => setScroll(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 -z-0 pointer-events-none overflow-hidden">
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-25"
        style={{
          background: "radial-gradient(circle, rgba(212,176,104,0.45), transparent 70%)",
          transform: `translate(-50%, ${scroll * -0.25}px)`,
          willChange: "transform",
        }}
      />
      <div
        className="absolute top-1/2 -end-40 w-[500px] h-[500px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(244,222,169,0.4), transparent 70%)",
          transform: `translateY(${scroll * -0.15}px)`,
          willChange: "transform",
        }}
      />
    </div>
  );
}

function Confetti() {
  // Pure CSS confetti — 40 gold flakes with random delays + horizontal drift.
  // The randomness is intentional and runs ONCE per Confetti mount — useState's
  // lazy initializer is the right primitive (it's a one-shot computation, not a
  // memoized derivation that should be reproducible on repeat renders).
  const [flakes] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      duration: 1.4 + Math.random() * 1,
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360,
      hue: ["#A8884A", "#D4B068", "#F4DEA9", "#FFFFFF"][i % 4],
    })),
  );

  return (
    <div aria-hidden className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="absolute -top-4 rounded-sm confetti-flake"
          style={{
            left: `${f.left}%`,
            width: `${f.size}px`,
            height: `${f.size * 0.4}px`,
            background: f.hue,
            animation: `confetti-fall ${f.duration}s cubic-bezier(0.2,0.6,0.4,1) ${f.delay}s forwards`,
            transform: `rotate(${f.rotate}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────── Response picker ───────────────────────────────────

function ResponsePicker({
  count,
  setCount,
  note,
  setNote,
  onRespond,
  hasPartner,
}: {
  count: number;
  setCount: (n: number) => void;
  note: string;
  setNote: (s: string) => void;
  onRespond: (status: GuestStatus) => void;
  hasPartner: boolean;
}) {
  const [intent, setIntent] = useState<null | "confirmed" | "maybe" | "declined">(null);

  // hasPartner is currently informational only — kept on the prop list so future
  // copy variants ("שניכם מגיעים?") can opt in without another refactor.
  void hasPartner;

  // For "confirmed" we require a confirmation step (count + note). For maybe/declined we
  // submit immediately to keep that path short.
  const handlePickIntent = (status: "confirmed" | "maybe" | "declined") => {
    if (status === "confirmed") {
      setIntent("confirmed");
    } else {
      onRespond(status);
    }
  };

  if (intent === "confirmed") {
    return (
      <div className="card p-6 mt-6 fade-up">
        <h2 className="text-lg font-bold text-center">איזה כיף שאתם באים! 🎉</h2>

        <label className="block text-sm mt-6 mb-3 text-center" style={{ color: "var(--foreground-soft)" }}>
          כמה אנשים מגיעים איתך?
        </label>
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = count === n;
            return (
              <button
                key={n}
                onClick={() => setCount(n)}
                aria-label={`${n} אנשים`}
                aria-pressed={active}
                className="w-12 h-12 rounded-2xl text-lg font-extrabold transition ltr-num"
                style={{
                  background: active ? "linear-gradient(135deg, #F4DEA9, #A8884A)" : "var(--input-bg)",
                  color: active ? "#1A1310" : "var(--foreground-soft)",
                  border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <label className="block text-sm mt-6 mb-2" style={{ color: "var(--foreground-soft)" }}>
          הערה למארחים <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>(אלרגיה? בקשה מיוחדת? לא חובה)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="לדוגמה: צמחוני ללא גלוטן"
          className="input"
          style={{ resize: "none" }}
        />
        <div className="mt-1 text-xs text-end ltr-num" style={{ color: "var(--foreground-muted)" }}>
          {note.length} / 300
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2.5">
          <button
            onClick={() => onRespond("confirmed")}
            aria-label={`אשר הגעה של ${count} אנשים`}
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black font-extrabold py-4 inline-flex items-center justify-center gap-2 text-base"
          >
            <CheckCircle2 size={20} />
            אישור סופי — מגיעים <span className="ltr-num">({count})</span>
          </button>
          <button
            onClick={() => setIntent(null)}
            className="text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 mt-6">
      <h2 className="text-lg font-bold text-center">תוכלו להגיע?</h2>

      <div className="mt-6 grid grid-cols-1 gap-3">
        <BigChoice
          tone="emerald"
          label="מגיע ✓"
          sub="אשר הגעה ובחר כמות"
          onClick={() => handlePickIntent("confirmed")}
          icon={<CheckCircle2 size={22} />}
        />
        <BigChoice
          tone="amber"
          label="אולי"
          sub="עוד בודקים. תעדכנו אותנו אחר כך"
          onClick={() => handlePickIntent("maybe")}
          icon={<HelpCircle size={22} />}
        />
        <BigChoice
          tone="muted"
          label="לא מגיע"
          sub="לצערנו לא נוכל להגיע"
          onClick={() => handlePickIntent("declined")}
          icon={<XCircle size={22} />}
        />
      </div>
    </div>
  );
}

function BigChoice({
  tone,
  label,
  sub,
  onClick,
  icon,
}: {
  tone: "emerald" | "amber" | "muted";
  label: string;
  sub: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  const styles =
    tone === "emerald"
      ? {
          background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.06))",
          border: "1px solid rgba(16,185,129,0.45)",
          color: "rgb(167,243,208)",
        }
      : tone === "amber"
        ? {
            background: "rgba(212,176,104,0.08)",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
          }
        : {
            background: "var(--input-bg)",
            border: "1px solid var(--border)",
            color: "var(--foreground-soft)",
          };
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-2xl px-5 py-4 text-start transition flex items-center gap-4 hover:translate-y-[-2px]"
      style={styles}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">
        <span className="block text-lg font-extrabold">{label}</span>
        <span className="block text-xs mt-0.5 opacity-80">{sub}</span>
      </span>
      <ArrowLeft size={16} className="opacity-50" aria-hidden />
    </button>
  );
}

// ─────────────────────────────── Sent confirmation card ───────────────────────────────

function ResponseSentCard({
  status,
  count,
  guestName,
  note,
  origin,
  event,
  guest,
  eventId,
  passthroughSignature,
  onChange,
}: {
  status: "confirmed" | "declined" | "maybe";
  count: number;
  guestName: string;
  note?: string;
  origin: string;
  event: { hostPhone?: string; hostName: string; partnerName?: string };
  guest: { id: string; name: string };
  eventId: string;
  passthroughSignature?: string;
  onChange: () => void;
}) {
  const { url, importUrl, valid } = useMemo(
    () => buildGuestResponseWhatsappLink(origin, event, guest, eventId, status, count, passthroughSignature, note),
    [origin, event, guest, eventId, status, count, passthroughSignature, note],
  );

  const ui =
    status === "confirmed"
      ? {
          icon: <CheckCircle2 size={32} />,
          title: `תודה ${guestName}, נשמח לראותך! 🎉`,
          sub: count > 1 ? `רשמנו ${count} אנשים. שלחו את האישור למארחים — לחיצה אחת ובסיום.` : "רשמנו את ההגעה שלך. שלחו את האישור למארחים — לחיצה אחת ובסיום.",
          color: "from-emerald-500/20 to-emerald-400/5",
        }
      : status === "maybe"
        ? {
            icon: <HelpCircle size={32} />,
            title: `תודה ${guestName}!`,
            sub: "רשמנו 'אולי'. תוכלו לעדכן בכל רגע.",
            color: "from-amber-500/20 to-amber-400/5",
          }
        : {
            icon: <XCircle size={32} />,
            title: `תודה ${guestName} על העדכון`,
            sub: "נצטער שלא תוכלו להצטרף — נדאג לעדכן את המארחים.",
            color: "from-white/10 to-white/0",
          };

  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(importUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className={`card p-7 mt-6 bg-gradient-to-b ${ui.color}`}>
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-[--accent]"
          style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}
        >
          {ui.icon}
        </div>
        <h2 className="mt-4 text-xl font-bold">{ui.title}</h2>
        <p className="mt-1.5 text-sm" style={{ color: "var(--foreground-soft)" }}>{ui.sub}</p>
      </div>

      <div className="mt-7 space-y-2.5">
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3.5 inline-flex items-center justify-center gap-2 w-full transition"
        >
          <Send size={18} />
          שלח תשובה לוואטסאפ של המארחים
        </a>

        <div className="text-xs text-center" style={{ color: "var(--foreground-muted)" }}>
          {valid
            ? "ייפתח וואטסאפ עם הודעה מוכנה — צריך רק ללחוץ \"שלח\""
            : "המארחים לא הזינו טלפון — תוכלו לשלוח את התשובה ידנית"}
        </div>

        <button
          onClick={onCopy}
          className="w-full rounded-2xl py-2.5 text-sm inline-flex items-center justify-center gap-2 transition"
          style={{ border: "1px dashed var(--border-strong)", color: "var(--foreground-soft)" }}
        >
          <Copy size={14} />
          {copied ? "הועתק ✓" : "העתק קישור (אם וואטסאפ לא נפתח)"}
        </button>

        <button onClick={onChange} className="w-full text-xs" style={{ color: "var(--foreground-muted)" }}>
          שינוי תשובה
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────── Viral CTA ───────────────────────────────────

function ViralCTA({ eventType }: { eventType: EventType }) {
  const onClick = () => {
    trackEvent("rsvp_referral_click", { eventType });
  };
  return (
    <section
      className="card-gold p-6 md:p-7 mt-6 text-center relative overflow-hidden fade-up"
      aria-label="הצעה לפתיחת חשבון Momentum"
    >
      <div aria-hidden className="absolute -top-16 -end-16 w-48 h-48 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.22),transparent_70%)] blur-2xl" />

      <div className="relative">
        <div className="text-2xl">📅</div>
        <h3 className="mt-3 text-xl md:text-2xl font-extrabold tracking-tight gradient-gold">
          גם אתה מתכנן אירוע?
        </h3>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          Momentum עוזרת לך בחינם. כל מה שצריך לתכנון אירוע מושלם, במקום אחד.
        </p>

        <ul className="mt-5 space-y-2.5 text-start max-w-sm mx-auto">
          <ViralBullet icon={<ListChecks size={16} />}>צ&apos;קליסט מותאם לפי סוג האירוע והתאריך שלך</ViralBullet>
          <ViralBullet icon={<Users size={16} />}>ניהול אורחים והזמנות בוואטסאפ אוטומטיות</ViralBullet>
          <ViralBullet icon={<Armchair size={16} />}>סידורי הושבה חכמים עם גרירה ושמירה</ViralBullet>
        </ul>

        <Link
          href={`/onboarding?ref=rsvp&event_type=${encodeURIComponent(eventType)}`}
          onClick={onClick}
          className="btn-gold mt-6 inline-flex items-center justify-center gap-2 w-full"
        >
          התחל בחינם
          <ArrowLeft size={16} />
        </Link>

        <p className="mt-3 text-[11px]" style={{ color: "var(--foreground-muted)" }}>
          14 ימי ניסיון על פרימיום. ללא כרטיס. ביטול בכל רגע.
        </p>
      </div>
    </section>
  );
}

function ViralBullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
      <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[--accent]" style={{ background: "rgba(212,176,104,0.12)", border: "1px solid var(--border-gold)" }}>
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
