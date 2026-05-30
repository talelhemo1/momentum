"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabase, SUPABASE_ENABLED } from "@/lib/supabase";
import { logError } from "@/lib/error-tracker";
import { track } from "@/lib/analytics";
import { syncOnLogin } from "@/lib/sync";
import { readEventId, applyCloudPayload } from "@/lib/store";
import type { AppState } from "@/lib/types";
// R141 — read the pre-auth role choice so new vendors land in
// /vendors/join (application form) instead of /onboarding (host flow).
// Without this, every vendor signed up via OAuth or email-confirmation
// was bucketed into the host journey because no vendor_landings row
// existed yet at the moment of callback.
import { getPendingRole, clearPendingRole } from "@/lib/pendingRole";
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
      // R47 — structured client log for the domain-migration debug.
      // Visible in the browser console (DevTools) so a user can screenshot
      // it. Only presence of code/token is logged — they are credentials.
      console.log("[auth/callback]", {
        host: window.location.host,
        origin: window.location.origin,
        code_present: !!search.get("code"),
        token_hash_present: !!search.get("token_hash"),
        type: search.get("type"),
        error: search.get("error"),
        error_description: search.get("error_description"),
      });

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
        // IDEMPOTENT exchange. An auth code is single-use, but it can get
        // hit twice: `detectSessionInUrl` may auto-exchange it, and React
        // StrictMode re-runs this effect in dev. Without this guard the
        // SECOND attempt fails with "code already used" and we'd show an
        // error — even though the FIRST attempt already logged the user in.
        // So: if a session already exists, skip; and if the exchange errors
        // but a session DID land, treat it as success.
        const { data: pre } = await supabase.auth.getSession();
        if (!pre.session) {
          const { error: exchangeErr } =
            await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (exchangeErr) {
            const { data: post } = await supabase.auth.getSession();
            if (!post.session) {
              // R12 §1F — Supabase auth errors can include token fragments
              // or "User from sub claim..." style internals. Show a static
              // Hebrew message; full error stays in console for devs.
              console.error("[auth/callback] exchangeCodeForSession", exchangeErr);
              void logError({
                type: "auth",
                message: `exchangeCodeForSession: ${exchangeErr.message}`,
                url: window.location.origin + "/auth/callback",
              });
              setErrorMessage("לא הצלחנו לאמת את ההתחברות. נסה להתחבר שוב.");
              setStatus("error");
              return;
            }
            // A parallel run consumed the code but the session landed —
            // fall through as success.
            console.warn(
              "[auth/callback] code already consumed but session present — continuing",
            );
          }
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
        void logError({
          type: "auth",
          message: `getSession: ${error ? error.message : "no active session"}`,
          url: window.location.origin + "/auth/callback",
        });
        setErrorMessage(
          "לא נמצא session פעיל. ייתכן שהקישור פג תוקף — נסה להתחבר שוב.",
        );
        setStatus("error");
        return;
      }

      // 4. Pull cloud state into localStorage so the rest of the app feels instant.
      await syncOnLogin();
      if (cancelled) return;

      // R63 (R53) — funnel: signup/login completion. Method comes from
      // app_metadata.provider (set by Supabase: "google"/"apple"/"phone"/
      // "email"); fall back to "unknown" so the event still fires.
      const provider =
        (session.user.app_metadata?.provider as string | undefined) ??
        "unknown";
      track("signup_completed", { method: provider });

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

      // R141 — new vendor signups don't have a vendor_landings row YET
      // (they create one on /vendors/join). Read the role they picked
      // on /signup before the auth roundtrip. If they chose "vendor"
      // but no landing exists, route to /vendors/join. Clear the
      // pending role immediately either way so a later host signup on
      // the same browser doesn't inherit it.
      const pendingRole = getPendingRole();
      clearPendingRole();

      if (isVendor) {
        router.replace("/vendors/dashboard");
        return;
      }

      // No vendor_landings row but user explicitly chose vendor on
      // /signup → send them to the application form. This is THE fix
      // for "I signed up as a vendor but landed in the host flow".
      if (pendingRole === "vendor") {
        track("signup_completed", { method: provider, role: "vendor" });
        router.replace("/vendors/join");
        return;
      }

      // Couple / host side. Three-tier check for an existing event:
      //   1. Read localStorage after syncOnLogin's write. Fast path.
      //   2. R122 — if that's empty (most common when a returning user
      //      signs in on a fresh device and syncOnLogin's pullFromCloud
      //      hit a transient hiccup), do a DIRECT app_states query as a
      //      backstop. This is what fixes the reported bug: existing
      //      users with cloud data getting bounced through onboarding
      //      because the cached read happened a tick too early.
      //   3. Still nothing → genuine new user, send to onboarding.
      let hasEvent = !!readEventId();
      if (!hasEvent) {
        try {
          const { data: row } = (await supabase
            .from("app_states")
            .select("payload")
            .eq("user_id", session.user.id)
            .maybeSingle()) as { data: { payload: AppState | null } | null };
          if (cancelled) return;
          const cloudEventId = row?.payload?.event?.id ?? null;
          if (cloudEventId && row?.payload) {
            // Cloud has it — hydrate localStorage + the store cache so
            // /dashboard's own check sees a populated state on first
            // render and doesn't re-bounce here.
            applyCloudPayload(row.payload);
            hasEvent = true;
            console.log(
              `[auth/callback] backstop recovered event ${cloudEventId} for user ${session.user.id}`,
            );
          }
        } catch (e) {
          // Network blip / RLS edge — fall through to onboarding path.
          // Worst case the user re-confirms event basics; we never lose
          // data because syncOnLogin already won't overwrite a non-empty
          // local with empty cloud (see lib/sync.ts SYNC_CONFLICT_GRACE_MS).
          console.error("[auth/callback] backstop app_states query failed:", e);
        }
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
