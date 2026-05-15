"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Crown, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Confetti } from "@/components/managerLive/Confetti";
import { haptic } from "@/lib/haptic";
import { playManagerSound } from "@/lib/managerSounds";

/**
 * R20 Phase 2 — manager accepts the invitation.
 *
 * URL: /manage/accept?token=<invitation_token>
 *
 * Flow:
 *   1. Look up the token in event_managers (no auth required for SELECT
 *      because RLS lets the manager see their own row by user_id; on first
 *      visit user_id is null, so we rely on the token being a long-form
 *      secret instead — see the read policy in the migration).
 *   2. Show the invitation card + 4-feature breakdown.
 *   3. On accept: require Supabase auth (push to /signup with returnTo if
 *      anonymous), then UPDATE the row setting user_id + accepted_at.
 *   4. Redirect to /manage/[eventId].
 */
export default function ManageAcceptPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AcceptInner />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
    </main>
  );
}

interface InvitationView {
  eventId: string;
  inviteeName: string;
  role: string;
  inviterName: string;
}

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  // R26 — post-accept celebration (confetti + welcome) before redirect.
  const [celebrating, setCelebrating] = useState(false);
  // Single-slot timeout cleanup: avoids leaking pending router.push calls when
  // the user navigates away mid-redirect (P1 #6).
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // R26 — gentle haptic the moment the reveal (and Accept CTA) lands.
  useEffect(() => {
    if (invitation && !loading && !error) haptic.medium();
  }, [invitation, loading, error]);

  useEffect(() => {
    if (!token) {
      // Token / config validation must happen ON mount — these are one-shot
      // "show the error branch" flips. Documented setState-in-effect pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("קישור לא תקין — חסר token");
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("השירות לא זמין כרגע — בדוק שיש חיבור לאינטרנט");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      // Route through a `security definer` RPC because the row's user_id is
      // still null at this point, so RLS would block a direct SELECT.
      const { data, error: err } = (await supabase.rpc(
        "get_manager_invitation",
        { p_token: token },
      )) as {
        data:
          | {
              event_id: string;
              invitee_name: string;
              role: string;
              status: string;
            }[]
          | null;
        error: { message: string } | null;
      };
      if (cancelled) return;

      if (err || !data || data.length === 0) {
        if (err) {
          console.error("[manage/accept] lookup failed", err);
          // Specific failures get specific messages so the host (or dev)
          // can act on them. The diagnose page link is intentional —
          // missing RPC is the #1 cause of silent accept failures.
          const raw = err.message ?? "";
          let userError = "ההזמנה לא נמצאה או פגה";
          if (/does not exist|function .* does not exist|could not find/i.test(raw)) {
            userError =
              "המערכת לא מוגדרת. הרץ את 2026-05-12-accept-manager-rpc.sql ב-Supabase. בדוק ב-/manage/diagnose";
          } else if (/network|fetch|failed to/i.test(raw)) {
            userError = "אין חיבור לאינטרנט";
          }
          setError(userError);
        } else {
          setError("ההזמנה לא נמצאה — ייתכן שהקישור פג או שהוא לא תקין");
        }
        setLoading(false);
        return;
      }

      const inv = data[0];

      if (inv.status === "accepted") {
        setError("ההזמנה כבר אושרה — מעביר אותך לדשבורד...");
        setLoading(false);
        const t = setTimeout(() => {
          if (!cancelled) router.push(`/manage/${inv.event_id}`);
        }, 1500);
        cleanupRef.current = () => clearTimeout(t);
        return;
      }
      if (inv.status === "declined") {
        setError("ההזמנה נדחתה");
        setLoading(false);
        return;
      }

      setInvitation({
        eventId: inv.event_id,
        inviteeName: inv.invitee_name,
        role: inv.role,
        // Phase 2 keeps this generic; a future join on auth.users could
        // surface the host's actual name. For now "המארחים" reads warmly.
        inviterName: "המארחים",
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const handleAccept = async () => {
    if (!token || !invitation) return;
    setAccepting(true);

    const supabase = getSupabase();
    if (!supabase) {
      showToast("השירות לא זמין", "error");
      setAccepting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Anonymous — push through signup, then return here. We pass the
      // FULL current URL so the post-auth callback brings the manager back
      // to this exact invitation token.
      const returnUrl = encodeURIComponent(window.location.href);
      router.push(`/signup?returnTo=${returnUrl}`);
      return;
    }

    // `security definer` RPC: matches the token, sets user_id + status,
    // returns the event_id we need for the redirect.
    const { data, error: err } = (await supabase.rpc(
      "accept_manager_invitation",
      { p_token: token },
    )) as {
      data: { event_id: string }[] | null;
      error: { message: string } | null;
    };

    if (err) {
      console.error("[manage/accept] accept rpc failed", err);
      const raw = err.message ?? "";
      let userError = "שגיאה באישור ההזמנה — נסה שוב";
      if (/does not exist|function .* does not exist|could not find/i.test(raw)) {
        userError =
          "המערכת לא מוגדרת. הרץ את 2026-05-12-accept-manager-rpc.sql ב-Supabase (בדוק ב-/manage/diagnose)";
      } else if (/invitation_not_found/i.test(raw)) {
        userError = "ההזמנה לא נמצאה — ייתכן שהקישור פג";
      } else if (/invitation_declined/i.test(raw)) {
        userError = "ההזמנה נדחתה בעבר";
      } else if (/network|fetch|failed to/i.test(raw)) {
        userError = "אין חיבור לאינטרנט. נסה שוב.";
      }
      showToast(userError, "error");
      setAccepting(false);
      return;
    }

    if (!data || data.length === 0) {
      showToast("שגיאה — נסה שוב", "error");
      setAccepting(false);
      return;
    }

    const eventId = data[0].event_id;
    // R26 — celebrate before the redirect: confetti + haptic + welcome.
    haptic.success();
    playManagerSound("checkin");
    setCelebrating(true);
    showToast("🎉 ברוך הבא לצוות הניהול", "success");
    const t = setTimeout(() => router.push(`/manage/${eventId}`), 1500);
    cleanupRef.current = () => clearTimeout(t);
  };

  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle size={32} className="mx-auto text-amber-400" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">{error}</h1>
          <Link
            href="/"
            className="text-xs underline mt-4 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  const firstName = invitation!.inviteeName.trim().split(/\s+/)[0];
  const benefits = [
    "סריקת QR בכניסה — לדעת מי הגיע, מי לא",
    "צפייה במפת השולחנות בזמן אמת",
    "תיאום מהיר עם הספקים (DJ, צלם, קייטרינג)",
    "גמישות לעדכן הושבה במקום",
  ];

  return (
    <>
      {celebrating && <Confetti />}
      <main
        className="min-h-screen pb-16 px-5 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, rgba(212,176,104,0.16), transparent 60%), var(--background)",
        }}
      >
        {/* Small floating glow orbs (kept tiny to protect FPS). */}
        <div aria-hidden className="glow-orb glow-orb-gold w-[320px] h-[320px] -top-24 right-[-60px] opacity-30 float-slow" />
        <div aria-hidden className="glow-orb glow-orb-gold w-[240px] h-[240px] top-1/3 left-[-70px] opacity-20 float-medium" />
        <div aria-hidden className="glow-orb glow-orb-gold w-[200px] h-[200px] bottom-10 right-1/4 opacity-20 float-slow" />

        <div className="max-w-xl mx-auto pt-12 relative z-10">
          <div className="text-center">
            <div className="r26-rise"><Logo size={28} /></div>

            {/* Crown: drop in, then perpetual slow spin. */}
            <div className="r26-crown mt-8 inline-block">
              <div className="r26-crown-inner">
                <Crown size={64} className="text-[--accent]" aria-hidden />
              </div>
            </div>

            <p
              className="mt-7 text-base r26-rise"
              style={{ animationDelay: "0.35s", color: "var(--foreground-soft)" }}
            >
              {invitation!.inviterName} בחרו בך 💛
            </p>

            <h1
              className="mt-2 font-extrabold gradient-gold r26-rise leading-tight"
              style={{ animationDelay: "0.7s", fontSize: "clamp(40px, 11vw, 56px)" }}
            >
              היי {firstName} 👋
            </h1>

            <p
              className="mt-4 text-base r26-rise"
              style={{ animationDelay: "1.1s", color: "var(--foreground-soft)" }}
            >
              {invitation!.inviterName} מזמינים אותך להיות{" "}
              <strong className="text-[--foreground]">מנהל/ת האירוע</strong> שלהם —
              עוזר/ת לנהל איתם את הרגע הכי חשוב.
            </p>
          </div>

          <div
            className="mt-9 card-gold p-6 r26-rise"
            style={{ animationDelay: "1.5s" }}
          >
            <h2 className="font-bold text-lg mb-4">מה התפקיד כולל?</h2>
            <ul className="space-y-3 text-sm">
              {benefits.map((b, i) => (
                <li
                  key={b}
                  className="flex items-start gap-2 r26-rise-sm"
                  style={{ animationDelay: `${1.6 + i * 0.1}s` }}
                >
                  <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs" style={{ color: "var(--foreground-muted)" }}>
              הכל מהנייד שלך. אין צורך להוריד אפליקציה.
            </p>
          </div>

          <div
            className="mt-8 grid grid-cols-2 gap-2 r26-rise"
            style={{ animationDelay: "2s" }}
          >
            <Link
              href="/"
              className="rounded-2xl py-4 text-center text-sm"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                color: "var(--foreground-soft)",
              }}
            >
              לא עכשיו
            </Link>
            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting || celebrating}
              className="btn-gold r26-cta-pulse inline-flex items-center justify-center gap-2 py-4 disabled:opacity-50"
            >
              {accepting || celebrating ? (
                <Loader2 className="animate-spin" size={16} aria-hidden />
              ) : (
                <>
                  <Sparkles size={16} aria-hidden /> אני בעניין ✨
                </>
              )}
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
