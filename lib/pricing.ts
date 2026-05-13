/**
 * Pricing tiers — couples-side and free.
 * Vendor tiers live in lib/vendorApplication.ts (3 sub-tiers monthly).
 *
 * IMPORTANT: every feature listed here MUST be implemented in the codebase.
 * Do not list AI invitations, push notifications, or export-to-Excel until
 * they exist.
 *
 * R13 — emoji-free copy. The pricing page renders pure typography + lucide
 * iconography for a high-end visual. The `emoji` field on the tier type was
 * dropped (no UI surface read it) and feature/notIncluded strings are now
 * plain Hebrew, with optional em-dash structure for hierarchy.
 */

export type CoupleTier = "free" | "premium";

export interface CouplePricingTier {
  id: CoupleTier;
  label: string;
  priceILS: number;
  priceLabel: string;
  priceSubLabel?: string;
  tagline: string;
  features: string[];
  notIncluded?: string[];
  recommended?: boolean;
  ctaLabel: string;
  ctaHref: string;
}

export const COUPLE_TIERS: CouplePricingTier[] = [
  {
    id: "free",
    label: "חינם",
    priceILS: 0,
    priceLabel: "חינם",
    priceSubLabel: "לתמיד · ללא כרטיס אשראי",
    tagline: "להתנסות בלי להתחייב",
    features: [
      "עד 30 אורחים",
      "שליחת הזמנות בוואצאפ עם token חתום",
      "מעקב RSVP בזמן אמת",
      "סידור הושבה ידני",
      "צ'קליסט מותאם לסוג האירוע",
      "גישה לקטלוג של 333 ספקים",
      "עד 10 ספקים ברשימה האישית",
      "מחשבון אלכוהול ומשקאות",
      "צ'אטבוט אישי — 5 שאלות ביום",
    ],
    notIncluded: [
      "סידור הושבה חכם אוטומטי",
      "מצב יום-האירוע עם Memory Album",
      "צ'אטבוט מלא — 100 שאלות ביום",
      "ניהול ספקים ללא הגבלה",
      "סנכרון בין מכשירים בענן",
    ],
    ctaLabel: "התחל חינם",
    ctaHref: "/onboarding?gate=ok&plan=free",
  },
  {
    id: "premium",
    label: "פרימיום לזוגות",
    priceILS: 399,
    priceLabel: "₪399",
    priceSubLabel: "חד-פעמי לאירוע · ללא מנוי חודשי",
    tagline: "כל הכלים, ללא הגבלות, עד אחרי האירוע",
    recommended: true,
    features: [
      "אורחים ללא הגבלה",
      "שליחת הזמנות בוואצאפ ומעקב RSVP",
      "סידור הושבה חכם אוטומטי לפי קבוצות",
      "ניהול ספקים ללא הגבלה — מחיר, פגישות, מקדמות, דירוג",
      "מצב יום-האירוע עם Memory Album משותף",
      "Find My Table — אורחים מאתרים את עצמם במסך הגדול",
      "צ'אטבוט אישי מלא — 100 שאלות ביום",
      "מחשבון אלכוהול עם הערכת עלות",
      "ניהול מספר אירועים במקביל",
      "סנכרון בין מכשירים בענן",
      "תמיכה מועדפת",
    ],
    ctaLabel: "קח את הפרימיום ₪399",
    ctaHref: "/onboarding?gate=ok&plan=premium",
  },
];

export function getCoupleTier(id: string): CouplePricingTier {
  const tier = COUPLE_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown couple tier: ${id}`);
  return tier;
}

/** Default-selected tier in any picker UI. /start uses this so the gate
 *  shows premium selected by default (the "recommended" path). */
export function getRecommendedCoupleTier(): CouplePricingTier {
  return COUPLE_TIERS.find((t) => t.recommended) ?? COUPLE_TIERS[0];
}
