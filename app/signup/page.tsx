"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { userActions, type SignupMethod } from "@/lib/user";
import { Phone, ArrowLeft, ArrowRight, Sparkles, ShieldCheck, CheckCircle2 } from "lucide-react";

type Step = "choose" | "phone" | "name";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<SignupMethod | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const cloudEnabled = userActions.cloudEnabled();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);

  // Stamp the consent in localStorage so we have an auditable record. Called
  // at the moment a signup is actually attempted (not when the box is ticked),
  // because that's when the user becomes legally bound to the terms.
  const persistConsent = () => {
    try {
      window.localStorage.setItem("momentum.terms_accepted_at", new Date().toISOString());
    } catch {
      // localStorage might be disabled (private mode, quota); we still allow signup.
    }
  };

  const handleProvider = async (m: "google" | "apple") => {
    setError(null);
    if (!consented) {
      setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
      return;
    }
    persistConsent();
    if (cloudEnabled) {
      try {
        setBusy(true);
        await userActions.signInWithOAuth(m);
        // Browser will redirect to provider — nothing else to do.
      } catch {
        setError("ההתחברות נכשלה. נסה שוב.");
        setBusy(false);
      }
      return;
    }
    // Local fallback (no cloud configured): show name step.
    setMethod(m);
    setIdentifier(m === "google" ? "user@gmail.com" : "user@privaterelay.appleid.com");
    setStep("name");
  };

  const sendOtp = async () => {
    setError(null);
    if (!consented) {
      setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
      return;
    }
    if (!identifier.trim() || identifier.replace(/\D/g, "").length < 9) return;
    persistConsent();
    if (cloudEnabled) {
      try {
        setBusy(true);
        await userActions.sendPhoneOtp(identifier);
        setOtpSent(true);
      } catch {
        setError("שליחת קוד נכשלה. בדוק את המספר ונסה שוב.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setOtpSent(true);
  };

  const verifyOtp = async () => {
    setError(null);
    if (otp.length < 4) return;
    if (cloudEnabled) {
      try {
        setBusy(true);
        await userActions.verifyPhoneOtp(identifier, otp);
        // Auth state listener will redirect on success.
        router.push("/start");
      } catch {
        setError("הקוד שגוי. נסה שוב.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setMethod("phone");
    setStep("name");
  };

  const finishSignup = () => {
    if (!method || !name.trim()) return;
    persistConsent();
    userActions.signup({ name: name.trim(), identifier, method });
    router.push("/start");
  };

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">
      <div aria-hidden className="glow-orb glow-orb-gold w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40" />
      <div aria-hidden className="glow-orb glow-orb-cool w-[400px] h-[400px] top-10 right-10 opacity-25" />

      <div className="px-5 sm:px-8 pt-6 relative z-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowRight size={14} /> חזרה לדף הבית
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-12 relative z-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8 fade-up">
            <Logo size={32} />
          </div>

          {step === "choose" && (
            <ChooseStep
              onProvider={handleProvider}
              onPhone={() => setStep("phone")}
              disabled={!consented}
            />
          )}

          {step === "phone" && (
            <PhoneStep
              identifier={identifier}
              setIdentifier={setIdentifier}
              otp={otp}
              setOtp={setOtp}
              otpSent={otpSent}
              sendOtp={sendOtp}
              verifyOtp={verifyOtp}
              onBack={() => {
                setStep("choose");
                setOtpSent(false);
                setOtp("");
              }}
            />
          )}

          {step === "name" && (
            <NameStep
              name={name}
              setName={setName}
              method={method!}
              onBack={() => setStep("choose")}
              onFinish={finishSignup}
            />
          )}

          {error && (
            <div className="mt-4 rounded-2xl p-3 text-sm text-center" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "rgb(254 202 202)" }}>
              {error}
            </div>
          )}

          {busy && (
            <div className="mt-4 text-center text-xs" style={{ color: "var(--foreground-muted)" }}>
              טוען...
            </div>
          )}

          {!cloudEnabled && (
            <div className="mt-4 rounded-2xl p-3 text-xs text-center" style={{ background: "var(--input-bg)", border: "1px dashed var(--border)", color: "var(--foreground-muted)" }}>
              💡 מצב מקומי (Cloud Sync לא מוגדר). הוסף Supabase keys ב-<code style={{ color: "var(--accent)" }}>.env.local</code> כדי לסנכרן בענן.
            </div>
          )}

          {step === "choose" && (
            <label
              className="mt-6 flex items-start gap-3 text-xs cursor-pointer fade-up"
              style={{ animationDelay: "150ms" } as CSSProperties}
            >
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded shrink-0"
                style={{ accentColor: "var(--accent)" }}
                aria-required
              />
              <span style={{ color: "var(--foreground-soft)" }}>
                קראתי ואני מסכים/ה ל
                <Link href="/terms" target="_blank" className="text-[--accent] hover:underline">תנאי השימוש</Link>
                {" "}ול
                <Link href="/privacy" target="_blank" className="text-[--accent] hover:underline">מדיניות הפרטיות</Link>
                .
              </span>
            </label>
          )}
        </div>
      </div>
    </main>
  );
}

function ChooseStep({ onProvider, onPhone, disabled }: { onProvider: (m: "google" | "apple") => void; onPhone: () => void; disabled: boolean }) {
  return (
    <div className="card-gold p-7 md:p-8 fade-up">
      <div className="text-center">
        <span className="pill pill-gold">
          <Sparkles size={11} />
          ברוכים הבאים
        </span>
        <h1 className="mt-5 text-3xl md:text-4xl font-extrabold tracking-tight gradient-text">
          הצטרף ל-Momentum
        </h1>
        <p className="mt-3 text-white/60 leading-relaxed">
          התחל לתכנן את האירוע שלך — חינם, בדקה אחת.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={() => onProvider("google")}
          disabled={disabled}
          className="w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition group disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          <span className="font-semibold">המשך עם Google</span>
        </button>
        <button
          onClick={() => onProvider("apple")}
          disabled={disabled}
          className="w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <AppleIcon />
          <span className="font-semibold">המשך עם Apple</span>
        </button>

        <div className="flex items-center gap-3 my-2 text-xs text-white/35">
          <div className="flex-1 h-px bg-white/10" />
          <span>או</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          onClick={onPhone}
          disabled={disabled}
          className="w-full btn-gold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Phone size={18} />
          המשך עם מספר טלפון
        </button>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/45">
        <ShieldCheck size={12} className="text-[--accent]" />
        ההרשמה מאובטחת ומוצפנת
      </div>
    </div>
  );
}

function PhoneStep({
  identifier,
  setIdentifier,
  otp,
  setOtp,
  otpSent,
  sendOtp,
  verifyOtp,
  onBack,
}: {
  identifier: string;
  setIdentifier: (s: string) => void;
  otp: string;
  setOtp: (s: string) => void;
  otpSent: boolean;
  sendOtp: () => void;
  verifyOtp: () => void;
  onBack: () => void;
}) {
  return (
    <div className="card-gold p-7 md:p-8 fade-up">
      <div className="text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/15 to-[#A8884A]/5 border border-[var(--border-gold)] items-center justify-center text-[--accent]">
          <Phone size={22} />
        </div>
        <h1 className="mt-5 text-2xl md:text-3xl font-bold tracking-tight gradient-text">
          {otpSent ? "אישור קוד" : "התחברות במספר"}
        </h1>
        <p className="mt-3 text-white/60 text-sm leading-relaxed">
          {otpSent ? `שלחנו לך קוד באימות ל-${identifier}` : "נשלח לך קוד אימות בהודעה"}
        </p>
      </div>

      <div className="mt-7 space-y-3">
        {!otpSent ? (
          <>
            <div>
              <label className="block text-sm text-white/70 mb-2">מספר טלפון</label>
              <input
                dir="ltr"
                type="tel"
                inputMode="tel"
                placeholder="050-1234567"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="input text-lg text-center"
              />
            </div>
            <button onClick={sendOtp} disabled={!identifier} className="w-full btn-gold disabled:opacity-40 inline-flex items-center justify-center gap-2">
              שלח קוד אימות
              <ArrowLeft size={16} />
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm text-white/70 mb-2">קוד שקיבלת ב-SMS</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="input text-2xl text-center tracking-[0.4em] font-bold"
              />
            </div>
            {!userActions.cloudEnabled() && (
              <div className="text-xs text-white/45 text-center">
                💡 בגרסת ההדגמה — הזן כל קוד עם 4 ספרות או יותר
              </div>
            )}
            <button onClick={verifyOtp} disabled={otp.length < 4} className="w-full btn-gold disabled:opacity-40 inline-flex items-center justify-center gap-2">
              אמת והמשך
              <CheckCircle2 size={18} />
            </button>
          </>
        )}

        <button onClick={onBack} className="w-full btn-secondary text-sm py-2.5">
          חזרה
        </button>
      </div>
    </div>
  );
}

function NameStep({
  name,
  setName,
  method,
  onBack,
  onFinish,
}: {
  name: string;
  setName: (s: string) => void;
  method: SignupMethod;
  onBack: () => void;
  onFinish: () => void;
}) {
  const methodLabel = method === "google" ? "Google" : method === "apple" ? "Apple" : "טלפון";
  return (
    <div className="card-gold p-7 md:p-8 fade-up">
      <div className="text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/15 to-[#A8884A]/5 border border-[var(--border-gold)] items-center justify-center text-[--accent]">
          <Sparkles size={22} />
        </div>
        <h1 className="mt-5 text-2xl md:text-3xl font-bold tracking-tight gradient-text">
          איך נקרא לך?
        </h1>
        <p className="mt-3 text-white/60 text-sm">
          התחברת באמצעות <span className="text-[--accent]">{methodLabel}</span>. עוד שלב אחד ויוצאים לדרך.
        </p>
      </div>

      <div className="mt-7 space-y-3">
        <div>
          <label className="block text-sm text-white/70 mb-2">השם שלך</label>
          <input
            type="text"
            placeholder="שם פרטי ושם משפחה"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input text-lg"
            autoFocus
          />
        </div>

        <button
          onClick={onFinish}
          disabled={!name.trim()}
          className="w-full btn-gold disabled:opacity-40 inline-flex items-center justify-center gap-2"
        >
          סיים והתחל לתכנן
          <ArrowLeft size={16} />
        </button>

        <button onClick={onBack} className="w-full btn-secondary text-sm py-2.5">
          חזרה
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.43 2.2-1.13 3-.74.83-1.94 1.49-3.04 1.42-.13-1.1.42-2.27 1.1-3 .76-.84 2.04-1.46 3.07-1.42zM20.5 17.3c-.36.85-.79 1.65-1.31 2.39-.7.99-1.29 1.68-1.74 2.07-.71.62-1.46.94-2.27.96-.58 0-1.27-.16-2.09-.49-.81-.33-1.55-.49-2.23-.49-.71 0-1.48.16-2.31.49-.83.33-1.5.5-2.02.51-.78.04-1.55-.29-2.31-.97-.5-.41-1.13-1.13-1.87-2.16-.79-1.1-1.45-2.39-1.96-3.85-.55-1.59-.83-3.13-.83-4.62 0-1.71.37-3.18 1.11-4.42.59-.99 1.36-1.78 2.34-2.36.97-.58 2.03-.87 3.16-.89.61 0 1.41.19 2.41.55 1 .37 1.64.56 1.92.56.21 0 .92-.22 2.13-.66 1.14-.41 2.11-.58 2.91-.51 2.16.17 3.78 1.02 4.86 2.55-1.93 1.17-2.88 2.81-2.86 4.92.02 1.64.62 3.01 1.78 4.1.53.5 1.12.89 1.78 1.16-.14.41-.3.81-.46 1.2z"/>
    </svg>
  );
}
