/**
 * R27 — Momentum Live Phase 3: "Wrapped"-style post-event report.
 *
 * Pure. Computes everything the slide deck shows from the local
 * AppState. Defensive: every field tolerates missing/partial data so a
 * half-filled event still produces a graceful report.
 */
import type { AppState, EventType } from "@/lib/types";
import { VENDORS } from "@/lib/vendors";

export interface EventReport {
  hostNames: string;
  eventType: EventType | null;
  durationHours: number;
  totalArrivals: number;
  totalInvited: number;
  arrivalRate: number; // 0..1
  firstDanceAt?: string; // ISO — usually absent (not tracked locally)
  vendorNames: string[];
  envelopeTotal?: number;
  memoryNotesCount: number;
  topMoments: Array<{ time: string; description: string }>;
}

/** Typical celebration length by type (no end-time is stored locally). */
const TYPICAL_HOURS: Partial<Record<EventType, number>> = {
  wedding: 5,
  "bar-mitzvah": 4,
  "bat-mitzvah": 4,
  "shabbat-chatan": 3,
  brit: 2,
  engagement: 4,
  birthday: 4,
  corporate: 4,
  other: 4,
};

export function generateReport(state: AppState): EventReport {
  const event = state.event;
  const guests = state.guests ?? [];
  const saved = state.savedVendors ?? [];
  const blessings = state.blessings ?? [];
  const photos = state.livePhotos ?? [];

  const hostNames = event
    ? event.partnerName
      ? `${event.hostName} ו-${event.partnerName}`
      : event.hostName
    : "האירוע שלכם";

  const totalInvited = guests.reduce(
    (s, g) => s + Math.max(1, g.attendingCount || 1),
    0,
  );
  const arrived = guests.filter((g) => g.status === "confirmed");
  const totalArrivals = arrived.reduce(
    (s, g) => s + Math.max(1, g.attendingCount || 1),
    0,
  );
  const arrivalRate =
    totalInvited > 0 ? Math.min(1, totalArrivals / totalInvited) : 0;

  const durationHours =
    (event?.type && TYPICAL_HOURS[event.type]) || 4;

  // Resolve saved-vendor names from the catalog (no logo images exist —
  // the slide renders the names as glowing chips).
  const vendorNames = saved
    .map((sv) => VENDORS.find((v) => v.id === sv.vendorId)?.name)
    .filter((n): n is string => !!n)
    .slice(0, 8);

  const envSum = guests.reduce(
    (s, g) => s + (typeof g.envelopeAmount === "number" ? g.envelopeAmount : 0),
    0,
  );
  const envelopeTotal = envSum > 0 ? envSum : undefined;

  const memoryNotesCount = blessings.length + photos.length;

  const topMoments: Array<{ time: string; description: string }> = [];
  if (totalArrivals > 0)
    topMoments.push({
      time: "",
      description: `${totalArrivals} אורחים חגגו איתכם`,
    });
  if (vendorNames.length > 0)
    topMoments.push({
      time: "",
      description: `${vendorNames.length} ספקים יצרו את הקסם`,
    });
  if (memoryNotesCount > 0)
    topMoments.push({
      time: "",
      description: `${memoryNotesCount} רגעים נשמרו ב-Memory Album`,
    });

  return {
    hostNames,
    eventType: event?.type ?? null,
    durationHours,
    totalArrivals,
    totalInvited,
    arrivalRate,
    vendorNames,
    envelopeTotal,
    memoryNotesCount,
    topMoments,
  };
}
