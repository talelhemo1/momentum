"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { userActions, type SignupMethod } from "@/lib/user";
import { track } from "@/lib/analytics";
import { useAuthProviders } from "@/lib/auth-providers";
import { STORAGE_KEYS } from "@/lib/storage-keys";
// R141 — persist the chosen role (host/vendor) before any auth
// roundtrip so /auth/callback can route the user to the right
// post-signup destination. See lib/pendingRole.ts for the rationale.
import { setPendingRole } from "@/lib/pendingRole";
import { Phone, Mail, ArrowLeft, ArrowRight, Sparkles, ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";
// R140 — diagnostic panel shown when a user reports they didn't get
// the email confirmation / SMS code. Calls /api/auth/diagnose and
// surfaces actionable hints in Hebrew. Adds zero weight when not
// rendered (the import is tree-shaken into a small client chunk).
import { DeliveryDiagnosticPanel } from "@/components/signup/DeliveryDiagnosticPanel";

type Step = "choose" | "phone" | "email" | "email-confirmation" | "name";

/** Email step has two sub-modes. The user toggles between them. */
type EmailMode = "signup" | "login";

/**
 * R71 (R60) — top-level "mode" switch. Was implicit-only-on-the-email-
 * step in R47; promoted to a page-level toggle so existing users don't
 * land on a wall of "register" CTAs and bounce. URL `?mode=signin` opts
 * straight into the login view; `?mode=signup` (default) is the new
 * signup view.
 */
type AuthMode = "signup" | "signin";

/**
 * R139 — open-redirect guard for `?returnTo=`. We accept the value
 * only when it's an internal absolute path (starts with `/`, no
 * protocol, no protocol-relative `//`, no control chars). Anything
 * fishy returns null and the role-aware default kicks in.
 *
 * The risk: an attacker who lures a victim to
 *   /signup?returnTo=https://evil.com
 * would otherwise have us send the freshly-authenticated user
 * straight to evil.com (now with our auth state in hand). This
 * keeps every post-auth navigation inside our origin.
 */
function safeInternalPath(input: string | null): string | null {
  if (!input) return null;
  // Strip control chars (CR/LF/NUL etc.) that browsers sometimes ignore.
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!cleaned) return null;
  // Must start with a single `/` (absolute path) AND not start with `//`
  // (protocol-relative URL which would resolve to a foreign host).
  if (!cleaned.startsWith("/") || cleaned.startsWith("//")) return null;
  // Reject anything that looks like a URL scheme.
  if (/^\/?[a-z][a-z0-9+\-.]*:/i.test(cleaned)) return null;
  // Cap the length to keep the URL row sane.
  return cleaned.slice(0, 512);
}

/**
 * Next 16 requires components that read useSearchParams() to live inside a
 * Suspense boundary — otherwise the page bails out of static rendering and
 * the build complains. The actual UI lives in <SignupPageInner />.
 */
// R62 (R52) — renamed from `SignupPage` (default export) to a named
// export so the new server-component wrapper in `./page.tsx` can render
// the pre-paint redirect script + this client UI together.
export function SignupClient() {
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
  // R114 — role pre-selection. The signup page now asks "what kind of
  // user are you?" upfront — wedding hosts vs. event vendors land on
  // very different parts of the app. Read from URL (so deep-links
  // like /signup?role=vendor are honored) + state (so the segmented
  // control here can flip it on the fly).
  const initialRole: "host" | "vendor" =
    searchParams.get("role") === "vendor" ? "vendor" : "host";
  const [signupRole, setSignupRole] = useState<"host" | "vendor">(initialRole);

  // Explicit ?returnTo overrides everything (used by manager invites
  // and future deep links). The role-aware default is computed below
  // once authMode is known — see `returnTo`.
  //
  // R139 — sanitize the value against an open-redirect attack. An
  // attacker who lures a victim to /signup?returnTo=https://evil.com
  // would otherwise have us send the freshly-signed-in user straight
  // to evil.com after auth. Allow only internal absolute paths.
  // Anything else (external URL, protocol-relative `//evil.com`,
  // tab-stripping NUL bytes) gets dropped and we fall through to the
  // role-aware default below.
  const rawReturnTo = searchParams.get("returnTo");
  const explicitReturnTo = safeInternalPath(rawReturnTo);
  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<SignupMethod | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const cloudEnabled = userActions.cloudEnabled();
  const providers = useAuthProviders();
  // R47 — seed from ?error= (a failed OAuth/confirm redirect that bounced
  // back here) at first render, so the existing red banner shows it
  // instead of a blank page. Lazy init — no setState-in-effect.
  const [error, setError] = useState<string | null>(() => {
    const e = searchParams.get("error");
    return e ? decodeURIComponent(e) : null;
  });
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);
  // R18 §1B — when the user taps an auth button before ticking the
  // terms box, we flash the consent card (3×600ms) so the reason the
  // button "did nothing" is obvious instead of a quiet error line.
  const [consentPulse, setConsentPulse] = useState(false);

  // R71 (R60) — page-level authMode. Synced with `?mode=` so we don't
  // duplicate it in state on every render. The email sub-mode below
  // mirrors this on entry but stays independently switchable inside the
  // email step (so a user who started "signup" can flip to "login" once
  // they remember they have an account, without going back to /signup).
  const initialAuthMode: AuthMode =
    searchParams.get("mode") === "signin" ? "signin" : "signup";
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode);

  // R118 — role-aware post-auth routing.
  //   signup + host    → /start  (host onboarding)
  //   signup + vendor  → /vendors/join  (application form)
  //   signin + host    → /start  (existing host onboarding picks them up)
  //   signin + vendor  → /vendors/dashboard  (returning vendor lands on
  //                     their own dashboard; no need to fill the
  //                     application form again)
  // Explicit ?returnTo URL parameter wins over all of these so manager
  // invites + other deep links still work.
  const returnTo =
    explicitReturnTo ??
    (signupRole === "vendor"
      ? authMode === "signin"
        ? "/vendors/dashboard"
        : "/vendors/join"
      : "/start");

  /** Returns true if consent is given. Otherwise sets the error AND
   *  fires the attention pulse, and returns false so callers bail.
   *
   *  R77-1: signin mode never requires fresh consent — returning users
   *  already agreed when they signed up. Without this, the Google /
   *  Apple / phone-OTP / email-login buttons all silently failed on
   *  /signup?mode=signin because the consent box was hidden but the
   *  underlying gate still fired. */
  const requireConsent = (): boolean => {
    if (authMode === "signin") return true;
    if (consented) return true;
    setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך.");
    setConsentPulse(false);
    // Re-arm on the next frame so re-clicks restart the animation.
    window.requestAnimationFrame(() => setConsentPulse(true));
    window.setTimeout(() => setConsentPulse(false), 1850);
    return false;
  };

  // Email/password state — kept local to the SignupPage so the user can
  // switch back and forth between modes without losing what they typed.
  const [emailMode, setEmailMode] = useState<EmailMode>(
    initialAuthMode === "signin" ? "login" : "signup",
  );
  const [emailValue, setEmailValue] = useState("");
  const [password, setPassword] = useState("");
  const [emailName, setEmailName] = useState("");

  // R14 — bump on every breaking-change to /terms or /privacy. The persisted
  // record below stores BOTH timestamp AND version, so a future audit can tell
  // exactly which version of the terms a user agreed to.
  const TERMS_VERSION = "1.0";

  // Stamp the consent in localStorage so we have an auditable record. Called
  // at the moment a signup is actually attempted (not when the box is ticked),
  // because that's when the user becomes legally bound to the terms.
  const persistConsent = () => {
    try {
      // R12 §3S — centralized key. R14 — also write the version so we can
      // re-prompt users who agreed to an older version.
      const record = JSON.stringify({
        accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      });
      window.localStorage.setItem(STORAGE_KEYS.termsAcceptedAt, record);
    } catch {
      // localStorage might be disabled (private mode, quota); we still allow signup.
    }
  };

  const handleProvider = async (m: "google" | "apple") => {
    setError(null);
    if (!requireConsent()) return;
    persistConsent();
    // R141 — persist the chosen role BEFORE the OAuth redirect so
    // /auth/callback can read it back when Google/Apple bounce the
    // user home. Without this, vendor signups always landed in the
    // host onboarding flow because the React state was destroyed
    // by the redirect.
    if (authMode === "signup") setPendingRole(signupRole);
    track("signup_started", { method: m });
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
    if (!requireConsent()) return;
    if (!identifier.trim() || identifier.replace(/\D/g, "").length < 9) return;
    persistConsent();
    // R141 — phone OTP usually completes in-page (verifyOtp calls
    // router.push(returnTo) directly), so the localStorage role isn't
    // strictly needed for the happy path. But the user can close the
    // tab between sending and verifying — persisting now means the
    // role is still right when they return through /auth/callback
    // (rare, but real). Cheap insurance.
    if (authMode === "signup") setPendingRole(signupRole);
    track("signup_started", { method: "phone" });
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
    if (!requireConsent()) return;
    if (!cloudEnabled) {
      setError("Cloud Sync לא מוגדר — הרשמה דרך מייל דורשת Supabase.");
      return;
    }
    persistConsent();
    // R141 — for email signup the user clicks a confirmation link from
    // their inbox, which routes through /auth/confirm → /auth/callback.
    // The callback must know the user picked "vendor" to send them to
    // /vendors/join instead of /onboarding. Persist before signUp so the
    // role survives the multi-minute round-trip.
    if (authMode === "signup") setPendingRole(signupRole);
    track("signup_started", { method: "email", mode: emailMode });
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
      // R18 §M — always log the raw error for debugging…
      console.error("[momentum/signup]", e);
      // …then surface a mapped Hebrew message for the known cases, and a
      // single safe fallback for anything else. We no longer pass the
      // raw Supabase string to the user (it can be English / contain
      // internals); if it doesn't look like a proper Hebrew sentence we
      // show the generic support line instead.
      const msg = e instanceof Error ? e.message : "שגיאה לא צפויה";
      if (/invalid login credentials/i.test(msg)) {
        setError("מייל או סיסמה לא נכונים.");
      } else if (/already registered|already in use/i.test(msg)) {
        setError("כתובת המייל הזאת כבר רשומה. עבור להתחברות.");
      } else if (/email not confirmed/i.test(msg)) {
        setError("עדיין לא אישרת את המייל. בדוק את תיבת הדואר.");
      } else if (/^[֐-׿]/.test(msg.trim())) {
        // Starts with a Hebrew letter → already a user-facing message.
        setError(msg);
      } else {
        setError(
          "משהו השתבש. נסה שוב, או צור קשר ב-support@momentum.app",
        );
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
              {/* R71 (R60) — page-level signup/signin tab switcher. Sits
                  above everything so the user picks intent before reading
                  the rest of the card. Active tab pills get the gold
                  gradient; inactive stays muted. */}
              <AuthModeTabs
                mode={authMode}
                onChange={(m) => {
                  setAuthMode(m);
                  setEmailMode(m === "signin" ? "login" : "signup");
                  setError(null);
                }}
              />

              {/* R114 — role chooser (host vs. vendor). Only in signup
                  mode; returning users already have a role baked into
                  their profile. Two big cards instead of a tiny
                  segmented control because the choice is foundational
                  and we want the user to feel they're making a
                  meaningful decision. */}
              {authMode === "signup" && (
                <RoleChooser
                  role={signupRole}
                  onChange={(r) => {
                    setSignupRole(r);
                    setError(null);
                  }}
                />
              )}

              {/* Consent box — only required for fresh signups. Returning
                  users already agreed; rendering it on /signup?mode=signin
                  was needlessly hostile. */}
              {authMode === "signup" && (
                <label
                  className={`mb-5 flex items-start gap-3 text-xs cursor-pointer fade-up rounded-2xl p-3 ${consentPulse ? "consent-pulse" : ""}`}
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
                    אני מאשר/ת שקראתי, הבנתי והסכמתי ל
                    <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-[--accent] hover:underline">תנאי השימוש</Link>
                    <span className="ltr-num text-[--foreground-muted]"> (גרסה {TERMS_VERSION})</span>
                    {" "}ול
                    <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[--accent] hover:underline">מדיניות הפרטיות</Link>
                    , וכי אני בן/בת 18 ומעלה. ידוע לי ש-Momentum היא כלי עזר
                    לתכנון בלבד ואינה אחראית לאירוע עצמו, לספקים או לתוצאותיו.
                  </span>
                </label>
              )}
              <ChooseStep
                authMode={authMode}
                cloudEnabled={cloudEnabled}
                providers={providers}
                consented={authMode === "signin" ? true : consented}
                onProvider={handleProvider}
                onPhone={() => {
                  if (authMode === "signup" && !requireConsent()) return;
                  setError(null);
                  setStep("phone");
                }}
                onEmail={() => {
                  if (authMode === "signup" && !requireConsent()) return;
                  setError(null);
                  setEmailMode(authMode === "signin" ? "login" : "signup");
                  setStep("email");
                }}
              />

              {/* R71 (R60) — bottom helper text that flips between modes. */}
              <p
                className="text-center text-sm mt-6"
                style={{ color: "var(--foreground-soft)" }}
              >
                {authMode === "signup" ? "כבר יש לכם חשבון? " : "חדשים ב-Momentum? "}
                <button
                  type="button"
                  onClick={() => {
                    const next: AuthMode = authMode === "signup" ? "signin" : "signup";
                    setAuthMode(next);
                    setEmailMode(next === "signin" ? "login" : "signup");
                    setError(null);
                  }}
                  className="font-semibold underline hover:no-underline"
                  style={{ color: "var(--accent)" }}
                >
                  {authMode === "signup" ? "כניסה כאן" : "הרשמה כאן"}
                </button>
              </p>
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
              onResend={sendOtp}
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

/**
 * R71 (R60) — page-level mode tabs (signup vs. signin). A segmented
 * control just under the logo. Active tab pulls the gold gradient; the
 * other tab is muted with a thin border so the affordance is obvious.
 */
function AuthModeTabs({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (m: AuthMode) => void;
}) {
  return (
    <div
      className="mb-5 grid grid-cols-2 gap-1 p-1 rounded-2xl fade-up"
      role="tablist"
      aria-label="הרשמה או כניסה"
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
      }}
    >
      {(["signup", "signin"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="rounded-xl py-2.5 text-sm font-bold transition"
            style={{
              background: active
                ? "linear-gradient(135deg, var(--gold-300), var(--gold-500))"
                : "transparent",
              // R88 (R71) — gold-button-text flips automatically: dark
              // on a gold background in dark mode (#1A1208), light on
              // the deeper light-mode gold (#FFFFFF). Was hardcoded
              // dark, illegible on light-mode gold.
              color: active ? "var(--gold-button-text)" : "var(--foreground-soft)",
              boxShadow: active ? "0 4px 12px -4px var(--accent-glow)" : "none",
            }}
          >
            {m === "signup" ? "הירשם בחינם" : "כניסה לחשבון"}
          </button>
        );
      })}
    </div>
  );
}

/**
 * R114 — primary fork at signup: "I'm planning an event" vs "I'm an
 * event vendor". Two large gold-bordered cards instead of a tiny
 * segmented pair because the choice routes the user into completely
 * different parts of the app — wedding host onboarding vs. the
 * vendor application form — and we want them to feel the weight
 * before they pick.
 *
 * Visual: the active card lifts slightly with a gold gradient fill;
 * the inactive sits flat with a thin border. Each card has an icon,
 * a one-line headline, and a tiny "what you get" subtitle. Mobile
 * stays grid-cols-2 (no stacking) — keeping both options visible
 * side-by-side is the whole point.
 */
function RoleChooser({
  role,
  onChange,
}: {
  role: "host" | "vendor";
  onChange: (r: "host" | "vendor") => void;
}) {
  const options = [
    {
      id: "host" as const,
      emoji: "💛",
      title: "אני מתכנן/ת אירוע",
      subtitle: "חתונה · בר/בת מצווה · ברית · יום הולדת",
    },
    {
      id: "vendor" as const,
      emoji: "💼",
      title: "אני ספק/ית שירות",
      subtitle: "צלם · אולם · מוזיקה · עיצוב · יותר",
    },
  ];

  return (
    <div className="mb-5 fade-up">
      <div
        className="text-[11px] uppercase tracking-widest mb-2 px-1"
        style={{ color: "var(--foreground-muted)" }}
      >
        הצטרפות בתור
      </div>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="הצטרפות בתור">
        {options.map((opt) => {
          const active = role === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.id)}
              className="rounded-2xl p-3.5 text-start transition relative overflow-hidden"
              style={{
                background: active
                  ? "linear-gradient(150deg, rgba(244,222,169,0.18), rgba(168,136,74,0.06))"
                  : "var(--input-bg)",
                border: active
                  ? "1.5px solid var(--accent)"
                  : "1px solid var(--border)",
                boxShadow: active
                  ? "0 8px 20px -10px var(--accent-glow)"
                  : "none",
                transform: active ? "translateY(-1px)" : "none",
              }}
            >
              <div className="text-xl leading-none mb-1.5" aria-hidden>
                {opt.emoji}
              </div>
              <div
                className="text-sm font-bold leading-tight"
                style={{ color: active ? "var(--accent)" : "var(--foreground)" }}
              >
                {opt.title}
              </div>
              <div
                className="text-[11px] mt-1 leading-relaxed"
                style={{ color: "var(--foreground-muted)" }}
              >
                {opt.subtitle}
              </div>
              {active && (
                <span
                  aria-hidden
                  className="absolute top-2 end-2 w-4 h-4 rounded-full inline-flex items-center justify-center"
                  style={{
                    background: "var(--accent)",
                    color: "var(--gold-button-text, #1a1310)",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChooseStep({
  authMode,
  cloudEnabled,
  providers,
  consented,
  onProvider,
  onPhone,
  onEmail,
}: {
  authMode: AuthMode;
  cloudEnabled: boolean;
  providers: { google: boolean; apple: boolean; phone: boolean; loaded: boolean };
  consented: boolean;
  onProvider: (m: "google" | "apple") => void;
  onPhone: () => void;
  onEmail: () => void;
}) {
  const isSignin = authMode === "signin";
  // R18 §1B — visual "gated" state. We keep the buttons clickable (a
  // truly `disabled` button swallows the click and the consent pulse
  // would never fire), but dim them + show aria-disabled so it's clear
  // they're not actionable until the box is ticked.
  const gated = !consented;
  const gatedCls = gated ? "opacity-45" : "";
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
          {isSignin ? "ברוכים השבים" : "ברוכים הבאים"}
        </span>
        <h1 className="mt-5 text-h1 gradient-text">
          {isSignin ? "כניסה ל-Momentum" : "הצטרף ל-Momentum"}
        </h1>
        <p className="mt-3 text-white/60 leading-relaxed">
          {isSignin
            ? "המשיכו מאיפה שעצרתם — את כל הפרטים שמרנו לכם."
            : "התחל לתכנן את האירוע שלך — חינם, בדקה אחת."}
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
              aria-disabled={gated}
              className={`w-full btn-gold inline-flex items-center justify-center gap-2 ${gatedCls}`}
            >
              <Mail size={18} />
              {isSignin ? "כניסה עם מייל וסיסמה" : "המשך עם מייל וסיסמה"}
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
          aria-disabled={gated}
          className={`w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:bg-transparent ${gatedCls}`}
        >
          <GoogleIcon />
          <span className="font-semibold">
            {isSignin ? "כניסה עם Google" : "המשך עם Google"}
          </span>
          {!googleOn && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
              בקרוב
            </span>
          )}
        </button>
        <button
          onClick={() => onProvider("apple")}
          disabled={!appleOn}
          aria-disabled={gated}
          className={`w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:bg-transparent ${gatedCls}`}
        >
          <AppleIcon />
          <span className="font-semibold">
            {isSignin ? "כניסה עם Apple" : "המשך עם Apple"}
          </span>
          {!appleOn && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }}>
              בקרוב
            </span>
          )}
        </button>

        <button
          onClick={onPhone}
          disabled={!phoneOn}
          aria-disabled={gated}
          className={`w-full rounded-2xl border border-white/15 hover:border-white/25 hover:bg-white/[0.04] py-3.5 px-5 inline-flex items-center justify-center gap-3 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/15 disabled:hover:bg-transparent ${gatedCls}`}
        >
          <Phone size={18} />
          <span className="font-semibold">
            {isSignin ? "כניסה במספר טלפון" : "המשך עם מספר טלפון"}
          </span>
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
        <h1 className="mt-5 text-h2 gradient-text">
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
            /* R18 §O — explicit "מתחבר..." label, not just a bare spinner,
               so the user knows the click registered. */
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden />
              מתחבר...
            </>
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
  // R140 — toggle for the deliverability diagnostic. Off by default so
  // the happy path stays clean; the user opens it manually if no email
  // arrives. Hits /api/auth/diagnose which reads Supabase's public
  // /auth/v1/settings — no secrets touched.
  const [showDiagnostic, setShowDiagnostic] = useState(false);

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

      {/* R140 — opt-in deliverability diagnostic. Surfaces real
          config issues (mailer_autoconfirm:true, missing SMTP, missing
          NEXT_PUBLIC_SITE_URL, etc.) instead of leaving the user
          guessing why no mail arrived. */}
      {!showDiagnostic ? (
        <button
          type="button"
          onClick={() => setShowDiagnostic(true)}
          className="mt-3 text-xs underline decoration-dotted underline-offset-4"
          style={{ color: "var(--foreground-muted)" }}
        >
          המייל עדיין לא הגיע אחרי 2 דקות? בדוק הגדרות
        </button>
      ) : (
        <DeliveryDiagnosticPanel channel="email" />
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
  onResend,
  onBack,
}: {
  identifier: string;
  setIdentifier: (s: string) => void;
  otp: string;
  setOtp: (s: string) => void;
  otpSent: boolean;
  sendOtp: () => void;
  verifyOtp: () => void;
  onResend: () => void;
  onBack: () => void;
}) {
  // R18 §1A — resend + countdown, mirroring EmailConfirmationStep. The
  // cooldown starts the moment a code is first sent (otpSent → true) and
  // re-arms after every resend. 30s matches the SMS-gateway soft limit.
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [resending, setResending] = useState(false);
  // R140 — same opt-in diagnostic panel as EmailConfirmationStep. Off
  // by default; if no SMS arrives the user can open it for a config
  // checklist (most common cause: Twilio not connected at Supabase).
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  useEffect(() => {
    // Documented "sync to external trigger" pattern: the cooldown starts
    // exactly when the parent flips otpSent → true. Synchronous setState
    // here is intentional and one-shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (otpSent) setCooldownLeft(30);
  }, [otpSent]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = window.setInterval(() => {
      setCooldownLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownLeft]);

  const handleResend = () => {
    if (cooldownLeft > 0 || resending) return;
    setResending(true);
    onResend();
    // The parent re-runs sendOtp; otpSent stays true so the effect above
    // won't re-fire. Re-arm the cooldown here instead.
    setCooldownLeft(30);
    window.setTimeout(() => setResending(false), 1200);
  };

  const resendDisabled = cooldownLeft > 0 || resending;
  const resendLabel = resending
    ? "שולח..."
    : cooldownLeft > 0
      ? `לא הגיע? שלח שוב תוך ${cooldownLeft}s`
      : "שלח קוד שוב";

  return (
    <div className="card-gold p-7 md:p-8 fade-up">
      <div className="text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/15 to-[#A8884A]/5 border border-[var(--border-gold)] items-center justify-center text-[--accent]">
          <Phone size={22} />
        </div>
        <h1 className="mt-5 text-h2 gradient-text">
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

            {/* R18 §1A — resend control with live countdown. */}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendDisabled}
              className="w-full text-sm py-2.5 inline-flex items-center justify-center gap-2 transition disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ color: resendDisabled ? "var(--foreground-muted)" : "var(--accent)" }}
            >
              {resending && <Loader2 className="animate-spin" size={14} aria-hidden />}
              {resendLabel}
            </button>

            {/* R140 — opt-in deliverability diagnostic. Same component
                + endpoint as EmailConfirmationStep, but channel="phone"
                so the actionable hint targets the SMS path (Twilio
                missing / phone_autoconfirm:true / provider disabled). */}
            {!showDiagnostic ? (
              <button
                type="button"
                onClick={() => setShowDiagnostic(true)}
                className="w-full text-xs underline decoration-dotted underline-offset-4 py-1.5"
                style={{ color: "var(--foreground-muted)" }}
              >
                ה-SMS עדיין לא הגיע? בדוק הגדרות
              </button>
            ) : (
              <DeliveryDiagnosticPanel channel="phone" />
            )}
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
        <h1 className="mt-5 text-h2 gradient-text">
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
