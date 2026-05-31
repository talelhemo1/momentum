"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

/**
 * R126 — Client-side companion to the SSR redirect script in
 * `app/page.tsx`.
 *
 * The SSR script reads localStorage at first paint and bounces signed-in
 * visitors to `/dashboard`. That covers fresh navigations. It does NOT
 * cover:
 *
 *   • A user who signs in via OAuth on another route, then clicks back
 *     to `/` — the SSR script already executed in this tab, the SPA
 *     transition doesn't re-run it.
 *   • A user who opens the landing first, signs in via the
 *     /signup → OAuth round-trip, then auth/callback's router.replace()
 *     fails silently or is intercepted by an extension.
 *
 * This component sits at the top of `LandingPage()`, queries
 * `supabase.auth.getSession()` once on mount, and `router.replace()`s
 * to /vendors/dashboard (vendor) or /dashboard (host) if a session is
 * found. Side effect only — renders nothing.
 *
 * Owner-reported symptom this fixes:
 *   "מישהו מתחבר זה עדיין משאיר אותו בדף הנחיתה אבל פותח את התפריט" —
 *   the Header's logged-in state showed correctly after sign-in but no
 *   redirect happened. Without this guard, the only way out was a manual
 *   logo click.
 */
export function RedirectIfSignedIn() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // Backstop to the pre-paint inline script in app/page.tsx: if an OAuth /
    // email-verify redirect dropped its credentials on the landing root (the
    // Supabase Site-URL fallback) and the inline forward didn't fire for any
    // reason, hand the params to the real handler. Same origin, so the PKCE
    // code-verifier is intact. Full-page replace preserves the URL hash
    // (implicit-flow tokens live there).
    if (typeof window !== "undefined") {
      const s = window.location.search || "";
      const h = window.location.hash || "";
      if (
        /[?&](code|token_hash|error_description)=/.test(s) ||
        /[#&](access_token|error_description)=/.test(h)
      ) {
        window.location.replace("/auth/callback" + s + h);
        return;
      }
    }

    void (async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;

      // Quick vendor check — one indexed query — so vendors land on
      // /vendors/dashboard instead of /dashboard.
      let isVendor = false;
      try {
        const { data: vl } = (await supabase
          .from("vendor_landings")
          .select("id")
          .eq("owner_user_id", session.user.id)
          .maybeSingle()) as { data: { id: string } | null };
        isVendor = !!vl;
      } catch {
        /* Treat any error as "not a vendor" — they'll get bounced from
           /dashboard back to wherever they belong via that page's gate. */
      }
      if (cancelled) return;
      router.replace(isVendor ? "/vendors/dashboard" : "/dashboard");
    })();

    // Also listen for auth state changes WHILE on the landing page —
    // catches the case where the user opens /signup in a popup or
    // completes OAuth in another tab and BroadcastChannel pushes the
    // session to this tab.
    //
    // R143 — the listener used to unconditionally redirect to
    // /dashboard. For a vendor signing in via a popup that put a
    // /dashboard transition kicked off useVendorRedirect on the
    // host dashboard, which bounced them back here to /vendors/
    // dashboard — visible as a flash and (when network is slow) an
    // extra page load. Now we do the same one-query vendor check
    // here as on initial mount, so the redirect lands directly on
    // the right surface.
    const supabase = getSupabase();
    if (!supabase) return () => { cancelled = true; };
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (cancelled) return;
      if (event !== "SIGNED_IN" || !sess?.user) return;
      let isVendor = false;
      try {
        const { data: vl } = (await supabase
          .from("vendor_landings")
          .select("id")
          .eq("owner_user_id", sess.user.id)
          .maybeSingle()) as { data: { id: string } | null };
        isVendor = !!vl;
      } catch {
        /* Treat error as "not a vendor" — /dashboard's gate handles it. */
      }
      if (cancelled) return;
      router.replace(isVendor ? "/vendors/dashboard" : "/dashboard");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
