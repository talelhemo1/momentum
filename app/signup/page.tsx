"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { userActions, type SignupMethod } from "@/lib/user";
import { useAuthProviders } from "@/lib/auth-providers";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { Phone, Mail, ArrowLeft, ArrowRight, Sparkles, ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";

type Step = "choose" | "phone" | "email" | "email-confirmation" | "name";

/** Email step has two sub-modes. The user toggles between them. */
type EmailMode = "signup" | "login";

/**
 * Next 16 requires components that read useSearchParams() to live inside a
 * Suspense boundary — otherwise the page bails out of static rendering and
 * the build complains. The actual UI lives in <SignupPageInner />.
 */
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
        </main>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // returnTo lets manager-invite (and any future deep-link) bring the user
  // back to where they were *before* signup interrupted them. Defaults to
  // /start for fresh signups.
  const returnTo = searchParams.get("returnTo") || "/start";
  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<SignupMethod | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const cloudEnabled = userActions.cloudEnabled();
  const providers = useAuthProviders();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);

  // Email/password state — kept local to the SignupPage so the user can
  // switch back and forth between modes without losing what they typed.
  const [emailMode, setEmailMode] = useState<EmailMode>("signup");
  const [emailValue, setEmailValue] = useState("");
  const [password, setPassword] = useState("");
  const [emailName, setEmailName] = useState("");

  // Stamp the consent in localStorage so we have an auditable record. Called
  // at the moment a signup is actually attempted (not when the box is ticked),
  // because that's when the user becomes legally bound to the terms.
  const persistConsent = () => {
    try {
      // R12 §3S — centralized key.
      window.localStorage.setItem(STORAGE_KEYS.termsAcceptedAt, new Date().toISOString());
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
      } catch (e) {
        // Supabase returns "Unsupported provider" or similar when Google/Apple
        // aren't enabled in the project's Auth settings. Surface that as a
        // direct hint instead of the generic "התחברות נכשלה" — otherwise the
        // user has no idea why nothing happened and assumes the app is broken.
        const msg = e instanceof Error ? e.message : "";
        if (/unsupported provider|provider is not enabled|validation_failed/i.test(msg)) {
          setError(
            m === "google"
              ? "התחברות עם Google עדיין לא מופעלת. השתמש במייל וסיסמה."
              : "התחברות עם Apple עדיין לא מופעלת. השתמש במייל וסיסמה.",
          );
        } else {
          setError("ההתחברות נכשלה. נסה שוב.");
        }
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
      } catch (e) {
        // Supabase phone provider needs an SMS provider (Twilio etc.) wired up.
        // When it's not, the API returns "Phone signups are disabled" or
        // "validation_failed". Show a clear message instead of the generic one.
        const msg = e instanceof Error ? e.message : "";
        if (/phone (signups|provider) (are )?disabled|provider is not enabled|validation_failed/i.test(msg)) {
          setError("התחברות בטלפון עדיין לא מופעלת. השתמש במייל וסיסמה.");
        } else {
          setError("שליחת קוד נכשלה. בדוק את המספר ונסה שוב.");
        }
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
        router.push(returnTo);
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
    router.push(returnTo);
  };

  const submitEmail = async () => {
    setError(null);
    if (!consented) {
      setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
      return;
    }
    if (!cloudEnabled) {
      setError("Cloud Sync לא מוגדר — הרשמה דרך מייל דורשת Supabase.");
      return;
    }
    persistConsent();
    setBusy(true);
    try {
      if (emailMode === "signup") {
        if (!emailName.trim()) {
          setError("שם הוא שדה חובה.");
          setBusy(false);
          return;
        }
        const result = await userActions.signUpWithEmail(emailValue, password, emailName);
        // mailer_autoconfirm=false (default) → Supabase sends a confirmation
        // email and the session is null until the user clicks the link.
        if (result.confirmationRequired) {
          setStep("email-confirmation");
        } else {
          // Auto-confirmed — finalize the local profile and forward.
          userActions.signup({
            name: emailName.trim(),
            identifier: emailValue.trim().toLowerCase(),
            method: "email",
          });
          router.push(returnTo);
        }
      } else {
        await userActions.signInWithEmail(emailValue, password);
        // onAuthStateChange will hydrate the localStorage profile from the
        // Supabase user metadata. Forward to returnTo (or /start) so the
        // next render lands on the right destination — usually the journey,
        // sometimes a deep-linked manager-invite page.
        router.push(returnTo);
      }
    } catch (e) {
      // Common Supabase errors come back with a localized-friendly message
      // already, but we map a couple of well-known ones to clearer Hebrew.
      const msg = e instanceof Error ? e.message : "שגיאה לא צפויה";
      if (/invalid login credentials/i.test(msg)) {
        setError("מייל או סיסמה לא נכונים.");
      } else if (/already registered|already in use/i.test(msg)) {
        setError("כתובת המייל הזאת כבר רשומה. עבור להתחברות.");
      } else if (/email not confirmed/i.test(msg)) {
        setError("עדיין לא אישרת את המייל. בדוק את תיבת הדואר.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
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
            <>
              {/* Consent box renders ABOVE the provider buttons so the user
                  sees it before the buttons. Previously it sat below the card,
                  so the disabled buttons looked broken to anyone who hadn't
                  scrolled down to discover the checkbox. */}
              <label
                className="mb-5 flex items-start gap-3 text-xs cursor-pointer fade-up rounded-2xl p-3"
                style={{
                  background: consented ? "rgba(212,176,104,0.08)" : "var(--input-bg)",
                  border: `1px solid ${consented ? "var(--border-gold)" : "var(--border)"}`,
                  transition: "background 150ms, border-color 150ms",
                } as CSSProperties}
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
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-[--accent] hover:underline">תנאי השימוש</Link>
                  {" "}ול
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[--accent] hover:underline">מדיניות הפרטיות</Link>
                  .
                </span>
              </label>
              <ChooseStep
                cloudEnabled={cloudEnabled}
                providers={providers}
                onProvider={handleProvider}
                onPhone={() => {
                  if (!consented) {
                    setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
                    return;
                  }
                  setError(null);
                  setStep("phone");
                }}
                onEmail={() => {
                  if (!consented) {
                    setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
                    return;
                  }
                  setError(null);
                  setEmailMode("signup");
                  setStep("email");
                }}
              />
            </>
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

          {step === "email" && (
            <EmailStep
              mode={emailMode}
              setMode={setEmailMode}
              email={emailValue}
              setEmail={setEmailValue}
              password={password}
              setPassword={setPassword}
              name={emailName}
              setName={setEmailName}
              busy={busy}
              onSubmit={submitEmail}
              onBack={() => setStep("choose")}
            />
          )}

          {step === "email-confirmation" && (
            <EmailConfirmationStep
              email={emailValue}
              onBack={() => setStep("email")}
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

        </div>
      </div>
    </main>
  );
}

function ChooseStep({
  cloudEnabled,
  providers,
  onProvider,
  onPhone,
  onEmail,
}: {
  cloudEnabled: boolean;
  providers: { google: boolean; apple: boolean; phone: boolean; loaded: boolean };
  onProvider: (m: "google" | "apple") => void;
  onPhone: () => void;
  onEmail: () => void;
}) {
  // In local mode (no Supabase configured) every button hits the local
  // fallback path — they all "work" by stamping a UUID into localStorage.
  // The provider probe is irrelevant; force-enable everything.
  // In cloud mode we gate by the probe results: until it loads we stay
  // optimistic, so users on a fast email path don't see a flash of disabled.
  // R12 §3N — default-on for unknown provider states. The probe sometimes
  // reports `false` for providers that ARE configured (transient network
  // hiccup, Supabase rate limit). We only disable a button if the probe
  // EXPLICITLY says it's off (false), not if it returns undefined/null.
  const ready = providers.loaded;
  const googleOn = !cloudEnabled || !ready || providers.google !== false;
  const appleOn = !cloudEnabled || !ready || providers.apple !== false;
  const phoneOn = !cloudEnabled || !ready || providers.phone !== false;
  // Email + password has no local fallback (lib/user.ts hard-requires
  // Supabase). Hide the button in local mode rather than show something
  // that would error on click.
  const showEmail = cloudEnabled;
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
        {/* Email + password — primary CTA when cloud is configured. In local
            mode it's hidden (no fallback). Google/Apple/Phone all have local
            fallbacks via lib/user.ts and remain visible regardless. */}
        {showEmail && (
          <>
            <button
              onClick={onEmail}
              className="w-full btn-gold inline-flex items-center justify-center gap-2"
            >
              <Mail size={18} />
              המשך עם מייל וסיסמה
            </button>

            <div className="flex items-center gap-3 my-2 text-xs text-white/35">
              <div className="flex-1 h-px bg-white/10" />
              <span>או</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          </>
        )}

        <button
          onClick={() => onProvider("google")}
          disabled={!googleOn}
          className="w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:bg-transparent"
        >
          <GoogleIcon />
          <span className="font-semibold">המשך עם Google</span>
          {!googleOn && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
              בקרוב
            </span>
          )}
        </button>
        <button
          onClick={() => onProvider("apple")}
          disabled={!appleOn}
          className="w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:bg-transparent"
        >
          <AppleIcon />
          <span className="font-semibold">המשך עם Apple</span>
          {!appleOn && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
              בקרוב
            </span>
          )}
        </button>

        <button
          onClick={onPhone}
          disabled={!phoneOn}
          className="w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:bg-transparent"
        >
          <Phone size={18} />
          <span className="font-semibold">המשך עם מספר טלפון</span>
          {!phoneOn && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
              בקרוב
            </span>
          )}
        </button>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/45">
        <ShieldCheck size={12} className="text-[--accent]" />
        ההרשמה מאובטחת ומוצפנת
      </div>
    </div>
  );
}

function EmailStep({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  name,
  setName,
  busy,
  onSubmit,
  onBack,
}: {
  mode: EmailMode;
  setMode: (m: EmailMode) => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  name: string;
  setName: (s: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const isSignup = mode === "signup";
  const canSubmit =
    !busy &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    (!isSignup || name.trim().length > 0);

  return (
    <div className="card-gold p-7 md:p-8 fade-up">
      <div className="text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/15 to-[#A8884A]/5 border border-[var(--border-gold)] items-center justify-center text-[--accent]">
          <Mail size={22} />
        </div>
        <h1 className="mt-5 text-2xl md:text-3xl font-bold tracking-tight gradient-text">
          {isSignup ? "הרשמה במייל" : "התחברות במייל"}
        </h1>
        <p className="mt-3 text-white/60 text-sm">
          {isSignup
            ? "ניצור לך חשבון ונשלח לינק אישור למייל."
            : "ברוך השב — הזן את הפרטים שלך."}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="mt-6 grid grid-cols-2 gap-1 p-1 rounded-2xl" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className="rounded-xl py-2 text-sm font-semibold transition"
          style={{
            background: isSignup ? "var(--accent)" : "transparent",
            color: isSignup ? "#000" : "var(--foreground-soft)",
          }}
        >
          חשבון חדש
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className="rounded-xl py-2 text-sm font-semibold transition"
          style={{
            background: !isSignup ? "var(--accent)" : "transparent",
            color: !isSignup ? "#000" : "var(--foreground-soft)",
          }}
        >
          כבר יש לי
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit();
        }}
        className="mt-5 space-y-3"
      >
        {isSignup && (
          <div>
            <label className="block text-sm text-white/70 mb-2">השם שלך</label>
            <input
              type="text"
              autoComplete="name"
              placeholder="שם פרטי ושם משפחה"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
        )}
        <div>
          <label className="block text-sm text-white/70 mb-2">מייל</label>
          <input
            dir="ltr"
            type="email"
            autoComplete={isSignup ? "email" : "username"}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input text-start"
          />
        </div>
        <div>
          <label className="block text-sm text-white/70 mb-2">
            סיסמה {isSignup && <span className="text-xs text-white/40">(לפחות 8 תווים)</span>}
          </label>
          <input
            dir="ltr"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input text-start"
            minLength={8}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full btn-gold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {/* R12 §4Z — inline spinner inside the button itself instead of a
              separate "טוען..." row below. Stops the page from jumping when
              the submit fires; matches the pattern in /manage/accept. */}
          {busy ? (
            <Loader2 className="animate-spin" size={16} aria-hidden />
          ) : (
            <>
              {isSignup ? "הירשם" : "התחבר"}
              <ArrowLeft size={16} />
            </>
          )}
        </button>

        <button type="button" onClick={onBack} className="w-full btn-secondary text-sm py-2.5">
          חזרה
        </button>
      </form>
    </div>
  );
}

function EmailConfirmationStep({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  // R12 §4Y — Resend confirmation. Stateful so the button reflects sent /
  // sending / cooldown. Supabase enforces a 60s cooldown between resends
  // server-side; we mirror that locally so the user gets visual feedback
  // instead of error toasts during the cooldown.
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const handleResend = async () => {
    if (resendState === "sending" || cooldownLeft > 0) return;
    setResendState("sending");
    setResendError(null);
    try {
      const { getSupabase } = await import("@/lib/supabase");
      const supabase = getSupabase();
      if (!supabase) {
        setResendState("error");
        setResendError("השירות לא מוגדר. נסה שוב מאוחר יותר.");
        return;
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) {
        console.error("[signup] resend failed", error);
        setResendState("error");
        // Friendly Hebrew messages for the two common failures.
        if (/rate|wait|seconds/i.test(error.message)) {
          setResendError("נסה שוב בעוד דקה. ל-Supabase יש cooldown של 60 שניות.");
          setCooldownLeft(60);
        } else if (/already.*confirmed/i.test(error.message)) {
          setResendError("המייל הזה כבר אומת. אפשר להתחבר ישירות.");
        } else {
          setResendError("שליחה נכשלה. נסה שוב.");
        }
        return;
      }
      setResendState("sent");
      setCooldownLeft(60);
    } catch (e) {
      console.error("[signup] resend exception", e);
      setResendState("error");
      setResendError("שליחה נכשלה. בדוק חיבור לאינטרנט.");
    }
  };

  // Single interval for the cooldown countdown.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = window.setInterval(() => {
      setCooldownLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownLeft]);

  const resendDisabled = resendState === "sending" || cooldownLeft > 0;
  const resendLabel =
    resendState === "sending"
      ? "שולח..."
      : cooldownLeft > 0
        ? `נסה שוב בעוד ${cooldownLeft} שניות`
        : resendState === "sent"
          ? "מייל נשלח שוב ✓"
          : "שלח שוב";

  return (
    <div className="card-gold p-7 md:p-8 fade-up text-center">
      <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/15 to-[#A8884A]/5 border border-[var(--border-gold)] items-center justify-center text-[--accent]">
        <CheckCircle2 size={22} />
      </div>
      <h1 className="mt-5 text-2xl md:text-3xl font-bold tracking-tight gradient-text">
        בדוק את המייל שלך
      </h1>
      <p className="mt-3 text-white/65 text-sm leading-relaxed">
        שלחנו לינק אישור ל-<span className="text-[--accent] ltr-num">{email}</span>.
        <br />
        לחץ על הלינק במייל כדי להפעיל את החשבון. אחרי האישור הדפדפן יחזיר אותך
        לכאן ותוכל להמשיך.
      </p>

      <div className="mt-7 rounded-2xl p-3 text-xs leading-relaxed text-start" style={{ background: "var(--input-bg)", border: "1px dashed var(--border)" }}>
        <strong style={{ color: "var(--foreground-soft)" }}>לא הגיע מייל?</strong>
        <ul className="mt-1.5 list-disc list-inside" style={{ color: "var(--foreground-muted)" }}>
          <li>בדוק את תיקיית הספאם / קידום מכירות.</li>
          <li>ייתכן שהמייל מתעכב 1-2 דקות.</li>
          <li>אם עדיין כלום — לחץ &quot;שלח שוב&quot; למטה.</li>
        </ul>
      </div>

      {/* R12 §4Y — resend button uses Supabase's auth.resend({ type:"signup" }).
          R12 §4Z — inline spinner inside the button (was a separate row). */}
      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={resendDisabled}
        className="mt-5 btn-gold py-2.5 px-6 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {resendState === "sending" && <Loader2 className="animate-spin" size={14} aria-hidden />}
        {resendLabel}
      </button>

      {resendError && (
        <div className="mt-3 text-xs text-red-300">{resendError}</div>
      )}

      <button onClick={onBack} className="mt-3 btn-secondary text-sm py-2.5 px-6">
        חזרה
      </button>
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
