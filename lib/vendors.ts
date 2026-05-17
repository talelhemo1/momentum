import type { Vendor, VendorType } from "./types";

/**
 * R37 — Removed ~332 seeded/demo vendors that weren't real businesses.
 * The catalog now contains ONLY verified, real vendors. New vendors will
 * populate it through the regular /vendors/join → approval flow.
 *
 * Kept as a tiny static seed so /vendors isn't empty at launch — just
 * honest. Every consumer already uses `.find()/.filter()/.length`, so a
 * 1-element array is safe (audited in R37 Block D).
 */

const v = (
  id: string,
  name: string,
  type: VendorType,
  region: Vendor["region"],
  rating: number,
  reviews: number,
  priceFrom: number,
  description: string,
  phone: string,
  inCatalog: boolean,
  tags: string[],
  socials?: { instagram?: string; facebook?: string; website?: string },
): Vendor => ({
  id,
  name,
  type,
  region,
  rating,
  reviews,
  priceFrom,
  description,
  phone,
  inCatalog,
  tags,
  ...(socials ?? {}),
});

// The one real, verified vendor (post-R37 cleanup).
// Real website supplied by the owner (R36+R37 re-issue). Phone is
// still a placeholder — owner to supply the real דפוס אומן number
// before launch.
export const VENDORS: Vendor[] = [
  v(
    "inv-dafus-uman-naharia",
    "דפוס אומן",
    "printing",
    "north",
    4.9,
    0,
    150,
    "בית דפוס בנהריה המתמחה בהזמנות לחתונות, חינות ואירועים. הדפסה איכותית על נייר יוקרתי, עם אפשרויות עיצוב מותאמות אישית.",
    "972-4-992-0000", // TODO(owner): real דפוס אומן phone before launch
    true,
    ["הזמנות", "הדפסה יוקרתית", "צפון", "נהריה"],
    {
      website: "https://www.ouman.co.il",
      // TODO(owner): real IG / FB for דפוס אומן if available
      instagram: undefined,
      facebook: undefined,
    },
  ),
];
