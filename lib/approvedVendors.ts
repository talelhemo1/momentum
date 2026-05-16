import type { Vendor, VendorType, Region } from "./types";

/**
 * R38 — map an APPROVED `vendor_applications` row (returned by the
 * `list_approved_vendors` RPC — public-safe columns only) into the
 * `Vendor` shape the catalog UI renders.
 *
 * Pure + isomorphic. Never throws — a bad row maps to a usable card or
 * is skipped by the caller.
 */

export interface ApprovedVendorRow {
  id: string;
  business_name: string;
  category: string;
  city: string | null;
  about: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  created_at: string | null;
}

// VendorApplication category id → catalog VendorType. Mirrors the
// mapping documented in app/api/vendors/admin/decide/route.ts.
const CATEGORY_TO_TYPE: Record<string, VendorType> = {
  venue: "venue",
  catering: "catering",
  photography: "photography",
  videography: "videography",
  "music-dj": "dj",
  rabbi: "rabbi",
  "makeup-hair": "makeup",
  bridal: "dress",
  groomswear: "dress",
  florist: "florist",
  invitations: "stationery",
  printing: "printing",
  chuppah: "designer",
  transport: "transportation",
  other: "entertainment", // no 1:1 VendorType — closest generic bucket
};

// Free-text city → Region. Heuristic (substring match); region is a
// soft filter, so an imperfect guess just affects default sort, never
// correctness. Unknown → "tel-aviv" (the broadest "מרכז" bucket).
const CITY_REGION_RULES: Array<[RegExp, Region]> = [
  [/תל.?אביב|ת"א|רמת.?גן|גבעתיים|חולון|בת.?ים|ראשון|אזור|יפו/, "tel-aviv"],
  [/ירושלים|בית.?שמש|מבשרת|מעלה.?אדומים/, "jerusalem"],
  [/חיפה|קריות|קריית|נשר|טירת.?כרמל/, "haifa"],
  [/נהריה|עכו|כרמיאל|צפת|טבריה|קריית.?שמונה|גליל|עפולה|נצרת|מגדל.?העמק|כרמל/, "north"],
  [/באר.?שבע|אילת|דימונה|אופקים|נתיבות|שדרות|נגב|ערד/, "south"],
  [/נתניה|הרצליה|כפר.?סבא|רעננה|הוד.?השרון|השרון|רמת.?השרון|כפר.?יונה/, "sharon"],
  [/רחובות|נס.?ציונה|יבנה|לוד|רמלה|מודיעין|גדרה|שפלה|קרית.?עקרון/, "shfela"],
];

function regionFromCity(city: string | null | undefined): Region {
  const c = (city ?? "").trim();
  if (c) {
    for (const [re, region] of CITY_REGION_RULES) {
      if (re.test(c)) return region;
    }
  }
  return "tel-aviv";
}

function cleanHandle(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim();
  return s ? s : undefined;
}

export function mapApprovedRowToVendor(row: ApprovedVendorRow): Vendor {
  const type = CATEGORY_TO_TYPE[row.category] ?? "entertainment";
  const city = (row.city ?? "").trim();
  return {
    // `app-` prefix keeps DB-backed ids distinct from the static seed.
    id: `app-${row.id}`,
    name: row.business_name,
    type,
    region: regionFromCity(city),
    rating: 0,
    reviews: 0, // 0 → VendorCard shows the honest "ספק חדש" badge (R37)
    priceFrom: 0, // applications don't capture price; UI handles 0
    description:
      (row.about ?? "").trim() ||
      `ספק מאומת${city ? ` · ${city}` : ""} שהצטרף דרך Momentum.`,
    phone: "", // never expose applicant phone here (PII) — contact via site/IG
    inCatalog: true,
    tags: ["ספק חדש", ...(city ? [city] : [])],
    website: cleanHandle(row.website),
    instagram: cleanHandle(row.instagram),
    facebook: cleanHandle(row.facebook),
  };
}

export function mapApprovedRows(rows: ApprovedVendorRow[]): Vendor[] {
  const out: Vendor[] = [];
  for (const r of rows) {
    try {
      if (r && r.id && r.business_name) out.push(mapApprovedRowToVendor(r));
    } catch {
      /* skip a malformed row — never break the catalog */
    }
  }
  return out;
}
