"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { applyCloudPayload, readEventId } from "@/lib/store";
import type { AppState } from "@/lib/types";

/**
 * Pre-onboarding gate. Paid tiers are removed for now (product hasn't
 * decided on pricing yet), so there's nothing to choose — this page just
 * (a) acts as a cloud backstop that forwards returning users straight to
 * their saved event, and (b) sends new users on to /onboarding.
 */
export function StartClient() {
  const router = useRouter();
  // R140 — cloud backstop. The page-level inline script only checks
  // localStorage at paint time; a returning user whose `app_states` row
  // exists in the cloud but localStorage is empty would land here even
  // though they already have an event. We do a one-shot Supabase query
  // for THIS user's app_states; if found, hydrate localStorage + redirect
  // to /dashboard. While the check is in flight we render a loader so
  // the user never sees a tier picker they shouldn't.
  const [cloudCheckDone, setCloudCheckDone] = useState(false);
  useEffect(() => {
    if (readEventId()) {
      setCloudCheckDone(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) {
          if (!cancelled) setCloudCheckDone(true);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setCloudCheckDone(true);
          return;
        }
        const { data: row } = (await supabase
          .from("app_states")
          .select("payload")
          .eq("user_id", user.id)
          .maybeSingle()) as { data: { payload: AppState | null } | null };
        if (cancelled) return;
        if (row?.payload?.event?.id) {
          applyCloudPayload(row.payload);
          router.replace("/dashboard");
          return;
        }
        setCloudCheckDone(true);
      } catch (e) {
        console.error("[start] cloud backstop failed:", e);
        if (!cancelled) setCloudCheckDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleContinue = () => {
    router.push("/onboarding?gate=ok");
  };

  // R140 — while the cloud backstop is checking, render a calm loader
  // instead of the tier picker. Otherwise a returning user briefly
  // sees "choose your plan" before being whisked to /dashboard, which
  // reads as "the app forgot my event".
  if (!cloudCheckDone) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center" style={{ color: "var(--foreground-soft)" }}>
            <Loader2 className="mx-auto mb-3 animate-spin" size={24} aria-hidden style={{ color: "var(--accent)" }} />
            <p className="text-sm">טוען את האירוע שלך…</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 relative pb-24">
        <div aria-hidden className="glow-orb glow-orb-gold w-[700px] h-[700px] -top-40 left-1/2 -translate-x-1/2 opacity-30" />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-12 relative z-10">
          <div className="text-center max-w-2xl mx-auto fade-up">
            <span className="pill pill-gold inline-flex">
              <Sparkles size={11} /> לפני שיוצאים לדרך
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              <span className="gradient-gold block">חינמי לכולם — לכבוד ההשקה</span>
            </h1>
            <p className="mt-5 text-base md:text-lg leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
              <strong className="text-[--foreground]">אין מה לבחור עכשיו.</strong>{" "}
              כל הפיצ׳רים פתוחים בחינם — בלי כרטיס אשראי, בלי חיוב אוטומטי, בלי הגבלות.
            </p>
          </div>

          <div className="mt-12 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleContinue}
              className="btn-gold inline-flex items-center gap-2 px-8 py-3 text-base"
            >
              המשך לתכנון האירוע
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
