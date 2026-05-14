"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabase, SUPABASE_ENABLED } from "@/lib/supabase";
import { syncOnLogin } from "@/lib/sync";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}

function CallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    // R12 §3R — hard timeout. If supabase-js takes longer than 12s to
    // resolve a session (network blip, mis-routed callback URL), bail
    // with a friendly message instead of leaving the user on a spinner.
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setErrorMessage(
        "האימות לוקח יותר מהרגיל. נסה לרענן או להתחבר שוב.",
      );
      setStatus("error");
    }, 12000);

    const finish = async () => {
      // 1. If cloud sync isn't even configured, this page shouldn't be hit. Bounce home.
      if (!SUPABASE_ENABLED) {
        router.replace("/signup");
        return;
      }

      // 2. Map common provider/verify failure codes to friendlier Hebrew.
      //    `/auth/confirm` may redirect here with ?error=… when a token
      //    verification fails (expired, already used, missing params).
      const urlError = search.get("error_description") || search.get("error");
      if (urlError) {
        if (cancelled) return;
        const decoded = decodeURIComponent(urlError);
        let friendly = decoded;
        if (decoded === "missing_params") {
          friendly = "קישור האימות לא תקין. בקש מייל אימות חדש.";
        } else if (decoded === "supabase_not_configured") {
          friendly = "השירות לא מוגדר. פנה למארחי האפליקציה.";
        } else if (/expired/i.test(decoded)) {
          friendly = "קישור האימות פג תוקף. בקש מייל חדש.";
        } else if (/already.*confirmed|already.*used|invalid token/i.test(decoded)) {
          friendly = "הקישור כבר נוצל. נסה להתחבר ישירות.";
        }
        setErrorMessage(friendly);
        setStatus("error");
        return;
      }

      // 3. Confirm we now have a session. supabase-js auto-detects the auth code in the URL
      //    (because `detectSessionInUrl: true` in createClient).
      const supabase = getSupabase();
      if (!supabase) {
        if (cancelled) return;
        setErrorMessage("ההתחברות נכשלה — נסה שוב.");
        setStatus("error");
        return;
      }

      // 3a. Explicit handlers for the two PKCE-style returns. These are
      //     belt-and-suspenders alongside `detectSessionInUrl: true` —
      //     supabase-js sometimes loses the race when the page hydrates
      //     before the auto-exchange completes.
      const code = search.get("code");
      const tokenHash = search.get("token_hash");
      const otpType = search.get("type");
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeErr) {
          // R12 §1F — Supabase auth errors can include token fragments
          // or "User from sub claim..." style internals. Show a static
          // Hebrew message; full error stays in console for devs.
          console.error("[auth/callback] exchangeCodeForSession", exchangeErr);
          setErrorMessage("לא הצלחנו לאמת את ההתחברות. נסה להתחבר שוב.");
          setStatus("error");
          return;
        }
      } else if (tokenHash && otpType) {
        // Email link landed here directly instead of via /auth/confirm.
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as EmailOtpType,
        });
        if (cancelled) return;
        if (otpErr) {
          console.error("[auth/callback] verifyOtp", otpErr);
          setErrorMessage("קישור האימות לא תקין או שפג תוקף. בקש מייל חדש.");
          setStatus("error");
          return;
        }
      }

      // Wait briefly for supabase-js to finalize the session from the URL hash.
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error || !session) {
        if (error) console.error("[auth/callback] getSession", error);
        setErrorMessage(
          "לא נמצא session פעיל. ייתכן שהקישור פג תוקף — נסה להתחבר שוב.",
        );
        setStatus("error");
        return;
      }

      // 4. Pull cloud state into localStorage so the rest of the app feels instant.
      await syncOnLogin();
      if (cancelled) return;

      setStatus("ok");
      // R14 §J — three-way routing. Check vendor status first; a vendor
      // logging in should land on /vendors/dashboard, not the couples
      // onboarding gate. The vendor lookup is one fast indexed query.
      let isVendor = false;
      try {
        const { data: vl } = (await supabase
          .from("vendor_landings")
          .select("id")
          .eq("owner_user_id", session.user.id)
          .maybeSingle()) as { data: { id: string } | null };
        if (cancelled) return;
        isVendor = !!vl;
      } catch (e) {
        console.error("[auth/callback] vendor lookup", e);
      }

      if (isVendor) {
        router.replace("/vendors/dashboard");
        return;
      }

      // Couple side. Parse the AppState properly — substring matching
      // could false-match a guest name like '"event":{...}'.
      let hasEvent = false;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.app);
        const parsed = raw ? (JSON.parse(raw) as { event?: { id?: string } | null }) : null;
        hasEvent = !!parsed?.event?.id;
      } catch {
        hasEvent = false;
      }
      // Pass `?gate=ok` to bypass the /onboarding pricing-gate redirect.
      // The user just authenticated — bouncing them through /start now would
      // ping-pong with /onboarding's gate (returning users have no event yet
      // either, so /onboarding pushes them to /start, /start pushes them
      // back, etc.). Cloud-sync users see pricing on /start the moment they
      // open the app from the dashboard later.
      router.replace(hasEvent ? "/dashboard" : "/onboarding?gate=ok");
    };

    void finish().finally(() => {
      // Either path completed before the timeout — cancel it so it
      // doesn't fire and overwrite our state retroactively.
      window.clearTimeout(timeoutId);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [router, search]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 relative overflow-hidden">
      <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30" />

      <div className="relative z-10 max-w-sm w-full">
        <div className="flex justify-center mb-7">
          <Logo size={28} />
        </div>

        <div className="card-gold p-8 text-center">
          {status === "loading" && (
            <>
              <div className="inline-flex w-14 h-14 rounded-2xl items-center justify-center" style={{ background: "var(--surface-2)", border: "1px solid var(--border-gold)", color: "var(--accent)" }}>
                <Loader2 size={24} className="animate-spin" />
              </div>
              <h1 className="mt-5 text-xl font-bold gradient-text">מאמת התחברות...</h1>
              <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
                עוד רגע ואתה בפנים.
              </p>
            </>
          )}

          {status === "ok" && (
            <>
              <div className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-emerald-300" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)" }}>
                <CheckCircle2 size={24} />
              </div>
              <h1 className="mt-5 text-xl font-bold">התחברת בהצלחה!</h1>
              <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>מעביר אותך הלאה...</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-red-300" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                <AlertCircle size={24} />
              </div>
              <h1 className="mt-5 text-xl font-bold">ההתחברות נכשלה</h1>
              <p className="mt-3 text-sm break-words" style={{ color: "var(--foreground-soft)" }}>
                {errorMessage}
              </p>
              <Link href="/signup" className="btn-gold mt-6 inline-flex items-center gap-2">
                חזרה לעמוד ההתחברות
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
