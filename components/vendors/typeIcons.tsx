"use client";

import {
  Building2,
  Camera,
  Music,
  Video,
  GlassWater,
  Utensils,
  Flower2,
  Sparkles,
  Mic2,
  Brush,
  Shirt,
  BookOpen,
  PartyPopper,
  Car,
  Cake,
  Zap,
  Plane,
  Baby,
  Shield,
  Wand2,
  Lightbulb,
  Mail,
  Signpost,
  Martini,
  ScanLine,
  Megaphone,
} from "lucide-react";
import type { VendorType } from "@/lib/types";

/**
 * Single source of truth for the icon associated with each VendorType.
 * Co-located with the vendors UI so adding a new type means adding one entry
 * here + one in `VENDOR_TYPE_LABELS`. Used by VendorCard, CategoryRail, and
 * VendorQuickLook.
 */
export function vendorTypeIcon(type: VendorType, size = 20): React.ReactNode {
  const props = { size } as const;
  switch (type) {
    case "venue":
      return <Building2 {...props} />;
    case "photography":
      return <Camera {...props} />;
    case "videography":
      return <Video {...props} />;
    case "dj":
      return <Music {...props} />;
    case "band":
      return <Mic2 {...props} />;
    case "social":
      return <Video {...props} />;
    case "alcohol":
      return <GlassWater {...props} />;
    case "catering":
      return <Utensils {...props} />;
    case "florist":
      return <Flower2 {...props} />;
    case "designer":
      return <Sparkles {...props} />;
    case "rabbi":
      return <BookOpen {...props} />;
    case "makeup":
      return <Brush {...props} />;
    case "dress":
      return <Shirt {...props} />;
    case "entertainment":
      return <PartyPopper {...props} />;
    case "transportation":
      return <Car {...props} />;
    case "sweets":
      return <Cake {...props} />;
    case "fx":
      return <Zap {...props} />;
    case "drone":
      return <Plane {...props} />;
    case "kids":
      return <Baby {...props} />;
    case "security":
      return <Shield {...props} />;
    case "magician":
      return <Wand2 {...props} />;
    case "lighting":
      return <Lightbulb {...props} />;
    case "stationery":
      return <Mail {...props} />;
    case "signage":
      return <Signpost {...props} />;
    case "cocktail":
      return <Martini {...props} />;
    case "photobooth":
      return <ScanLine {...props} />;
    case "hosting":
      return <Megaphone {...props} />;
  }
}

/** Brand glyphs for Instagram/Facebook — lucide-react no longer ships these. */
export function InstagramGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function FacebookGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
