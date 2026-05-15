"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { useAppState } from "@/lib/store";
import { useUser } from "@/lib/user";
import { AlcoholCalculator } from "@/components/calculators/AlcoholCalculator";

/**
 * R22 — the alcohol calculator logic now lives in the reusable
 * `<AlcoholCalculator />` (shared with the budget "מחשבונים" hub). This
 * page is a thin wrapper that keeps the standalone `/alcohol` deep link
 * working with the usual page chrome (header, auth gate, empty state).
 */
export default function AlcoholPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();

  useEffect(() => {
    if (userHydrated && !user) router.replace("/signup");
  }, [userHydrated, user, router]);

  if (!hydrated) {
    return (
      <>
        <Header />
        <main className="flex-1 px-5 pt-10 max-w-5xl mx-auto" />
      </>
    );
  }

  if (!state.event) return <EmptyEventState toolName="מחשבון האלכוהול" />;

  return (
    <>
      <Header />
      <main className="flex-1 pb-28 relative">
        <div
          aria-hidden
          className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 right-0 opacity-25"
        />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link
            href="/dashboard"
            className="text-sm inline-flex items-center gap-1.5"
            style={{ color: "var(--foreground-muted)" }}
          >
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7">
            <span className="eyebrow">תכנון בר</span>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
              מחשבון אלכוהול
            </h1>
            <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
              כמה יין, בירה ואלכוהול חזק לקנות לאירוע. כל מספר ניתן לעריכה —
              הספירה ב-RSVP מזינה אוטומטית.
            </p>
          </div>

          <div className="mt-8">
            <AlcoholCalculator />
          </div>
        </div>
      </main>
    </>
  );
}
