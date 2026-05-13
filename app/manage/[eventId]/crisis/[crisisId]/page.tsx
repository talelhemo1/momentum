"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { AppState } from "@/lib/types";
import { getCrisisPlaybook } from "@/lib/crisisPlaybooks";
import { VENDOR_TYPE_LABELS } from "@/lib/types";
import {
  ArrowRight,
  Loader2,
  Phone,
  Check,
  Square,
  Copy,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

/**
 * R20 Phase 5 — Crisis playbook detail.
 *
 * Detail view for a single emergency: emergency contacts (tel: links),
 * interactive checklist (state lives in memory — resets on reload, which is
 * intentional: each crisis run-through is a fresh ticking-off), copyable
 * guest-notification template, and a one-tap "find a backup vendor" link
 * that routes to /vendors filtered by category.
 */
export default function CrisisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";
  const crisisId = typeof params.crisisId === "string" ? params.crisisId : "";

  const playbook = useMemo(() => getCrisisPlaybook(crisisId), [crisisId]);

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [hostName, setHostName] = useState("");
  const [venue, setVenue] = useState("");

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

  // Pull host name + venue from the local AppState so we can fill the
  // notification template placeholders.
  useEffect(() => {
    try {
      const stateRaw = localStorage.getItem(STORAGE_KEYS.app);
      if (!stateRaw) return;
      const state = JSON.parse(stateRaw) as Partial<AppState>;
      if (state.event?.id !== eventId) return;
      const name =
        state.event.hostName +
        (state.event.partnerName ? ` ו-${state.event.partnerName}` : "");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHostName(name);
      setVenue(state.event.synagogue || state.event.city || "");
    } catch (e) {
      console.error("[crisis] failed to read local state", e);
    }
  }, [eventId]);

  if (checking || !authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!playbook) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertTriangle size={32} className="mx-auto text-amber-400" aria-hidden />
          <p className="font-semibold mt-3">לא נמצא playbook</p>
          <Link
            href={`/manage/${eventId}/crisis`}
            className="text-xs underline mt-4 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לרשימה
          </Link>
        </div>
      </main>
    );
  }

  const toggleStep = (stepId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const filledNotification = playbook.guestNotificationTemplate
    ? playbook.guestNotificationTemplate
        .replaceAll("{hostName}", hostName || "המארחים")
        .replaceAll("{venue}", venue || "האולם")
    : "";

  const copyNotification = async () => {
    if (!filledNotification) return;
    try {
      await navigator.clipboard.writeText(filledNotification);
      showToast("✓ הועתק — הדבק בקבוצת WhatsApp", "success");
    } catch (e) {
      console.error("[crisis] clipboard write failed", e);
      showToast("ההעתקה נכשלה", "error");
    }
  };

  const severityBanner: Record<string, { bg: string; border: string; label: string }> = {
    critical: {
      bg: "rgba(248,113,113,0.08)",
      border: "rgba(248,113,113,0.35)",
      label: "מצב קריטי — לפעול עכשיו",
    },
    high: {
      bg: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.35)",
      label: "דחוף — מטפלים תוך דקות",
    },
    medium: {
      bg: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.12)",
      label: "מטפלים בקור רוח",
    },
  };
  const banner = severityBanner[playbook.severity] ?? severityBanner.medium;

  return (
    <main className="min-h-screen pb-20">
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            href={`/manage/${eventId}/crisis`}
            aria-label="חזרה לרשימה"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <ArrowRight size={20} aria-hidden />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-2xl shrink-0" aria-hidden>
              {playbook.emoji}
            </div>
            <div className="min-w-0">
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                Crisis playbook
              </div>
              <div className="font-bold text-sm truncate">{playbook.title}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 pt-6 space-y-6">
        <div
          className="card p-4 border"
          style={{ background: banner.bg, borderColor: banner.border }}
        >
          <div className="text-xs uppercase tracking-wider font-bold">
            {banner.label}
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--foreground-soft)" }}>
            {playbook.tagline}
          </p>
        </div>

        {playbook.contacts.length > 0 && (
          <section>
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Phone size={20} className="text-red-400" aria-hidden />
              מספרי חירום
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {playbook.contacts.map((c) => (
                <a
                  key={c.number}
                  href={`tel:${c.number}`}
                  className="card p-4 flex items-center gap-3 hover:translate-y-[-2px] transition border border-red-500/20 hover:border-red-500/40"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center text-red-300 shrink-0">
                    <Phone size={18} aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{c.label}</div>
                    <div
                      className="text-xs ltr-num"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {c.number}
                    </div>
                    {c.note && (
                      <div
                        className="text-[10px] mt-0.5"
                        style={{ color: "var(--foreground-soft)" }}
                      >
                        {c.note}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-bold text-lg mb-3">צעדים — סמנו בזמן שאתם מטפלים</h2>
          <div className="space-y-2">
            {playbook.steps.map((step, idx) => {
              const done = completed.has(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  className={`card p-4 w-full text-start flex items-start gap-3 transition ${
                    done ? "opacity-60" : ""
                  }`}
                >
                  <div className="w-6 h-6 shrink-0 mt-0.5">
                    {done ? (
                      <Check size={20} className="text-emerald-400" aria-hidden />
                    ) : (
                      <Square size={20} aria-hidden />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${done ? "line-through" : ""}`}>
                      <span className="ltr-num">{idx + 1}.</span> {step.text}
                    </div>
                    {step.hint && (
                      <div
                        className="text-xs mt-1"
                        style={{ color: "var(--accent)" }}
                      >
                        {step.hint}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {filledNotification && (
          <section>
            <h2 className="font-bold text-lg mb-3">הודעה לאורחים</h2>
            <div className="card p-4">
              <p className="text-sm whitespace-pre-wrap">{filledNotification}</p>
              <button
                type="button"
                onClick={() => void copyNotification()}
                className="btn-gold mt-4 inline-flex items-center gap-2 text-sm"
              >
                <Copy size={14} aria-hidden /> העתק להודעה ב-WhatsApp
              </button>
            </div>
          </section>
        )}

        {playbook.backupVendorTypes && playbook.backupVendorTypes.length > 0 && (
          <section>
            <h2 className="font-bold text-lg mb-3">מצא ספק חלופי</h2>
            <div className="grid grid-cols-2 gap-2">
              {playbook.backupVendorTypes.map((cat) => (
                <Link
                  key={cat}
                  href={`/vendors?type=${cat}&urgent=1`}
                  className="card p-3 flex items-center justify-between hover:translate-y-[-1px] transition border border-[var(--border-gold)]"
                >
                  <div className="text-sm font-semibold truncate">
                    {VENDOR_TYPE_LABELS[cat] ?? cat}
                  </div>
                  <ExternalLink size={14} className="text-[--accent] shrink-0" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
