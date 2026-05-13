import type { EventType, AppState } from "./types";

/** Cultural baselines: average gift per guest in NIS, per event type. */
const TYPICAL_GIFT_PER_GUEST: Record<EventType, number> = {
  wedding: 500,
  "bar-mitzvah": 300,
  "bat-mitzvah": 300,
  "shabbat-chatan": 200,
  brit: 200,
  engagement: 250,
  birthday: 200,
  corporate: 0,
  other: 250,
};

export interface EnvelopeRecommendation {
  /** Required average per guest just to break even on event cost. */
  breakEven: number;
  /** Recommended average to come out with a small reserve / honeymoon. */
  withReserve: number;
  /** What guests usually give for this event type. */
  typical: number;
  /** Total envelope intake at the typical baseline. */
  expectedTotalAtTypical: number;
  /** Net result at typical: positive = profit, negative = loss. */
  netAtTypical: number;
  /** A short, plain-language verdict to surface in the UI. */
  verdict: "profit" | "balanced" | "loss" | "no-data";
  verdictLabel: string;
  /** Suggested per-guest amount to recommend (rounded). */
  suggestedPerGuest: number;
  /** What count we used for the calculation. */
  guestCount: number;
  /** Whether the guest count came from confirmed RSVPs (true) or just the estimate (false). */
  countSource: "confirmed" | "estimate";
  /** What cost we used. */
  totalCost: number;
  /** Whether the cost came from real budget items (true) or just the onboarding total (false). */
  costSource: "actual" | "estimate";
}

const round = (v: number, step = 10) => Math.round(v / step) * step;

/**
 * Compute envelope recommendations from the LIVE app state.
 * - Always uses confirmed-guest head count if any RSVPs are in (else estimate).
 * - Always uses the sum of actual budget items if any (else the onboarding total).
 * - Re-runs whenever inputs change, so the dashboard / budget page stay accurate.
 */
export function calcEnvelopeFromState(state: AppState): EnvelopeRecommendation {
  if (!state.event) return makeNoData("wedding", 250);

  const { event } = state;
  const typical = TYPICAL_GIFT_PER_GUEST[event.type] ?? 250;

  // Cost: use actual line items when present, else fall back to onboarding total.
  const itemsTotal = state.budget.reduce((s, b) => s + (b.actual ?? b.estimated ?? 0), 0);
  const totalCost = itemsTotal > 0 ? itemsTotal : event.budgetTotal;
  const costSource: "actual" | "estimate" = itemsTotal > 0 ? "actual" : "estimate";

  // Guest count: use confirmed heads when any have RSVP'd, else use the estimate.
  // Use `??` not `||` so a legitimately-stored attendingCount=0 (declined-but-
  // somehow-confirmed edge case, or a future "ghost" head) doesn't get
  // silently bumped to 1, inflating the gift-per-head estimate.
  const confirmedHeads = state.guests
    .filter((g) => g.status === "confirmed")
    .reduce((s, g) => s + (g.attendingCount ?? 1), 0);
  const guestCount = confirmedHeads > 0 ? confirmedHeads : event.guestEstimate;
  const countSource: "confirmed" | "estimate" = confirmedHeads > 0 ? "confirmed" : "estimate";

  if (guestCount <= 0 || totalCost <= 0) return makeNoData(event.type, typical);

  const breakEven = round(totalCost / guestCount);
  const withReserve = round((totalCost * 1.15) / guestCount);
  const expectedTotalAtTypical = typical * guestCount;
  const netAtTypical = expectedTotalAtTypical - totalCost;

  let verdict: EnvelopeRecommendation["verdict"];
  let verdictLabel: string;
  if (netAtTypical >= totalCost * 0.05) {
    verdict = "profit";
    verdictLabel = "צפוי רווח";
  } else if (netAtTypical >= -totalCost * 0.10) {
    verdict = "balanced";
    verdictLabel = "מאוזן";
  } else {
    verdict = "loss";
    verdictLabel = "צפוי הפסד";
  }

  // Recommend at least breakEven, but never less than typical (guests won't pay below cultural norm).
  const suggestedPerGuest = Math.max(breakEven, typical);

  return {
    breakEven,
    withReserve,
    typical,
    expectedTotalAtTypical,
    netAtTypical,
    verdict,
    verdictLabel,
    suggestedPerGuest,
    guestCount,
    countSource,
    totalCost,
    costSource,
  };
}

function makeNoData(type: EventType, typical: number): EnvelopeRecommendation {
  return {
    breakEven: 0,
    withReserve: 0,
    typical,
    expectedTotalAtTypical: 0,
    netAtTypical: 0,
    verdict: "no-data",
    verdictLabel: "מלא תקציב ומספר מוזמנים כדי לראות חישוב",
    suggestedPerGuest: typical,
    guestCount: 0,
    countSource: "estimate",
    totalCost: 0,
    costSource: "estimate",
  };
}

// ─── Relationship-based envelope norms (R18) ───────────────────────────────
// Israeli social-circle norms for what a guest couple typically puts in the
// envelope. Numbers are TYPICAL RANGES — not a rulebook. Sourced from public
// wedding-planning communities + finance columns 2024-2025. The "typical"
// midpoint is what we use for the headline calculation; min/max bracket the
// reasonable spread so the UI can show both ends honestly.

export type RelationshipType =
  | "immediate-family"   // אחים, הורים, סבים
  | "extended-family"    // דודים, בני דודים
  | "close-friends"      // חברים מהבית/הצבא
  | "friends"            // חברים רגילים
  | "colleagues"         // עמיתי עבודה
  | "acquaintances";     // מכרים, שכנים

export interface RelationshipNorm {
  id: RelationshipType;
  label: string;
  emoji: string;
  /** טווח מקובל לזוג שמגיע יחד (₪). */
  rangeMin: number;
  rangeMax: number;
  /** ממוצע מומלץ — הערך שמשמש לחישוב ה"צפוי". */
  typical: number;
  description: string;
}

export const RELATIONSHIP_NORMS: RelationshipNorm[] = [
  {
    id: "immediate-family",
    label: "משפחה קרובה",
    emoji: "❤️",
    rangeMin: 1500,
    rangeMax: 3000,
    typical: 2000,
    description: "הורים, אחים, אחיות, סבים — בדרך כלל הסכום הגדול ביותר",
  },
  {
    id: "extended-family",
    label: "משפחה רחוקה",
    emoji: "👨‍👩‍👧",
    rangeMin: 800,
    rangeMax: 1500,
    typical: 1000,
    description: "דודים, בני דודים, חמים/חמות של אחים",
  },
  {
    id: "close-friends",
    label: "חברים קרובים",
    emoji: "🤗",
    rangeMin: 500,
    rangeMax: 800,
    typical: 600,
    description: "חברים מהבית, הצבא, או מהלימודים — קשר עמוק",
  },
  {
    id: "friends",
    label: "חברים",
    emoji: "🙂",
    rangeMin: 350,
    rangeMax: 500,
    typical: 400,
    description: "חברים מתקופות שונות בחיים — קשר טוב אבל לא יומיומי",
  },
  {
    id: "colleagues",
    label: "עמיתי עבודה",
    emoji: "💼",
    rangeMin: 250,
    rangeMax: 400,
    typical: 300,
    description: "עמיתים מהעבודה, ראשי צוות, שותפים עסקיים",
  },
  {
    id: "acquaintances",
    label: "מכרים",
    emoji: "👋",
    rangeMin: 200,
    rangeMax: 350,
    typical: 250,
    description: "שכנים, חברי ילדים, מכרים מהקהילה",
  },
];

export interface RelationshipBreakdownInput {
  /** Number of couples in each bucket (one envelope per couple). */
  counts: Partial<Record<RelationshipType, number>>;
}

export interface RelationshipBreakdownResult {
  totalExpected: number;
  perCategory: Array<{
    type: RelationshipType;
    label: string;
    emoji: string;
    couples: number;
    expectedAmount: number;
    rangeMin: number;
    rangeMax: number;
  }>;
  totalCouples: number;
}

/**
 * Sum expected envelope intake from a per-category couple count.
 * Pure function — re-runs cheaply on every state change in the UI.
 */
export function calcRelationshipBreakdown(
  input: RelationshipBreakdownInput,
): RelationshipBreakdownResult {
  const perCategory = RELATIONSHIP_NORMS.map((norm) => {
    const couples = input.counts[norm.id] ?? 0;
    return {
      type: norm.id,
      label: norm.label,
      emoji: norm.emoji,
      couples,
      expectedAmount: couples * norm.typical,
      rangeMin: couples * norm.rangeMin,
      rangeMax: couples * norm.rangeMax,
    };
  });

  const totalExpected = perCategory.reduce((s, c) => s + c.expectedAmount, 0);
  const totalCouples = perCategory.reduce((s, c) => s + c.couples, 0);

  return { totalExpected, perCategory, totalCouples };
}

// Backwards-compatibility helper for older callers — now derives from a synthetic state.
export function calcEnvelope(type: EventType, totalCost: number, guests: number): EnvelopeRecommendation {
  if (guests <= 0 || totalCost <= 0) return makeNoData(type, TYPICAL_GIFT_PER_GUEST[type] ?? 250);
  const fakeState: AppState = {
    event: {
      id: "_",
      type,
      hostName: "_",
      date: new Date().toISOString().slice(0, 10),
      region: "tel-aviv",
      budgetTotal: totalCost,
      guestEstimate: guests,
      createdAt: new Date().toISOString(),
    },
    guests: [],
    budget: [],
    selectedVendors: [],
    savedVendors: [],
    checklist: [],
    tables: [],
    seatAssignments: {},
    vendorChats: [],
    assistantMessages: [],
    compareVendors: [],
    blessings: [],
    livePhotos: [],
  };
  return calcEnvelopeFromState(fakeState);
}
