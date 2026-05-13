"use client";

import { LuxuriousTemplate, type TemplateProps } from "./LuxuriousTemplate";

/**
 * Modern template — clean monochrome with cool-sage accents instead of
 * gold. Wraps the Luxurious layout in a CSS-variable override so the same
 * markup renders with a distinct visual identity. No new sections, no new
 * components — just a theme.
 *
 * The CSS variable overrides are inline because Tailwind v4 doesn't
 * compile arbitrary custom-property selectors from runtime values, and
 * we want zero ripple into globals.css.
 */
export function ModernTemplate(props: TemplateProps) {
  return (
    <div
      className="modern-theme"
      style={
        {
          // Cool sage/charcoal palette. The Luxurious template reads these
          // variables for every gold accent (gradients, borders, text).
          "--accent": "#6B8E7E",
          "--accent-glow": "rgba(107, 142, 126, 0.32)",
          "--gold-100": "#A8C2B5",
          "--gold-300": "#7FA08E",
          "--gold-500": "#4F6B5E",
          "--border-gold": "rgba(127, 160, 142, 0.35)",
          "--surface-0": "#F5F4F1",
          "--surface-1": "#EAE8E2",
          "--surface-2": "#FFFFFF",
          "--surface-3": "#E0DDD6",
          "--foreground": "#1F2A26",
          "--foreground-soft": "#3F4A45",
          "--foreground-muted": "#6B7670",
          "--border": "rgba(31, 42, 38, 0.10)",
          "--border-strong": "rgba(31, 42, 38, 0.22)",
          "--input-bg": "rgba(31, 42, 38, 0.04)",
        } as React.CSSProperties
      }
    >
      <LuxuriousTemplate {...props} />
    </div>
  );
}
