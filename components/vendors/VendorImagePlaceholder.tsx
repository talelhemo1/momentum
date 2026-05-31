"use client";

import type { VendorType } from "@/lib/types";

/**
 * R84-2 / R112 — premium fallback image for vendor catalog tiles when
 * the vendor hasn't uploaded a hero photo yet.
 *
 * R84-2 introduced a palette of 6 random gradients (warm gold, dusk
 * blue, rose, sage, lavender, plum) so each vendor got a unique
 * tile. R112 collapses that to a SINGLE brand-token-derived gradient
 * (gold-on-dark) — the random palettes were producing off-brand
 * tiles (purple "ד" for דפוס אומן, sage tiles for catering vendors)
 * that didn't fit Momentum's gold-on-dark identity.
 *
 * Design now:
 *   • Diagonal gradient: `--background-2` → `--background` with a
 *     gold radial wash overlay (`color-mix` against `--accent`).
 *     Same composition for every vendor, so the catalog reads as
 *     one product, not a salad of theme variants.
 *   • Large serif monogram in `--accent` (gold) with subtle drop
 *     shadow for legibility.
 *   • Small category emoji in the bottom-end corner for context.
 *
 * Static CSS — no JS animations, no canvas. Renders identically
 * for every vendor with the same brand colors.
 */

const CATEGORY_EMOJI: Partial<Record<VendorType | string, string>> = {
  venue: "🏛️",
  catering: "🍽️",
  photography: "📸",
  videography: "🎬",
  dj: "🎧",
  band: "🎻",
  rabbi: "📿",
  makeup: "💄",
  dress: "👰",
  florist: "💐",
  stationery: "✉️",
  printing: "🖨️",
  designer: "✨",
  transportation: "🚗",
  entertainment: "🎉",
  bouzouki: "🪕",
  trumpet: "🎺",
  "dessert-station": "🍬",
  "henna-cookies": "🍪",
  producer: "🎯",
  costumes: "👗",
};

export function VendorImagePlaceholder({
  name,
  category,
}: {
  name: string;
  /** A string from VendorType (catering, photography, ...) or any
   *  string id. Unknown values fall back to no emoji. */
  category?: string;
}) {
  const trimmed = name.trim() || "Momentum";
  const initial = trimmed.charAt(0).toUpperCase();
  const emoji = category ? CATEGORY_EMOJI[category] ?? "" : "";

  return (
    <div
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{
        // R112 — single brand-token gradient for every vendor. No more
        // random per-name palettes. Pulls from --background-2 →
        // --background so the placeholder honors the active theme
        // (dark = near-black, light = neutral white-gray).
        background:
          "linear-gradient(135deg, var(--background-2), var(--background))",
      }}
      aria-hidden
    >
      {/* R112 — soft gold halo on the top-right, deep base shadow on
          the bottom-left. Both derive from theme tokens so the tile
          stays brand-correct in both light and dark mode. */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-20%",
          right: "-15%",
          width: "75%",
          height: "75%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent) 32%, transparent), transparent 60%)",
          filter: "blur(32px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-25%",
          left: "-20%",
          width: "75%",
          height: "75%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--background) 75%, transparent), transparent 60%)",
          filter: "blur(36px)",
        }}
      />

      {/* Subtle dot texture — opacity tuned so it reads on both light
          and dark backgrounds. Color follows --accent so it stays in
          the gold family. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.1,
          backgroundImage:
            "radial-gradient(circle at 30% 50%, var(--accent) 1px, transparent 1px), radial-gradient(circle at 70% 80%, var(--accent) 1px, transparent 1px)",
          backgroundSize: "26px 26px, 32px 32px",
        }}
      />

      {/* Vignette + bottom-edge gradient using the surface token so it
          adapts to theme without hardcoded black. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, color-mix(in srgb, var(--background) 55%, transparent) 100%)",
        }}
      />

      {/* R112 — monogram in `--accent` (gold) with the same shimmer
          treatment as headings across the app. Sits over the gold
          halo so it reads as a luxe brand mark, not a "missing
          photo" stamp. */}
      <div
        className="relative font-extrabold flex flex-col items-center"
        style={{
          color: "var(--accent)",
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: "clamp(4rem, 8vw, 6rem)",
          textShadow:
            "0 1px 0 color-mix(in srgb, var(--accent) 22%, transparent), 0 4px 18px rgba(0,0,0,0.45)",
          lineHeight: 1,
        }}
      >
        <span>{initial}</span>
        {/* Delicate gold hairline under the monogram. */}
        <span
          aria-hidden
          className="mt-3 block"
          style={{
            width: 28,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, var(--accent), transparent)",
            opacity: 0.7,
          }}
        />
      </div>

      {/* Category emoji — corner accent. Soft + small so it never
          competes with the monogram. */}
      {emoji && (
        <div
          className="absolute bottom-3 end-3 text-2xl select-none"
          style={{ opacity: 0.6, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
        >
          {emoji}
        </div>
      )}
    </div>
  );
}
