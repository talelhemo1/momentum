"use client";

import Link from "next/link";
import { Check, Crown, Heart, Sparkles, X } from "lucide-react";
import { COUPLE_TIERS, type CoupleTier } from "@/lib/pricing";

/** R13 — replace the per-tier emoji with a refined lucide icon. Picked here
 *  rather than on the data layer so lib/pricing.ts stays JSX-free. */
const TIER_ICON: Record<CoupleTier, typeof Heart> = {
  free: Heart,
  premium: Crown,
};

interface PricingTiersProps {
  /**
   * Controlled mode (e.g. /start gate): when both `selectedTier` and
   * `onSelect` are passed, the cards render as buttons with `aria-pressed`
   * and the parent owns the selection. The bottom-of-card CTA is replaced
   * with a "נבחר" badge.
   */
  selectedTier?: CoupleTier;
  onSelect?: (tier: CoupleTier) => void;
  /** Override the per-tier `ctaLabel` (only meaningful in selection mode). */
  ctaLabel?: string;
}

/**
 * 2-tier pricing display: Free + Premium (₪399 one-time per event).
 *
 * Two render modes, picked at the call site:
 *   - **Static** (`/pricing`): cards are `<div>`s, each carries its own
 *     Link CTA pointing to the per-tier href.
 *   - **Selectable** (`/start` gate): cards are `<button>`s, the parent
 *     owns the selection state, and the CTA is the page's bottom button.
 */
export function PricingTiers({ selectedTier, onSelect, ctaLabel }: PricingTiersProps) {
  const isSelectable = !!onSelect;
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      {COUPLE_TIERS.map((tier) => {
        const isSelected = isSelectable && selectedTier === tier.id;
        const cardClasses = `relative ${
          tier.recommended ? "card-gold" : "card"
        } p-7 transition text-start ${
          isSelectable ? "cursor-pointer hover:translate-y-[-2px]" : ""
        }`;
        const cardStyle = isSelected ? { boxShadow: "0 0 0 2px var(--accent)" } : undefined;

        const cardInner = (
          <>
            {tier.recommended && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1"
                style={{ background: "linear-gradient(135deg, #F4DEA9, #A8884A)", color: "#1A1310" }}
              >
                <Sparkles size={11} aria-hidden /> המומלץ
              </div>
            )}

            <div className="text-center">
              {(() => {
                const Icon = TIER_ICON[tier.id];
                return (
                  <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-[--accent]"
                    style={{ background: "rgba(212,176,104,0.12)", border: "1px solid var(--border-gold)" }}
                  >
                    <Icon size={26} aria-hidden />
                  </div>
                );
              })()}
              <h3 className="mt-4 text-2xl font-bold">{tier.label}</h3>
              <div className="mt-5">
                <div className="text-5xl font-extrabold ltr-num gradient-gold">
                  {tier.priceLabel}
                </div>
                {tier.priceSubLabel && (
                  <div
                    className="mt-1.5 text-xs"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {tier.priceSubLabel}
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
                {tier.tagline}
              </p>
            </div>

            <ul className="mt-7 space-y-2.5 text-sm">
              {tier.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check
                    size={16}
                    className="text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden
                  />
                  <span style={{ color: "var(--foreground)" }}>{f}</span>
                </li>
              ))}
            </ul>

            {tier.notIncluded && tier.notIncluded.length > 0 && (
              <ul
                className="mt-4 space-y-2 text-sm pt-4 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                {tier.notIncluded.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 opacity-50">
                    <X
                      size={16}
                      className="shrink-0 mt-0.5"
                      aria-hidden
                      style={{ color: "var(--foreground-muted)" }}
                    />
                    <span style={{ color: "var(--foreground-muted)" }}>
                      {/* Strip the leading "❌ " from the seed data — the
                          icon already conveys "not included". */}
                      {f.replace(/^❌\s*/, "")}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Selection-mode badge (replaces per-card CTA) */}
            {isSelectable && isSelected && (
              <div className="mt-5 text-center text-xs font-bold inline-flex items-center justify-center gap-1.5 w-full text-[--accent]">
                <Check size={14} /> נבחר
              </div>
            )}
          </>
        );

        if (isSelectable) {
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onSelect?.(tier.id)}
              aria-pressed={isSelected}
              className={cardClasses}
              style={cardStyle}
            >
              {cardInner}
              {/* Selection mode shows ctaLabel only as visual hint when NOT
                  the selected one — the actual continue button lives at the
                  bottom of /start, not on the card. */}
              {!isSelected && (
                <div className="mt-5 text-center text-xs font-semibold" style={{ color: "var(--foreground-soft)" }}>
                  {ctaLabel ?? "בחר מסלול"}
                </div>
              )}
            </button>
          );
        }

        // Static mode: each card carries its own Link CTA.
        return (
          <div key={tier.id} className={cardClasses} style={cardStyle}>
            {cardInner}
            <div className="mt-6">
              <Link
                href={tier.ctaHref}
                className={`w-full inline-flex items-center justify-center gap-2 ${
                  tier.recommended ? "btn-gold" : "btn-secondary"
                }`}
              >
                {tier.ctaLabel}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
