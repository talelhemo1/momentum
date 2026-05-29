import type { GuestStatus } from "@/lib/types";

export interface RsvpButtonPayloads {
  yes: string;
  no: string;
  maybe: string;
}

export const DEFAULT_RSVP_BUTTON_PAYLOADS: RsvpButtonPayloads = {
  yes: "rsvp_yes",
  no: "rsvp_no",
  maybe: "rsvp_maybe",
};

/** Map WhatsApp quick-reply payload or visible text → RSVP status. */
export function rsvpStatusFromButton(
  payloadOrText: string,
  buttonPayloads: RsvpButtonPayloads = DEFAULT_RSVP_BUTTON_PAYLOADS,
): "confirmed" | "declined" | "maybe" | null {
  const raw = payloadOrText.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  // Declined before confirmed — "לא מגיע" contains "מגיע".
  if (
    lower === buttonPayloads.no.toLowerCase() ||
    lower.includes("rsvp_no") ||
    lower.includes("not_coming") ||
    raw.includes("לא מגיע") ||
    raw.includes("לא אגיע")
  ) {
    return "declined";
  }

  if (
    lower === buttonPayloads.yes.toLowerCase() ||
    lower.includes("rsvp_yes") ||
    (lower.includes("coming") && !lower.includes("not")) ||
    (raw.includes("מגיע") && !raw.includes("לא"))
  ) {
    return "confirmed";
  }

  if (
    lower === buttonPayloads.maybe.toLowerCase() ||
    lower.includes("rsvp_maybe") ||
    lower.includes("maybe") ||
    raw.includes("עדיין לא") ||
    raw.includes("לא החלט")
  ) {
    return "maybe";
  }

  return null;
}

export function isFinalRsvpStatus(
  s: GuestStatus,
): s is "confirmed" | "declined" | "maybe" {
  return s === "confirmed" || s === "declined" || s === "maybe";
}
