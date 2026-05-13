import type { VendorType, EventType } from "./types";

/** Build an Unsplash image URL from a known photo ID. */
const u = (id: string, w = 800, h = 600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

/** Curated, evergreen Unsplash photo IDs per vendor category. */
export const VENDOR_IMAGES: Record<VendorType, string[]> = {
  venue: [
    u("1519225421980-715cb0215aed", 800, 600),
    u("1464366400600-7168b8af9bc3", 800, 600),
    u("1470229722913-7c0e2dbbafd3", 800, 600),
    u("1505236858219-8359eb29e329", 800, 600),
  ],
  photography: [
    u("1606216794074-735e91aa2c92", 800, 600),
    u("1452860606245-08befc0ff44b", 800, 600),
    u("1529636798458-92182e662485", 800, 600),
    u("1519741497674-611481863552", 800, 600),
  ],
  videography: [
    u("1519741497674-611481863552", 800, 600),
    u("1488161628813-04466f872be2", 800, 600),
  ],
  dj: [
    u("1493225457124-a3eb161ffa5f", 800, 600),
    u("1429962714451-bb934ecdc4ec", 800, 600),
    u("1505236858219-8359eb29e329", 800, 600),
  ],
  band: [
    u("1501386761578-eac5c94b800a", 800, 600),
    u("1429962714451-bb934ecdc4ec", 800, 600),
  ],
  social: [
    u("1485846234645-a62644f84728", 800, 600),
    u("1607082348824-0a96f2a4b9da", 800, 600),
    u("1606216794074-735e91aa2c92", 800, 600),
  ],
  alcohol: [
    u("1551024709-8f23befc6f87", 800, 600),
    u("1514362545857-3bc16c4c7d1b", 800, 600),
    u("1470337458703-46ad1756a187", 800, 600),
  ],
  catering: [
    u("1555244162-803834f70033", 800, 600),
    u("1414235077428-338989a2e8c0", 800, 600),
    u("1567620905732-2d1ec7ab7445", 800, 600),
  ],
  florist: [
    u("1487530811176-3780de880c2d", 800, 600),
    u("1462275646964-a0e3386b89fa", 800, 600),
    u("1519225421980-715cb0215aed", 800, 600),
  ],
  designer: [
    u("1519225421980-715cb0215aed", 800, 600),
    u("1464366400600-7168b8af9bc3", 800, 600),
  ],
  rabbi: [
    u("1519677584237-752f8853252e", 800, 600),
    u("1531058020387-3be344556be6", 800, 600),
  ],
  makeup: [
    u("1487412947147-5cebf100ffc2", 800, 600),
    u("1457972729786-0411a3b2b626", 800, 600),
  ],
  dress: [
    u("1606216794074-735e91aa2c92", 800, 600),
    u("1519741497674-611481863552", 800, 600),
  ],
  entertainment: [
    u("1429962714451-bb934ecdc4ec", 800, 600),
    u("1501386761578-eac5c94b800a", 800, 600),
    u("1505236858219-8359eb29e329", 800, 600),
  ],
  transportation: [
    u("1503376780353-7e6692767b70", 800, 600),
    u("1492144534655-ae79c964c9d7", 800, 600),
    u("1494976388531-d1058494cdd8", 800, 600),
  ],
  sweets: [
    u("1486427944299-d1955d23e34d", 800, 600),
    u("1551024601-bec78aea704b", 800, 600),
    u("1567620905732-2d1ec7ab7445", 800, 600),
  ],
  fx: [
    u("1505236858219-8359eb29e329", 800, 600),
    u("1493225457124-a3eb161ffa5f", 800, 600),
    u("1470229722913-7c0e2dbbafd3", 800, 600),
  ],
  // ─── 2026 expansion ───
  // Each list reuses curated event-context Unsplash IDs so we don't ship 30
  // new external image dependencies. The existing CSP already allows
  // images.unsplash.com.
  drone: [
    u("1531048124700-31c0c5b7caa3", 800, 600),
    u("1473968512647-3e447244af8f", 800, 600),
    u("1518173946687-a4c8892bbd9f", 800, 600),
  ],
  kids: [
    u("1503454537195-1dcabb73ffb9", 800, 600),
    u("1444703686981-a3abbc4d4fe3", 800, 600),
    u("1559008264-cb14ddc1138a", 800, 600),
  ],
  security: [
    u("1581090700227-1e8e6def2c84", 800, 600),
    u("1518709268805-4e9042af2176", 800, 600),
  ],
  magician: [
    u("1542451155-bbd8c9d12c46", 800, 600),
    u("1497032628192-86f99bcd76bc", 800, 600),
    u("1485846234645-a62644f84728", 800, 600),
  ],
  lighting: [
    u("1495020689067-958852a7765e", 800, 600),
    u("1470229722913-7c0e2dbbafd3", 800, 600),
    u("1505236858219-8359eb29e329", 800, 600),
  ],
  stationery: [
    u("1583395145-9f29b4e58ad7", 800, 600),
    u("1517242810446-cc8951b2be40", 800, 600),
    u("1516205651411-aef33a44f7c2", 800, 600),
  ],
  signage: [
    u("1556910103-1c02745aae4d", 800, 600),
    u("1517488629074-6bbd8d3d5c66", 800, 600),
  ],
  cocktail: [
    u("1551024709-8f23befc6f87", 800, 600),
    u("1470337458703-46ad1756a187", 800, 600),
    u("1551024601-bec78aea704b", 800, 600),
  ],
  photobooth: [
    u("1488161628813-04466f872be2", 800, 600),
    u("1507537297725-24a1c029d3ca", 800, 600),
    u("1606216794074-735e91aa2c92", 800, 600),
  ],
  hosting: [
    u("1485846234645-a62644f84728", 800, 600),
    u("1531058020387-3be344556be6", 800, 600),
    u("1429962714451-bb934ecdc4ec", 800, 600),
  ],
  // Reuse the stationery stack — print houses sit visually adjacent to
  // invitation studios. When real vendor photos arrive these can be
  // replaced per-vendor (vendorImageFor only kicks in as a fallback).
  printing: [
    u("1583395145-9f29b4e58ad7", 800, 600),
    u("1517242810446-cc8951b2be40", 800, 600),
    u("1516205651411-aef33a44f7c2", 800, 600),
  ],
};

/** Pick an image deterministically by index — keeps card images stable across renders. */
export function vendorImageFor(type: VendorType, index: number): string {
  const list = VENDOR_IMAGES[type];
  return list[index % list.length];
}

/** Hero polaroid imagery — small, evocative event scenes. */
export const HERO_POLAROIDS = [
  { src: u("1519741497674-611481863552", 600, 700), label: "החופה" },
  { src: u("1519225421980-715cb0215aed", 600, 700), label: "האולם" },
  { src: u("1464366400600-7168b8af9bc3", 600, 700), label: "הריקודים" },
  { src: u("1487530811176-3780de880c2d", 600, 700), label: "הפרחים" },
];

/** Inspiration gallery — real event photos with hand-picked categories. */
export interface GalleryImage {
  src: string;
  label: string;
  span?: "wide" | "tall" | "regular";
}

export const INSPIRATION_GALLERY: GalleryImage[] = [
  { src: u("1519741497674-611481863552", 900, 1200), label: "חופה תחת הכוכבים", span: "tall" },
  { src: u("1464366400600-7168b8af9bc3", 800, 600), label: "ריקוד ראשון" },
  { src: u("1487530811176-3780de880c2d", 800, 600), label: "פרחים שלא ישכחו" },
  { src: u("1505236858219-8359eb29e329", 1200, 600), label: "אורות לילה", span: "wide" },
  { src: u("1519225421980-715cb0215aed", 800, 600), label: "האולם המושלם" },
  { src: u("1493225457124-a3eb161ffa5f", 800, 600), label: "DJ לוהט" },
  { src: u("1555244162-803834f70033", 800, 600), label: "תפריט שף" },
  { src: u("1606216794074-735e91aa2c92", 900, 1200), label: "רגעי קסם", span: "tall" },
];

/** Hero background imagery per event type — used in dashboard hero card. */
export const EVENT_HERO_IMAGE: Record<EventType, string> = {
  wedding: u("1519741497674-611481863552", 1400, 700),
  "bar-mitzvah": u("1531058020387-3be344556be6", 1400, 700),
  "bat-mitzvah": u("1464366400600-7168b8af9bc3", 1400, 700),
  "shabbat-chatan": u("1519677584237-752f8853252e", 1400, 700),
  brit: u("1531058020387-3be344556be6", 1400, 700),
  engagement: u("1606216794074-735e91aa2c92", 1400, 700),
  birthday: u("1464366400600-7168b8af9bc3", 1400, 700),
  corporate: u("1505236858219-8359eb29e329", 1400, 700),
  other: u("1464366400600-7168b8af9bc3", 1400, 700),
};
