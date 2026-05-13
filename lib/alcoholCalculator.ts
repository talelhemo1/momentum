/**
 * Alcohol calculator for Israeli events.
 *
 * Two layers of control:
 *
 *   1. **Quick mode** — pick a `DrinkingProfile` and a `BarStyle`. Each is a
 *      preset of more granular knobs. Friendly for hosts who just want a
 *      number to plug into their shopping list.
 *
 *   2. **Advanced mode** — override anything: drinks per adult per hour,
 *      category split percentages, servings per container, unit prices.
 *      Useful when the host already has a catering quote and wants to
 *      cross-check it, or when the event isn't a "standard" Israeli wedding.
 *
 * Everything funnels into `calculateAlcohol(input)`. The presets are exposed
 * as functions (`profileToDrinksPerHour`, `barStyleToShares`, etc.) so the UI
 * can show their numeric values and let the user tweak them in place.
 */

export type DrinkingProfile = "light" | "moderate" | "heavy";
export type BarStyle = "full" | "wine-beer" | "soft-only";

export const PROFILE_LABELS: Record<DrinkingProfile, string> = {
  light: "קל",
  moderate: "ממוצע",
  heavy: "כבד",
};

export const PROFILE_DESCRIPTIONS: Record<DrinkingProfile, string> = {
  light: "אורחים שותים בעיקר משקאות קלים, מעט יין",
  moderate: "מסיבה ישראלית טיפוסית — שתייה משולבת",
  heavy: "אווירה של מסיבה רצינית, אלכוהול חזק זורם",
};

export const BAR_STYLE_LABELS: Record<BarStyle, string> = {
  full: "בר מלא (יין, בירה, אלכוהול חזק, קלים)",
  "wine-beer": "יין + בירה + קלים",
  "soft-only": "משקאות קלים בלבד",
};

/** Drinks per adult per hour — the heart of the math. */
export const PROFILE_DRINKS_PER_HOUR: Record<DrinkingProfile, number> = {
  light: 0.6,
  moderate: 1.0,
  heavy: 1.5,
};

export interface CategoryShares {
  /** Wine share of total drinks (0..1). */
  wine: number;
  /** Beer share of total drinks (0..1). */
  beer: number;
  /** Hard liquor (vodka, whiskey, etc.) share of total drinks (0..1). */
  spirits: number;
  /** Soft drinks share. The four shares should sum to ~1.0; the calculator
   *  doesn't normalize automatically — letting them sum to <1 effectively
   *  "leaves slack" the host plans to cover with something else. */
  soft: number;
}

/** Default category split per bar style. Numbers tuned to mid-tier Israeli
 *  weddings/halls; the host can edit them in advanced mode. */
export const BAR_STYLE_SHARES: Record<BarStyle, CategoryShares> = {
  full: { wine: 0.35, beer: 0.40, spirits: 0.15, soft: 0.10 },
  "wine-beer": { wine: 0.45, beer: 0.45, spirits: 0, soft: 0.10 },
  "soft-only": { wine: 0, beer: 0, spirits: 0, soft: 1.0 },
};

export interface ServingsPerContainer {
  /** Glasses per 750ml wine bottle. Industry standard ≈ 5 (150ml each). */
  wine: number;
  /** Drinks per beer container. 1 if you're counting cans/bottles, 4 if
   *  you're counting 1.5L sharing bottles. */
  beer: number;
  /** Pours per 700ml hard liquor bottle. ≈ 14 long-pours of ~50ml,
   *  ≈ 23 shots of 30ml. Default leans event-style (long pours). */
  spirits: number;
}

export const DEFAULT_SERVINGS: ServingsPerContainer = {
  wine: 5,
  beer: 1,
  spirits: 14,
};

export interface UnitPrices {
  /** Per 750ml wine bottle (NIS, mid-tier supermarket 2026). */
  wine: number;
  /** Per single beer can/bottle (NIS). */
  beer: number;
  /** Per 700ml hard liquor bottle (NIS, mid-tier). */
  spirits: number;
  /** Per liter of soft drinks (NIS). */
  soft: number;
}

export const DEFAULT_UNIT_PRICES: UnitPrices = {
  wine: 65,
  beer: 7,
  spirits: 130,
  soft: 9,
};

/**
 * Soft-drink consumption per guest. Per-hour because longer events drive
 * more thirst (and people swap alcohol for soda as the night wears on).
 * The number is tuned for Israeli halls with table jugs of cola/water.
 */
export const SOFT_LITERS_PER_GUEST_PER_HOUR = {
  /** When the bar serves alcohol — soda is "alongside", not the main thing. */
  withAlcohol: 0.125,
  /** Soft-only events — soda is the whole show. */
  softOnly: 0.5,
};

export interface AlcoholInput {
  /** Adults expected (children excluded — they don't drink alcohol). */
  adultHeads: number;
  /** Total expected attendees (adults + kids) — drives soft drinks math. */
  totalHeads: number;
  /** Length of the event in hours. */
  hours: number;
  /** Drinks per adult per hour. Set directly OR derive from a profile via
   *  `PROFILE_DRINKS_PER_HOUR`. */
  drinksPerHour: number;
  /** How total drinks split across categories. Derive from `BAR_STYLE_SHARES`
   *  in quick mode, or set directly in advanced mode. */
  shares: CategoryShares;
  /** Servings per container (lets the host say "I'm buying 1.5L beer
   *  bottles, 4 servings each" instead of cans). */
  servings?: Partial<ServingsPerContainer>;
  /** Optional override of unit prices. */
  prices?: Partial<UnitPrices>;
  /** Whether the event is "soft only" — drives the higher soft-drink rate.
   *  We don't infer from `shares` because a host could legitimately set
   *  alcohol shares to 0 without intending the bigger soft-drink spike. */
  softOnly?: boolean;
}

export interface AlcoholBreakdown {
  totalDrinks: number;
  wine: { bottles: number; glasses: number; cost: number };
  beer: { cans: number; sixPacks: number; cost: number };
  spirits: { bottles: number; servings: number; cost: number };
  soft: { liters: number; cost: number };
  totalCost: number;
}

export function calculateAlcohol(input: AlcoholInput): AlcoholBreakdown {
  const adults = Math.max(0, input.adultHeads);
  const total = Math.max(0, input.totalHeads);
  const hours = Math.max(1, input.hours);
  const drinksPerHour = Math.max(0, input.drinksPerHour);
  const totalDrinks = adults * hours * drinksPerHour;
  const shares = input.shares;
  const servings: ServingsPerContainer = { ...DEFAULT_SERVINGS, ...input.servings };
  const prices: UnitPrices = { ...DEFAULT_UNIT_PRICES, ...input.prices };

  // Wine — round UP so we never short the host.
  const wineGlasses = totalDrinks * shares.wine;
  const wineBottles = wineGlasses > 0 ? Math.ceil(wineGlasses / Math.max(1, servings.wine)) : 0;

  // Beer — assume one container per serving by default (cans).
  const beerServings = totalDrinks * shares.beer;
  const beerCans = beerServings > 0 ? Math.ceil(beerServings / Math.max(1, servings.beer)) : 0;
  const beerSixPacks = Math.ceil(beerCans / 6);

  // Spirits — 1 bottle per ~14 servings by default.
  const spiritsServings = totalDrinks * shares.spirits;
  const spiritsBottles =
    spiritsServings > 0 ? Math.ceil(spiritsServings / Math.max(1, servings.spirits)) : 0;

  // Soft drinks — explicit per-guest-per-hour rate (advanced mode can edit).
  const softRate = input.softOnly
    ? SOFT_LITERS_PER_GUEST_PER_HOUR.softOnly
    : SOFT_LITERS_PER_GUEST_PER_HOUR.withAlcohol;
  const softLiters = Math.ceil(total * hours * softRate);

  const wineCost = wineBottles * prices.wine;
  const beerCost = beerCans * prices.beer;
  const spiritsCost = spiritsBottles * prices.spirits;
  const softCost = softLiters * prices.soft;

  return {
    totalDrinks: Math.round(totalDrinks * 10) / 10,
    wine: { bottles: wineBottles, glasses: Math.ceil(wineGlasses), cost: wineCost },
    beer: { cans: beerCans, sixPacks: beerSixPacks, cost: beerCost },
    spirits: { bottles: spiritsBottles, servings: Math.ceil(spiritsServings), cost: spiritsCost },
    soft: { liters: softLiters, cost: softCost },
    totalCost: wineCost + beerCost + spiritsCost + softCost,
  };
}

/** Convenience: build the full input from a quick-mode preset selection. */
export function inputFromPreset(args: {
  adultHeads: number;
  totalHeads: number;
  hours: number;
  profile: DrinkingProfile;
  barStyle: BarStyle;
  servings?: Partial<ServingsPerContainer>;
  prices?: Partial<UnitPrices>;
}): AlcoholInput {
  return {
    adultHeads: args.adultHeads,
    totalHeads: args.totalHeads,
    hours: args.hours,
    drinksPerHour: PROFILE_DRINKS_PER_HOUR[args.profile],
    shares: BAR_STYLE_SHARES[args.barStyle],
    servings: args.servings,
    prices: args.prices,
    softOnly: args.barStyle === "soft-only",
  };
}
