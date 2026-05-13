"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Check, X, Loader2, AlertCircle, ArrowRight } from "lucide-react";

/**
 * R20 — Momentum Live self-diagnose.
 *
 * Reachable at /manage/diagnose. Runs every check the manager flow depends
 * on (Supabase client, auth, table presence, both RPCs, realtime, env URL)
 * and surfaces a copy-pasteable fix recipe for any failure.
 *
 * Why this exists: when something silently breaks (RLS rejects a query,
 * a migration was never applied, env vars missing on the deployed tunnel),
 * the user sees a friendly toast and no clue what to do. This page closes
 * that gap — it's the first link in every error message.
 */

type CheckStatus = "loading" | "ok" | "fail";

interface DiagnosticCheck {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  details?: string;
  fix?: string;
}

// Helper: pull a human-readable message out of an unknown error.
function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(e);
}

// Helper: detect "function does not exist" Postgres errors, which is the
// shape supabase-js returns when an RPC is missing.
function isMissingFunctionError(msg: string): boolean {
  return (
    /does not exist/i.test(msg) ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg)
  );
}

export default function ManageDiagnosePage() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [running, setRunning] = useState(true);
  // Realtime check spins up an async channel; we need to clean it up if the
  // user navigates away mid-diagnose so we don't leak websocket listeners.
  const realtimeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      realtimeCleanupRef.current?.();
    };
  }, []);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const results: DiagnosticCheck[] = [];
    const push = (c: DiagnosticCheck) => {
      results.push(c);
      setChecks([...results]);
    };

    // ─── 1. Supabase client ───
    const supabase = getSupabase();
    if (!supabase) {
      push({
        id: "supabase-config",
        label: "חיבור ל-Supabase",
        description: "האם NEXT_PUBLIC_SUPABASE_URL + ANON_KEY מוגדרים",
        status: "fail",
        details: "Supabase client לא נטען",
        fix: "וודא שב-.env.local יש NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY תקפים, ושהפעלת מחדש את ה-dev server.",
      });
      setRunning(false);
      return;
    }
    push({
      id: "supabase-config",
      label: "חיבור ל-Supabase",
      description: "client נטען בהצלחה",
      status: "ok",
    });

    // ─── 2. Authenticated user ───
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      push({
        id: "auth",
        label: "אימות משתמש",
        description: "האם המשתמש מחובר",
        status: "fail",
        details: userErr?.message ?? "לא מחובר",
        fix: "התחבר דרך /signup או /onboarding לפני ההפעלה",
      });
    } else {
      push({
        id: "auth",
        label: "אימות משתמש",
        description: `מחובר כ-${userData.user.email ?? userData.user.id.slice(0, 8)}`,
        status: "ok",
      });
    }

    // ─── 3. event_managers table ───
    try {
      const { error } = (await supabase
        .from("event_managers")
        .select("id")
        .limit(1)) as { error: { message: string } | null };
      if (error) throw error;
      push({
        id: "table-event-managers",
        label: "טבלת event_managers",
        description: "הטבלה קיימת ונגישה",
        status: "ok",
      });
    } catch (e) {
      push({
        id: "table-event-managers",
        label: "טבלת event_managers",
        description: "לא נגישה",
        status: "fail",
        details: errorMessage(e),
        fix: "הרץ את supabase/migrations/2026-05-10-event-day-manager.sql ב-Supabase SQL Editor",
      });
    }

    // ─── 4. RPC get_manager_invitation ───
    try {
      const { error } = (await supabase.rpc("get_manager_invitation", {
        p_token: "diagnostic-test-token",
      })) as { error: { message: string } | null };
      // Function exists → either no rows returned (no error) OR a runtime
      // error unrelated to existence. Both are OK here.
      if (error && isMissingFunctionError(error.message)) {
        throw new Error(error.message);
      }
      push({
        id: "rpc-get",
        label: "RPC get_manager_invitation",
        description: "הפונקציה קיימת ב-DB",
        status: "ok",
      });
    } catch (e) {
      push({
        id: "rpc-get",
        label: "RPC get_manager_invitation",
        description: "הפונקציה חסרה ב-Supabase",
        status: "fail",
        details: errorMessage(e),
        fix: "הרץ את supabase/migrations/2026-05-12-accept-manager-rpc.sql ב-Supabase SQL Editor — זו הסיבה הסבירה שמנהלים לא יכולים לאשר הזמנות!",
      });
    }

    // ─── 5. RPC accept_manager_invitation ───
    try {
      const { error } = (await supabase.rpc("accept_manager_invitation", {
        p_token: "diagnostic-test-token",
      })) as { error: { message: string } | null };
      // The function raises 'invitation_not_found' for a bogus token. That's
      // the expected response — proves the function is wired up correctly.
      if (error && isMissingFunctionError(error.message)) {
        throw new Error(error.message);
      }
      push({
        id: "rpc-accept",
        label: "RPC accept_manager_invitation",
        description: "הפונקציה קיימת ב-DB",
        status: "ok",
      });
    } catch (e) {
      push({
        id: "rpc-accept",
        label: "RPC accept_manager_invitation",
        description: "הפונקציה חסרה ב-Supabase",
        status: "fail",
        details: errorMessage(e),
        fix: "הרץ את supabase/migrations/2026-05-12-accept-manager-rpc.sql ב-Supabase SQL Editor",
      });
    }

    // ─── 6. Realtime ───
    // Subscribe + race a timeout — if SUBSCRIBED fires within 2s we pass,
    // otherwise we flag it. The cleanup ref ensures the channel is removed
    // even if the user navigates away mid-check.
    realtimeCleanupRef.current?.();
    await new Promise<void>((resolve) => {
      let settled = false;
      const channel = supabase.channel("diagnostic-test").subscribe((status) => {
        if (settled) return;
        if (status === "SUBSCRIBED") {
          settled = true;
          push({
            id: "realtime",
            label: "Realtime",
            description: "channel חיבור מוצלח",
            status: "ok",
          });
          void supabase.removeChannel(channel);
          realtimeCleanupRef.current = null;
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          settled = true;
          push({
            id: "realtime",
            label: "Realtime",
            description: "החיבור נכשל",
            status: "fail",
            details: `status: ${status}`,
            fix: "הרץ את supabase/migrations/2026-05-12-realtime-momentum-live.sql ב-Supabase SQL Editor, ובדוק שRealtime מופעל ב-Supabase Dashboard → Database → Replication",
          });
          void supabase.removeChannel(channel);
          realtimeCleanupRef.current = null;
          resolve();
        }
      });
      // Hard-timeout in case `subscribe` never resolves (network drop, etc.)
      const t = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        push({
          id: "realtime",
          label: "Realtime",
          description: "החיבור לא נסגר תוך 2 שניות",
          status: "fail",
          details: "timeout",
          fix: "ודא ש-Realtime מופעל ב-Supabase Dashboard → Database → Replication עבור הטבלאות guest_arrivals ו-manager_actions",
        });
        void supabase.removeChannel(channel);
        realtimeCleanupRef.current = null;
        resolve();
      }, 2500);
      realtimeCleanupRef.current = () => {
        window.clearTimeout(t);
        void supabase.removeChannel(channel);
      };
    });

    // ─── 7. NEXT_PUBLIC_SITE_URL ───
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      push({
        id: "site-url",
        label: "NEXT_PUBLIC_SITE_URL",
        description: "לא מוגדר ב-env",
        status: "fail",
        details: "הקישורים שנשלחים ב-WhatsApp יכללו URL יחסי שלא יעבוד",
        fix: "הוסף NEXT_PUBLIC_SITE_URL ב-.env.local (לdev: http://localhost:3000 או tunnel URL)",
      });
    } else {
      push({
        id: "site-url",
        label: "NEXT_PUBLIC_SITE_URL",
        description: siteUrl,
        status: "ok",
      });
    }

    setRunning(false);
  }, []);

  useEffect(() => {
    // Documented "load-on-mount" pattern. runDiagnostics drives setState as
    // each individual check resolves so the user sees a live ✅/❌ list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runDiagnostics();
  }, [runDiagnostics]);

  const failedChecks = checks.filter((c) => c.status === "fail");
  const okChecks = checks.filter((c) => c.status === "ok");

  return (
    <main className="min-h-screen pb-20 px-5">
      <div className="max-w-2xl mx-auto pt-8">
        <Link
          href="/"
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--foreground-soft)" }}
        >
          <ArrowRight size={14} aria-hidden /> חזרה
        </Link>

        <div className="mt-6 text-center">
          <Logo size={28} />
          <h1 className="mt-4 text-3xl font-extrabold gradient-gold">אבחון Momentum Live</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            בודק שהכל מחובר נכון. אם יש כשל — תקבל הוראות תיקון.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div
            className="card p-4 text-center"
            style={{ borderColor: "rgba(52, 211, 153, 0.3)" }}
          >
            <div className="text-2xl font-extrabold text-emerald-400 ltr-num">
              {okChecks.length}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
              בדיקות עברו
            </div>
          </div>
          <div
            className="card p-4 text-center"
            style={
              failedChecks.length > 0
                ? { borderColor: "rgba(248, 113, 113, 0.3)" }
                : undefined
            }
          >
            <div
              className={`text-2xl font-extrabold ltr-num ${
                failedChecks.length > 0 ? "text-red-400" : ""
              }`}
            >
              {failedChecks.length}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
              נכשלו
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {checks.map((check) => (
            <div
              key={check.id}
              className="card p-4"
              style={
                check.status === "fail"
                  ? {
                      borderColor: "rgba(248, 113, 113, 0.3)",
                      background: "rgba(248, 113, 113, 0.05)",
                    }
                  : undefined
              }
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {check.status === "loading" && (
                    <Loader2 className="animate-spin" size={20} aria-hidden />
                  )}
                  {check.status === "ok" && (
                    <Check size={20} className="text-emerald-400" aria-hidden />
                  )}
                  {check.status === "fail" && (
                    <X size={20} className="text-red-400" aria-hidden />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{check.label}</div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    {check.description}
                  </div>
                  {check.details && (
                    <div
                      className="text-xs mt-2 p-2 rounded-lg font-mono break-all"
                      style={{
                        background: "var(--input-bg)",
                        color: "var(--foreground-muted)",
                      }}
                    >
                      {check.details}
                    </div>
                  )}
                  {check.fix && (
                    <div
                      className="mt-3 p-3 rounded-lg border-r-4"
                      style={{
                        borderColor: "rgb(251, 191, 36)",
                        background: "rgba(251, 191, 36, 0.06)",
                      }}
                    >
                      <div className="text-xs font-bold text-amber-400 mb-1">
                        איך לתקן:
                      </div>
                      <div className="text-xs" style={{ color: "var(--foreground-soft)" }}>
                        {check.fix}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {running && (
          <div
            className="mt-6 text-center text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            <Loader2 className="animate-spin inline" size={14} aria-hidden /> בודק...
          </div>
        )}

        {!running && failedChecks.length > 0 && (
          <div className="mt-8 card-gold p-6 text-center">
            <AlertCircle size={28} className="mx-auto text-amber-400" aria-hidden />
            <h2 className="mt-3 font-bold text-lg">
              נמצאו <span className="ltr-num">{failedChecks.length}</span> בעיות
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
              עקוב אחר הוראות התיקון של כל בדיקה כושלת. ברוב המקרים מספיק להריץ
              את ה-SQL הרלוונטי ב-Supabase Dashboard → SQL Editor.
            </p>
            <button
              type="button"
              onClick={() => void runDiagnostics()}
              className="btn-gold mt-5 inline-flex items-center gap-2"
            >
              הרץ אבחון שוב
            </button>
          </div>
        )}

        {!running && failedChecks.length === 0 && checks.length > 0 && (
          <div className="mt-8 card-gold p-6 text-center">
            <Check size={28} className="mx-auto text-emerald-400" aria-hidden />
            <h2 className="mt-3 font-bold text-lg">הכל תקין! ✨</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
              Momentum Live מוכן לשימוש. אם יש בעיה ספציפית במנהלים — בדוק את
              הקונסול של הדפדפן (F12) ושלח שגיאה ספציפית.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
