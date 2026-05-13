/**
 * Vendor ranking + sorting helpers — extracted from app/vendors/page.tsx so
 * the page component stays focused on presentation, and so the same scoring
 * functions can be reused by `/compare`, "ספקים דומים" in QuickLook, and any
 * future "smart picks" surface.
 *
 * Pure functions only (no React, no localStorage). Easy to unit-test if we
 * add vitest later.
 */

import type { Region, Vendor, VendorType } from "./types";

/** Sort modes the user can pick on /vendors. */
export type SortMode = "recommended" | "closest" | "cheapest" | "expensive";

export const SORT_LABELS: Record<SortMode, string> = {
  recommended: "מומלצים",
  closest: "הכי קרובים",
  cheapest: "הזולים ביותר",
  expensive: "היקרים ביותר",
};

/**
 * Adjacency map for the "closest" sort. A vendor in the user's region scores
 * 3, an adjacent region 2, anywhere else 1. Tweaking this is the cheapest way
 * to change "closeness" feel without touching the algorithm.
 */
const ADJACENT: Record<Region, Region[]> = {
  "tel-aviv": ["sharon", "shfela"],
  sharon: ["tel-aviv", "haifa"],
  shfela: ["tel-aviv", "jerusalem"],
  jerusalem: ["shfela"],
  haifa: ["sharon", "north"],
  north: ["haifa"],
  south: ["negev"],
  negev: ["south"],
};

export function proximityScore(vendor: Vendor, userRegion: Region | undefined): number {
  if (!userRegion) return 1;
  if (vendor.region === userRegion) return 3;
  if (ADJACENT[userRegion]?.includes(vendor.region)) return 2;
  return 1;
}

/**
 * Recommended-sort score. In-catalog ⇒ +1, then add rating + log-scaled
 * review count so a 4.9 with 200 reviews beats a 4.95 with 5 reviews.
 */
export function recommendedScore(vendor: Vendor): number {
  return (
    (vendor.inCatalog ? 1 : 0) +
    vendor.rating +
    Math.log(vendor.reviews + 1) * 0.5
  );
}

/**
 * Sort a vendor list by mode. Caller already filtered by category/region/etc.
 * Pure: returns a NEW array, leaves the input untouched.
 */
export function sortVendors(
  vendors: Vendor[],
  mode: SortMode,
  userRegion: Region | undefined,
): Vendor[] {
  const list = [...vendors];
  switch (mode) {
    case "closest":
      return list.sort((a, b) => {
        const score = proximityScore(b, userRegion) - proximityScore(a, userRegion);
        return score !== 0 ? score : b.rating - a.rating;
      });
    case "cheapest":
      return list.sort((a, b) => a.priceFrom - b.priceFrom);
    case "expensive":
      return list.sort((a, b) => b.priceFrom - a.priceFrom);
    case "recommended":
    default:
      return list.sort((a, b) => recommendedScore(b) - recommendedScore(a));
  }
}

export interface VendorFilters {
  region: Region | "all";
  type: VendorType | "all";
  search: string;
  /** Hard cap on `priceFrom`; null = no limit. */
  maxPrice: number | null;
  catalogOnly: boolean;
}

export const EMPTY_FILTERS: VendorFilters = {
  region: "all",
  type: "all",
  search: "",
  maxPrice: null,
  catalogOnly: false,
};

/** Apply filter shape to a list. Used by the page AND by the active-pill row. */
export function filterVendors(vendors: Vendor[], f: VendorFilters): Vendor[] {
  const q = f.search.trim().toLowerCase();
  return vendors.filter((v) => {
    if (f.region !== "all" && v.region !== f.region) return false;
    if (f.type !== "all" && v.type !== f.type) return false;
    if (f.maxPrice !== null && v.priceFrom > f.maxPrice) return false;
    if (f.catalogOnly && !v.inCatalog) return false;
    if (q) {
      if (
        !v.name.toLowerCase().includes(q) &&
        !v.description.toLowerCase().includes(q) &&
        !v.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });
}

/**
 * "Vendors similar to X" — same type, top-3 by recommended score, excluding
 * the input itself. Used by VendorQuickLook.
 */
export function similarVendors(
  pool: Vendor[],
  to: Vendor,
  limit = 3,
): Vendor[] {
  return pool
    .filter((v) => v.id !== to.id && v.type === to.type)
    .sort((a, b) => recommendedScore(b) - recommendedScore(a))
    .slice(0, limit);
}
