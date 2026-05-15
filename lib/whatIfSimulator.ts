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

export interface SimulationInputs {
  guests: number;
  venueTier: VenueTier;
  mealOption: MealOption;
  barHours: BarHours;
  photoTier: PhotoTier;
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
  return venue + meal + bar + photo;
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
    case "guests":
    default:
      return "הקטנת הרשימה משפיעה גם על אוכל, בר וחלק מהאולם.";
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
