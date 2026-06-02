"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { isFounderEmail } from "@/lib/constants";

/**
 * R59 (R49) — client admin gate.
 *
 * NOTE: this is UX, not the security boundary. The real enforcement is
 * server-side in every /api/admin/* route (requireAdmin → admin_emails
 * under RLS → service role). We can't gate in middleware / a server
 * component because this app keeps the Supabase session in localStorage,
 * not cookies — so SSR has no session to read. Same reason the existing
 * /admin/dashboard is client-gated.
 *
 * Non-admins are redirected to /dashboard with NO hint that an admin
 * area exists; signed-out users go to /signup?returnTo=.
 */

const AdminTokenContext = createContext<string | null>(null);

/** Access token for calling /api/admin/* — only valid inside AdminGuard. */
export function useAdminToken(): string {
  const t = useContext(AdminTokenContext);
  if (!t) throw new Error("useAdminToken must be used within <AdminGuard>");
  return t;
}

type Phase = "loading" | "ok";

export function AdminGuard({
  children,
  returnTo = "/admin",
}: {
  children: ReactNode;
  returnTo?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Hard timeout so a stuck getUser() can't spin forever.
    const timeout = window.setTimeout(() => {
      if (!cancelled) router.replace("/dashboard");
    }, 10000);

    void (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) {
          router.replace("/dashboard");
          return;
        }
        // R161 — use getSession() (local-first, auto-refreshes the token)
        // as the gate instead of getUser() (a network round-trip that
        // returns null whenever the token needs a refresh or the network
        // hiccups — which bounced the founder to /signup, i.e. "can't get
        // into admin"). getSession() hands back BOTH the email and the
        // access token in one local call. This gate is UX only; the real
        // security boundary is the server-side requireAdmin in every
        // /api/admin/* route, which still verifies the JWT via getUser.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        const email = session?.user?.email?.toLowerCase().trim();
        if (!email || !session?.access_token) {
          router.replace(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }

        // R131 — FOUNDER-ONLY (owner request). admin_emails fallback
        // was removed in lockstep with lib/admin/server.ts so the
        // API + UI gates agree. To re-enable multi-admin, restore the
        // admin_emails query and broaden isFounderEmail. Until then,
        // any non-founder is silently bounced back to /dashboard.
        if (!isFounderEmail(email)) {
          console.warn("[admin-guard] non-founder attempted access");
          router.replace("/dashboard");
          return;
        }
        setToken(session.access_token);
        setPhase("ok");
      } catch {
        if (!cancelled) router.replace("/dashboard");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [router, returnTo]);

  if (phase === "loading" || !token) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2
          className="animate-spin"
          size={30}
          style={{ color: "var(--accent)" }}
          aria-label="טוען"
        />
      </main>
    );
  }

  return (
    <AdminTokenContext.Provider value={token}>
      {children}
    </AdminTokenContext.Provider>
  );
}
