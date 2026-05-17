"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PricingTiers } from "@/components/PricingTiers";
import type { CoupleTier } from "@/lib/pricing";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { ArrowLeft, Sparkles } from "lucide-react";

// R12 §3S — centralized; dot separator (was `:`).
const SELECTED_TIER_KEY = STORAGE_KEYS.selectedTier;

/**
 * Pricing gate UI. Owns the selectedTier state, persists it to sessionStorage
 * when the user proceeds, then forwards to /onboarding?gate=ok.
 *
 * R6 #3 + #6 fixes:
 *   - Tier cards are now selectable (radio-like) instead of 3 identical
 *     "המשך" links that all pointed to the same URL.
 *   - The selected tier is saved to sessionStorage so onboarding can use it.
 *   - Footer is rendered for parity with /pricing (was missing).
 */
export function StartClient() {
  const router = useRouter();
  // Default to free — the safest fallback if the user proceeds without
  // explicitly tapping a card.
  const [selectedTier, setSelectedTier] = useState<CoupleTier>("free");

  const handleContinue = () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(SELECTED_TIER_KEY, selectedTier);
      } catch {
        // sessionStorage can be disabled (Safari private mode quotas etc.).
        // Selection is non-critical for the flow itself, so a silent failure
        // here is acceptable — the user still proceeds.
      }
    }
    router.push("/onboarding?gate=ok");
  };

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
              <span className="gradient-gold block">בחר מסלול שמתאים לך</span>
            </h1>
            <p className="mt-5 text-base md:text-lg leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
              <strong className="text-[--foreground]">אין מנוי חודשי.</strong>{" "}
              חינם להתחלה, או ₪99 חד-פעמי לאירוע (מחיר השקה) — ללא הפתעות, ללא חיובים אוטומטיים.
            </p>
          </div>

          <div className="mt-12">
            <PricingTiers
              selectedTier={selectedTier}
              onSelect={setSelectedTier}
              ctaLabel="בחר"
            />
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
            <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              תמיד אפשר לשדרג מאוחר יותר דרך תפריט המשתמש.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
