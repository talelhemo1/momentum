/**
 * R23 — preset bottle catalog for the alcohol calculator.
 *
 * Common bottles on Israeli supermarket / event-supplier shelves with
 * rough 2026 mid-tier prices. The host picks specific bottles, tweaks
 * quantity/price, and the calculator can cost the bar from the *actual*
 * selection instead of the per-category heuristic.
 *
 * Pure data + pure helpers. No React, no DOM.
 */

export type DrinkCategory = "wine" | "beer" | "spirits" | "soft";

export const DRINK_CATEGORY_LABELS: Record<DrinkCategory, string> = {
  wine: "יין",
  beer: "בירה",
  spirits: "אלכוהול חזק",
  soft: "משקאות קלים",
};

export interface CatalogBottle {
  id: string;
  category: DrinkCategory;
  name: string;
  /** Estimated price for one container, ₪. */
  price: number;
  /** Servings the container yields (wine glasses, beer units, spirit
   *  pours, soft "servings" ≈ 0.33L each). */
  servings: number;
  /** Human label for the container. */
  unit: string;
}

/** Curated, realistic Israeli options. Prices are deliberately round
 *  estimates — every one is editable in the UI. */
export const BOTTLE_CATALOG: CatalogBottle[] = [
  // ── Wine (750ml ≈ 5 glasses) ──
  { id: "wine-table-red", category: "wine", name: "יין שולחן אדום", price: 38, servings: 5, unit: "בקבוק 750 מ״ל" },
  { id: "wine-table-white", category: "wine", name: "יין שולחן לבן", price: 38, servings: 5, unit: "בקבוק 750 מ״ל" },
  { id: "wine-midtier", category: "wine", name: "יין בוטיק (דרגת ביניים)", price: 65, servings: 5, unit: "בקבוק 750 מ״ל" },
  { id: "wine-sparkling", category: "wine", name: "יין מבעבע / פרוסקו", price: 55, servings: 6, unit: "בקבוק 750 מ״ל" },
  { id: "wine-premium", category: "wine", name: "יין פרימיום", price: 110, servings: 5, unit: "בקבוק 750 מ״ל" },

  // ── Beer ──
  { id: "beer-can-330", category: "beer", name: "בירה לאגר — פחית 330 מ״ל", price: 6, servings: 1, unit: "פחית" },
  { id: "beer-bottle-500", category: "beer", name: "בירה — בקבוק 500 מ״ל", price: 9, servings: 1, unit: "בקבוק" },
  { id: "beer-keg-30l", category: "beer", name: "חבית בירה 30 ליטר", price: 650, servings: 90, unit: "חבית" },
  { id: "beer-craft", category: "beer", name: "בירה קראפט — בקבוק", price: 14, servings: 1, unit: "בקבוק" },

  // ── Spirits (700ml; pours ≈ 14 long / 23 shots) ──
  { id: "spirits-vodka", category: "spirits", name: "וודקה (סטנדרט)", price: 95, servings: 14, unit: "בקבוק 700 מ״ל" },
  { id: "spirits-vodka-premium", category: "spirits", name: "וודקה פרימיום", price: 160, servings: 14, unit: "בקבוק 700 מ״ל" },
  { id: "spirits-whisky", category: "spirits", name: "ויסקי בלנדד", price: 130, servings: 14, unit: "בקבוק 700 מ״ל" },
  { id: "spirits-arak", category: "spirits", name: "ערק", price: 55, servings: 16, unit: "בקבוק 700 מ״ל" },
  { id: "spirits-gin", category: "spirits", name: "ג׳ין", price: 120, servings: 14, unit: "בקבוק 700 מ״ל" },
  { id: "spirits-tequila", category: "spirits", name: "טקילה", price: 140, servings: 16, unit: "בקבוק 700 מ״ל" },

  // ── Soft (1 "serving" ≈ 0.33L) ──
  { id: "soft-cola-1.5", category: "soft", name: "קולה / משקה תוסס 1.5 ליטר", price: 9, servings: 4, unit: "בקבוק 1.5 ל׳" },
  { id: "soft-juice-1.5", category: "soft", name: "מיץ טבעי 1.5 ליטר", price: 13, servings: 4, unit: "בקבוק 1.5 ל׳" },
  { id: "soft-water-1.5", category: "soft", name: "מים מינרליים 1.5 ליטר", price: 5, servings: 4, unit: "בקבוק 1.5 ל׳" },
  { id: "soft-sparkling", category: "soft", name: "מים בטעמים / סודה", price: 7, servings: 3, unit: "בקבוק 1 ל׳" },
];

export function catalogByCategory(cat: DrinkCategory): CatalogBottle[] {
  return BOTTLE_CATALOG.filter((b) => b.category === cat);
}

/** A line the user committed to: a catalog (or custom) bottle + qty +
 *  possibly edited price. */
export interface SelectedBottle {
  id: string;
  category: DrinkCategory;
  name: string;
  price: number; // editable
  servings: number; // editable
  unit: string;
  qty: number;
}

export interface CategoryCoverage {
  category: DrinkCategory;
  /** Servings the host needs for this category (from the heuristic). */
  needed: number;
  /** Servings the chosen bottles provide. */
  provided: number;
  /** ₪ of the chosen bottles. */
  cost: number;
  covered: boolean;
}

/** Coverage + cost per category from the user's explicit bottle picks. */
export function summarizeSelection(
  selected: SelectedBottle[],
  needByCategory: Record<DrinkCategory, number>,
): { byCategory: CategoryCoverage[]; totalCost: number } {
  const cats: DrinkCategory[] = ["wine", "beer", "spirits", "soft"];
  let totalCost = 0;
  const byCategory = cats.map((category) => {
    const lines = selected.filter((s) => s.category === category && s.qty > 0);
    const provided = lines.reduce((a, s) => a + s.servings * s.qty, 0);
    const cost = lines.reduce((a, s) => a + s.price * s.qty, 0);
    totalCost += cost;
    const needed = Math.ceil(needByCategory[category] || 0);
    return {
      category,
      needed,
      provided: Math.round(provided),
      cost: Math.round(cost),
      covered: provided >= needed,
    };
  });
  return { byCategory, totalCost: Math.round(totalCost) };
}
