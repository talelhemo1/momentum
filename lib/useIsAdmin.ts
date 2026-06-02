"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { isFounderEmail } from "./constants";

/**
 * Returns `true` if the signed-in user's email appears in `admin_emails`.
 *
 * Cached in module-scope so navigating between pages doesn't re-hit the
 * DB — the answer is stable per session. A localStorage hint speeds up
 * the first render after refresh: if the user was admin a moment ago,
 * we render the admin badge immediately and only blank it out if the
 * fresh server check fails. The downside (someone removed from
 * admin_emails sees the badge for ~1s before it disappears) is
 * acceptable since the page itself re-checks server-side.
 */
const CACHE_KEY = "momentum.isAdmin.v1";
let cached: boolean | null = null;

export function useIsAdmin(): boolean {
  // Optimistic boot — read the localStorage hint before any setState so
  // the first render already has the right answer for returning admins.
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (cached !== null) return cached;
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(CACHE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        // R161 — getSession() (local-first, auto-refreshing) instead of
        // getUser() (network round-trip). A transient getUser() null was
        // hiding the "admin dashboard" link from the founder's menu even
        // when they were signed in.
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        const sessionEmail = session?.user?.email;
        if (!sessionEmail) {
          cached = false;
          setIsAdmin(false);
          try {
            window.localStorage.removeItem(CACHE_KEY);
          } catch {}
          return;
        }
        const email = sessionEmail.toLowerCase().trim();

        // R64 (R79) — founder bypass. Never re-issue the DB query if
        // we know the email is the founder; this works even if the
        // admin_emails table has been wiped / RLS misconfigured.
        if (isFounderEmail(email)) {
          cached = true;
          setIsAdmin(true);
          try {
            window.localStorage.setItem(CACHE_KEY, "1");
          } catch {}
          return;
        }

        const { data } = (await supabase
          .from("admin_emails")
          .select("email")
          .eq("email", email)
          .maybeSingle()) as { data: { email: string } | null };
        if (cancelled) return;
        const ok = !!data;
        cached = ok;
        setIsAdmin(ok);
        try {
          if (ok) window.localStorage.setItem(CACHE_KEY, "1");
          else window.localStorage.removeItem(CACHE_KEY);
        } catch {}
      } catch (e) {
        // Don't toast — admin badge missing is a soft failure.
        console.error("[useIsAdmin]", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return isAdmin;
}
