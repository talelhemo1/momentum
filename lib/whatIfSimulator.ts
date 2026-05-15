/**
 * R21 §C — "What If" simulator. Pure pricing model, agorot throughout.
 *
 * Venue is deliberately NON-linear: a premium hall for 50 guests is not
 * half the price of 100 — there's a large fixed component (the room,
 * staff, minimums) plus a per-head component. Meal & bar are per-head;
 * photography is essentially fixed per tier.
 */

export type VenueTier = "garden" | "midrange" | "premium" | "luxury";
export type MealOption = "single" | "double" | "buffet";
export type BarHours = 0 | 2 | 4 | 6;
export type PhotoTier = 1 | 2 | 3;
export type DecorTier = "basic" | "standard" | "lavish";
export type InvitationTier = "digital" | "printed" | "luxury";
export type PhotoExtra = "album" | "drone" | "magnets" | "sameDayEdit";

export interface SimulationInputs {
  guests: number;
  venueTier: VenueTier;
  mealOption: MealOption;
  barHours: BarHours;
  photoTier: PhotoTier;
  /** R23 — extra customization levers. */
  decorTier: DecorTier;
  invitationTier: InvitationTier;
  photoExtras: PhotoExtra[];
}

export interface SimulationResult {
  total_event: number; // agorot
  /** sim − baseline. Negative = the user saved money vs. now. */
  delta_from_baseline: number; // agorot
  per_guest: number; // agorot
  savings_equivalents: string[];
}

/** Venue: fixed base (agorot) + per-guest (agorot). */
const VENUE_MODEL: Record<VenueTier, { base: number; perGuest: number }> = {
  garden: { base: 1_500_000, perGuest: 8_000 },
  midrange: { base: 2_500_000, perGuest: 14_000 },
  premium: { base: 4_500_000, perGuest: 22_000 },
  luxury: { base: 8_000_000, perGuest: 35_000 },
};

/** Meal: per-guest agorot. */
const MEAL_PER_GUEST: Record<MealOption, number> = {
  single: 18_000,
  double: 28_000,
  buffet: 22_000,
};

/** Open bar: per-guest, per-hour agorot. */
const BAR_PER_GUEST_HOUR = 3_000;

/** Photography+video: fixed agorot per tier. */
const PHOTO_MODEL: Record<PhotoTier, number> = {
  1: 600_000,
  2: 1_100_000,
  3: 1_900_000,
};

/** R23 — décor + flowers: per-guest agorot. */
const DECOR_PER_GUEST: Record<DecorTier, number> = {
  basic: 2_500,
  standard: 6_000,
  lavish: 13_000,
};

/** R23 — invitations: fixed agorot. */
const INVITATION_MODEL: Record<InvitationTier, number> = {
  digital: 30_000,
  printed: 180_000,
  luxury: 450_000,
};

/** R23 — photography add-ons: fixed agorot each. */
const PHOTO_EXTRA_MODEL: Record<PhotoExtra, number> = {
  album: 180_000,
  drone: 120_000,
  magnets: 90_000,
  sameDayEdit: 150_000,
};

/** Biggest-first so the UI shows the most impressive equivalents. */
const SAVINGS_THRESHOLDS: Array<{ agorot: number; label: string }> = [
  { agorot: 5_000_000, label: "מקדמה לדירה ראשונה" }, // ₪50K
  { agorot: 2_000_000, label: "ירח דבש 5 כוכבים בקפריסין" }, // ₪20K
  { agorot: 1_000_000, label: "צלם דרגה 1 במקום דרגה 2" }, // ₪10K
  { agorot: 500_000, label: "DJ ידוע במקום סטנדרטי" }, // ₪5K
  { agorot: 200_000, label: "עיצוב פרחים פרימיום" }, // ₪2K
];

export function priceOf(inputs: SimulationInputs): number {
  const g = Math.max(1, inputs.guests);
  const venue =
    VENUE_MODEL[inputs.venueTier].base +
    VENUE_MODEL[inputs.venueTier].perGuest * g;
  const meal = MEAL_PER_GUEST[inputs.mealOption] * g;
  const bar = BAR_PER_GUEST_HOUR * inputs.barHours * g;
  const photo = PHOTO_MODEL[inputs.photoTier];
  const decor = DECOR_PER_GUEST[inputs.decorTier] * g;
  const invitations = INVITATION_MODEL[inputs.invitationTier];
  const extras = inputs.photoExtras.reduce(
    (a, e) => a + PHOTO_EXTRA_MODEL[e],
    0,
  );
  return venue + meal + bar + photo + decor + invitations + extras;
}

export function simulate(
  inputs: SimulationInputs,
  baseline: SimulationInputs,
): SimulationResult {
  const total = priceOf(inputs);
  const base = priceOf(baseline);
  const delta = total - base; // negative = saving
  const saved = Math.max(0, -delta);

  const equivalents = SAVINGS_THRESHOLDS.filter(
    (t) => saved >= t.agorot,
  ).map((t) => t.label);

  return {
    total_event: total,
    delta_from_baseline: delta,
    per_guest: Math.round(total / Math.max(1, inputs.guests)),
    savings_equivalents: equivalents.slice(0, 3),
  };
}

/** Marginal impact of one option, phrased for a tooltip (Hebrew). */
export function impactHint(field: keyof SimulationInputs): string {
  switch (field) {
    case "venueTier":
      return "אולם פרימיום מוסיף בממוצע ₪220 לאורח לעומת אולם בינוני.";
    case "mealOption":
      return "מנה שנייה מוסיפה ~₪100 לאורח; בופה באמצע.";
    case "barHours":
      return "כל שעת בר פתוח ≈ ₪30 לאורח.";
    case "photoTier":
      return "כל דרגת צילום ≈ ₪5,000–8,000 הפרש (סכום קבוע, לא לפי אורח).";
    case "decorTier":
      return "עיצוב מפואר מוסיף ~₪130 לאורח לעומת בסיסי (פרחים, מרכזי שולחן, תאורה).";
    case "invitationTier":
      return "הזמנות מודפסות ≈ ₪1,800; יוקרה ≈ ₪4,500; דיגיטלי כמעט חינם.";
    case "photoExtras":
      return "אלבום ₪1,800 · רחפן ₪1,200 · מגנטים ₪900 · עריכת Same-Day ₪1,500.";
    case "guests":
    default:
      return "הקטנת הרשימה משפיעה גם על אוכל, בר, עיצוב וחלק מהאולם.";
  }
}

export const VENUE_TIER_LABELS: Record<VenueTier, string> = {
  garden: "גן",
  midrange: "בינוני",
  premium: "פאר",
  luxury: "וילה",
};
export const MEAL_OPTION_LABELS: Record<MealOption, string> = {
  single: "מנה אחת",
  double: "שתי מנות",
  buffet: "בופה",
};
export const PHOTO_TIER_LABELS: Record<PhotoTier, string> = {
  1: "דרגה 1",
  2: "דרגה 2",
  3: "דרגה 3",
};
export const DECOR_TIER_LABELS: Record<DecorTier, string> = {
  basic: "בסיסי",
  standard: "סטנדרטי",
  lavish: "מפואר",
};
export const INVITATION_TIER_LABELS: Record<InvitationTier, string> = {
  digital: "דיגיטלי",
  printed: "מודפס",
  luxury: "יוקרה",
};
export const PHOTO_EXTRA_LABELS: Record<PhotoExtra, string> = {
  album: "אלבום",
  drone: "רחפן",
  magnets: "מגנטים",
  sameDayEdit: "עריכת Same-Day",
};
