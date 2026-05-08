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
  const confirmedHeads = state.guests
    .filter((g) => g.status === "confirmed")
    .reduce((s, g) => s + (g.attendingCount || 1), 0);
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
