/**
 * R21 §A — "How much does a guest REALLY cost me?"
 *
 * Pure calculation. No React, no DOM. All money is in **agorot** (₪1 =
 * 100 agorot) so we never accumulate floating-point drift across seven
 * categories.
 *
 * Data-shape note: the R21 brief sketched `state.budget.total /
 * state.budget.items`, but the real AppState is `budget: BudgetItem[]`
 * (shekels per line) with the overall cap on `event.budgetTotal`. The
 * logic below is mapped onto the *actual* shape.
 */
import type { AppState, BudgetItem, BudgetCategory } from "@/lib/types";

export interface RealCostBreakdown {
  total_per_guest: number; // agorot
  total_event: number; // agorot
  guests_count: number;
  /** Whether the numbers came from the user's real budget lines (true)
   *  or fell back to Israeli market benchmarks (false). */
  from_real_budget: boolean;
  breakdown: {
    food: number; // קייטרינג
    alcohol: number; // אלכוהול ושתייה
    venue: number; // אולם (מחולק למוזמן)
    photography: number; // צלם + וידאו
    music: number; // DJ / להקה
    decor: number; // עיצוב + פרחים
    overhead: number; // טיפים, חניה, +1, גיפט לספקים
  };
  insights: string[]; // 2-3 smart notes
}

export type CostTier = "low" | "mid" | "high" | "luxury";

/** Per-guest agorot benchmarks for the Israeli market (₪ ×100). */
const ISRAELI_BENCHMARKS_AGOROT: Record<
  keyof RealCostBreakdown["breakdown"],
  Record<CostTier, number>
> = {
  food: { low: 18000, mid: 28000, high: 42000, luxury: 60000 },
  alcohol: { low: 6000, mid: 12000, high: 18000, luxury: 26000 },
  venue: { low: 12000, mid: 22000, high: 35000, luxury: 55000 },
  photography: { low: 4000, mid: 9000, high: 15000, luxury: 24000 },
  music: { low: 2000, mid: 5500, high: 10000, luxury: 18000 },
  decor: { low: 1500, mid: 4500, high: 9000, luxury: 16000 },
  overhead: { low: 2500, mid: 4500, high: 7500, luxury: 12000 },
};

type Bucket = keyof RealCostBreakdown["breakdown"];

const emptyBreakdown = (): RealCostBreakdown["breakdown"] => ({
  food: 0,
  alcohol: 0,
  venue: 0,
  photography: 0,
  music: 0,
  decor: 0,
  overhead: 0,
});

/** Best-known cost of a single budget line, in agorot. */
function lineAgorot(item: BudgetItem): number {
  const shekels = item.actual ?? item.estimated ?? 0;
  return Math.round(shekels * 100);
}

const ALCOHOL_RE =
  /אלכוהול|שתי[יה]ה|בר\b|יין|וודקה|וויסקי|בירה|שמפניה|קוקטייל|alcohol|bar|wine|vodka|whisk|beer/i;

/** Map the app's BudgetCategory onto our 7 presentation buckets. */
function bucketForCategory(cat: BudgetCategory): Bucket {
  switch (cat) {
    case "catering":
      return "food";
    case "venue":
      return "venue";
    case "photography":
      return "photography";
    case "music":
      return "music";
    case "flowers":
    case "decoration":
      return "decor";
    case "attire":
    case "invitations":
    case "transportation":
    case "other":
    default:
      return "overhead";
  }
}

function computeFromBudgetItems(
  items: BudgetItem[],
): RealCostBreakdown["breakdown"] {
  const b = emptyBreakdown();
  for (const item of items) {
    const agorot = lineAgorot(item);
    if (agorot <= 0) continue;
    // An explicit alcohol/bar line is pulled out of whatever category it
    // was filed under (the app has no dedicated alcohol BudgetCategory).
    if (ALCOHOL_RE.test(`${item.title} ${item.notes ?? ""}`)) {
      b.alcohol += agorot;
      continue;
    }
    b[bucketForCategory(item.category)] += agorot;
  }
  return b;
}

function computeFromBenchmarks(
  tier: CostTier,
  guests: number,
): RealCostBreakdown["breakdown"] {
  const b = emptyBreakdown();
  (Object.keys(b) as Bucket[]).forEach((k) => {
    b[k] = ISRAELI_BENCHMARKS_AGOROT[k][tier] * guests;
  });
  return b;
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;
const shekels = (agorot: number) => Math.round(agorot / 100);

/**
 * Look for spend that's noticeably off the healthy split and phrase it
 * as a friendly, actionable nudge (Hebrew). Returns 2-3 lines.
 */
function generateInsights(
  breakdown: RealCostBreakdown["breakdown"],
  total: number,
): string[] {
  const out: string[] = [];
  const foodPct = pct(breakdown.food, total);
  const alcoholPct = pct(breakdown.alcohol, total);
  const photoPct = pct(breakdown.photography, total);

  if (foodPct > 35) {
    out.push(
      `האוכל הוא ${foodPct}% מסך העלות — מעט מעל הסביר (~30%). שווה לבדוק אם מנה אחת במקום שתיים מספיקה.`,
    );
  }
  if (alcoholPct > 15) {
    // Rough saving = the slice above a healthy ~12%.
    // Clamp ≥0 — just over the 15% trigger the slice can be ~0/negative,
    // which previously rendered "יחסוך בערך ₪-3,210".
    const saving = Math.max(0, shekels(breakdown.alcohol - total * 0.12));
    out.push(
      `אלכוהול גבוה (${alcoholPct}%) — בר פתוח קצר ב-שעתיים יחסוך בערך ₪${saving.toLocaleString("he-IL")}.`,
    );
  }
  if (photoPct > 12) {
    const saving = Math.max(0, shekels(breakdown.photography - total * 0.1));
    out.push(
      `צילום בדרגת פרימיום (${photoPct}%) — דרגה 2 עשויה להספיק ולחסוך כ-₪${saving.toLocaleString("he-IL")}.`,
    );
  }
  // Always end on something positive / educational.
  if (out.length < 3) {
    out.push(
      "טיפ: 73% מהזוגות שוכחים את ה'תקורה' (טיפים, חניה, גיפט לספקים) — ~₪38 לאורח שמצטבר.",
    );
  }
  return out.slice(0, 3);
}

/** Active (non-declined) guest head count, with sane fallbacks. */
function activeGuestCount(state: AppState): number {
  const fromRsvp = (state.guests || []).filter(
    (g) => g.status !== "declined",
  ).length;
  if (fromRsvp > 0) return fromRsvp;
  return state.event?.guestEstimate || 100;
}

export function computeRealCostPerGuest(
  state: AppState,
  tier: CostTier = "mid",
): RealCostBreakdown {
  const guests = activeGuestCount(state);
  const items = state.budget ?? [];
  const fromReal = items.length >= 3;

  const breakdown = fromReal
    ? computeFromBudgetItems(items)
    : computeFromBenchmarks(tier, guests);

  const totalEvent = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const totalPerGuest = guests > 0 ? Math.round(totalEvent / guests) : 0;

  return {
    total_per_guest: totalPerGuest,
    total_event: totalEvent,
    guests_count: guests,
    from_real_budget: fromReal,
    breakdown,
    insights: generateInsights(breakdown, totalEvent),
  };
}

/** Bucket → Hebrew label + bar colour, ordered for the UI. */
export const COST_BUCKET_META: Array<{
  key: Bucket;
  label: string;
  color: string;
}> = [
  { key: "food", label: "קייטרינג", color: "#D4B068" },
  { key: "venue", label: "אולם", color: "#C9A961" },
  { key: "alcohol", label: "אלכוהול ושתייה", color: "#B98E54" },
  { key: "photography", label: "צילום ווידאו", color: "#A8884A" },
  { key: "music", label: "מוזיקה / DJ", color: "#8E7240" },
  { key: "decor", label: "עיצוב ופרחים", color: "#75603A" },
  { key: "overhead", label: "תקורה", color: "#5E4F33" },
];
