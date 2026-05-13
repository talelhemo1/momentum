"use client";

import { LuxuriousTemplate, type TemplateProps } from "./LuxuriousTemplate";

/**
 * Rustic template — warm cream + terracotta accents. Same Luxurious layout,
 * different palette via CSS-variable override. The "gold gradient" text
 * still renders, but the variables now point at warm earth tones so the
 * page reads as organic / bohemian rather than luxe-black.
 */
export function RusticTemplate(props: TemplateProps) {
  return (
    <div
      className="rustic-theme"
      style={
        {
          "--accent": "#B85C38",
          "--accent-glow": "rgba(184, 92, 56, 0.30)",
          "--gold-100": "#E8B89A",
          "--gold-300": "#D08763",
          "--gold-500": "#8A4A2C",
          "--border-gold": "rgba(184, 92, 56, 0.35)",
          "--surface-0": "#FAF5EE",
          "--surface-1": "#F2E9D8",
          "--surface-2": "#FFFAF2",
          "--surface-3": "#E8DDC7",
          "--foreground": "#3C2A1E",
          "--foreground-soft": "#5C4633",
          "--foreground-muted": "#876C56",
          "--border": "rgba(60, 42, 30, 0.10)",
          "--border-strong": "rgba(60, 42, 30, 0.25)",
          "--input-bg": "rgba(60, 42, 30, 0.05)",
        } as React.CSSProperties
      }
    >
      <LuxuriousTemplate {...props} />
    </div>
  );
}
