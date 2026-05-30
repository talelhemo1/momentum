import type { GuestStatus } from "@/lib/types";

/**
 * Maps NLPearl webhook payloads → Momentum RSVP fields.
 *
 * Configure the Pearl to collect variables (recommended IDs):
 *   - rsvpStatus: "coming" | "not_coming" | "maybe"
 *   - headCount: number (total people including the guest)
 *
 * Auto-update runs only on successful conversations with a mappable status.
 * Voicemail / no-answer / unreachable → no RSVP change (client: no retries).
 */

export type VoiceCallOutcome =
  | "success"
  | "no_update"
  | "voicemail"
  | "unreachable"
  | "error";

export interface VoiceRsvpMapping {
  status: GuestStatus;
  attendingCount: number;
  outcome: VoiceCallOutcome;
  note?: string;
}

type CollectedEntry = { name?: string; id?: string; value?: unknown };

const SUCCESS_STATUSES = new Set([
  "Success",
  "Completed",
  "100",
  "130",
]);

const NO_UPDATE_STATUSES = new Set([
  "VoiceMailLeft",
  "Unreachable",
  "NoAnswer",
  "NotSuccessful",
  "Busy",
  "Failed",
  "Canceled",
  "70",
  "150",
  "7",
  "110",
  "5",
  "6",
  "8",
]);

function collectMap(entries: CollectedEntry[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!entries?.length) return out;
  for (const e of entries) {
    const key = (e.id ?? e.name ?? "").toString().trim().toLowerCase();
    if (key) out[key] = e.value;
  }
  return out;
}

function parseHeadCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    return Math.min(Math.round(raw), 99);
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = parseInt(s.replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 99);
}

function parseRsvpStatus(raw: unknown): GuestStatus | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (
    s.includes("not_coming") ||
    s.includes("not coming") ||
    s.includes("no") ||
    s === "לא" ||
    s.includes("לא מגיע") ||
    s.includes("לא אגיע") ||
    (s.includes("not") && !s.includes("not sure"))
  ) {
    return "declined";
  }
  if (
    s.includes("coming") ||
    s.includes("yes") ||
    s === "כן" ||
    s.includes("מגיע") ||
    s.includes("אגיע")
  ) {
    return "confirmed";
  }
  if (s.includes("maybe") || s.includes("אולי")) return "maybe";
  return null;
}

function inferFromSummary(summary: string): GuestStatus | null {
  const s = summary.toLowerCase();
  if (s.includes("will not") || s.includes("not attend") || s.includes("לא יגיע")) {
    return "declined";
  }
  if (s.includes("maybe") || s.includes("אולי")) return "maybe";
  if (
    s.includes("will attend") ||
    s.includes("confirmed") ||
    s.includes("coming") ||
    s.includes("מאשר") ||
    s.includes("מגיע")
  ) {
    return "confirmed";
  }
  return null;
}

export function parseExternalGuestId(
  externalId: string | null | undefined,
): { eventId: string; guestId: string } | null {
  if (!externalId?.includes(":")) return null;
  const [eventId, guestId] = externalId.split(":", 2);
  if (!eventId?.trim() || !guestId?.trim()) return null;
  return { eventId: eventId.trim(), guestId: guestId.trim() };
}

export function buildExternalGuestId(eventId: string, guestId: string): string {
  return `${eventId}:${guestId}`;
}

/**
 * Convert NLPearl call webhook fields into an RSVP update, or null if we
 * should not touch the guest row (voicemail, no answer, ambiguous).
 */
export function mapVoiceCallToRsvp(input: {
  conversationStatus?: string | number | null;
  status?: string | number | null;
  collectedInfo?: CollectedEntry[];
  collectedData?: Record<string, unknown>;
  summary?: string | null;
}): VoiceRsvpMapping | null {
  const conv = String(input.conversationStatus ?? "");
  if (NO_UPDATE_STATUSES.has(conv)) {
    return null;
  }

  const collected = {
    ...collectMap(input.collectedInfo),
    ...(input.collectedData ?? {}),
  };

  const status =
    parseRsvpStatus(collected.rsvpstatus) ??
    parseRsvpStatus(collected.rsvpStatus) ??
    parseRsvpStatus(collected.rsvp_status) ??
    parseRsvpStatus(collected.status) ??
    inferFromSummary(input.summary ?? "");

  if (!status && !SUCCESS_STATUSES.has(conv)) {
    return null;
  }

  if (!status) return null;

  const heads =
    parseHeadCount(collected.headcount) ??
    parseHeadCount(collected.headCount) ??
    parseHeadCount(collected.head_count) ??
    parseHeadCount(collected.attendingcount);

  const attendingCount =
    status === "declined" ? 0 : status === "maybe" ? 0 : (heads ?? 1);

  return {
    status,
    attendingCount,
    outcome: "success",
    note: input.summary ? `שיחת NLPearl: ${input.summary.slice(0, 200)}` : undefined,
  };
}

/** Generic "not yet confirmed" predicate. Shared by the WhatsApp-RSVP send
 *  flow (where it's the right check) and as the base for richer gates. NOT
 *  sufficient on its own for VOICE calls — use isGuestEligibleForVoiceCampaign
 *  for those (it adds the "ignored ≥2 messages" cost gate). */
export function isGuestEligibleForVoiceCall(status: GuestStatus): boolean {
  return status !== "confirmed";
}

export type VoiceCampaignScope = "not_confirmed" | "all_with_phone";

/** Minimum outreach messages (invite + reminders / RSVP template) a guest must
 *  have received before an automated VOICE call is permitted. Voice calls cost
 *  real money, so they're a last resort for true non-responders — never a free
 *  "call everyone" broadcast. */
export const VOICE_MIN_MESSAGES = 2;

/** The per-guest signals the voice gate inspects. A subset of `Guest`, so both
 *  the client (full Guest) and the API route (trimmed payload) can pass it. */
export interface VoiceCallGuestSignals {
  status: GuestStatus;
  invitedAt?: string | null;
  reminderSentAt?: string | null;
  whatsappRsvpSentAt?: string | null;
}

/** How many distinct outreach touchpoints we've recorded for a guest
 *  (invitation, reminder, automated WhatsApp RSVP template). */
export function guestMessagesSent(g: VoiceCallGuestSignals): number {
  return [g.invitedAt, g.reminderSentAt, g.whatsappRsvpSentAt].filter(Boolean)
    .length;
}

/**
 * VOICE-campaign eligibility — deliberately stricter than
 * `isGuestEligibleForVoiceCall`. A guest may be auto-called ONLY when:
 *   1. they still haven't answered at all — not confirmed, declined, OR maybe
 *      ("maybe"/"declined" already replied, so calling them wastes money), AND
 *   2. they've already been sent at least VOICE_MIN_MESSAGES messages
 *      (e.g. an invite + a reminder) and ignored them.
 * This is the gate that stops hosts from calling everyone whenever they want.
 */
export function isGuestEligibleForVoiceCampaign(
  g: VoiceCallGuestSignals,
): boolean {
  const answered =
    g.status === "confirmed" || g.status === "declined" || g.status === "maybe";
  if (answered) return false;
  return guestMessagesSent(g) >= VOICE_MIN_MESSAGES;
}
