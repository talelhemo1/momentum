"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { CRISIS_PLAYBOOKS } from "@/lib/crisisPlaybooks";
import { ArrowRight, AlertTriangle, Loader2 } from "lucide-react";

/**
 * R20 Phase 5 — Crisis Mode index.
 *
 * Lists the 7 emergency playbooks as big tappable cards. Auth-gated to the
 * event manager (same gate as the dashboard + check-in pages).
 */
export default function CrisisIndexPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace(`/manage/${eventId}`);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace(`/manage/${eventId}`);
        return;
      }
      // Host (invited_by) OR accepted manager (user_id) both see crisis mode.
      const { data: m } = (await supabase
        .from("event_managers")
        .select("id")
        .eq("event_id", eventId)
        .or(`user_id.eq.${user.id},invited_by.eq.${user.id}`)
        .maybeSingle()) as { data: { id: string } | null };
      if (cancelled) return;
      if (m) {
        setAuthorized(true);
      } else {
        router.replace(`/manage/${eventId}`);
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, router]);

  if (checking || !authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  const severityRing: Record<string, string> = {
    critical: "border-red-500/40 hover:border-red-500/70",
    high: "border-amber-500/40 hover:border-amber-500/70",
    medium: "border-white/10 hover:border-white/30",
  };

  return (
    <main className="min-h-screen pb-20">
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            href={`/manage/${eventId}`}
            aria-label="חזרה לדשבורד"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <ArrowRight size={20} aria-hidden />
          </Link>
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-400" aria-hidden />
            <div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                Crisis Mode
              </div>
              <div className="font-bold text-sm">משהו השתבש?</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 pt-6">
        <div
          className="card p-5 mb-6 border"
          style={{ borderColor: "rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.05)" }}
        >
          <p className="font-bold">נשמו עמוק. אנחנו פה.</p>
          <p className="text-sm mt-2" style={{ color: "var(--foreground-soft)" }}>
            כל playbook נכתב על ידי אנשי תעשייה מנוסים. בחרו את הסיטואציה — נדריך אתכם צעד אחר צעד.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {CRISIS_PLAYBOOKS.map((p) => (
            <Link
              key={p.id}
              href={`/manage/${eventId}/crisis/${p.id}`}
              className={`card p-5 transition border ${severityRing[p.severity] ?? severityRing.medium} hover:translate-y-[-2px]`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl shrink-0" aria-hidden>
                  {p.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{p.title}</div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    {p.tagline}
                  </div>
                  {p.severity === "critical" && (
                    <div className="mt-2 inline-block text-[10px] uppercase tracking-wider font-bold text-red-400">
                      קריטי
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
