import { normalizeIsraeliPhone } from "./phone";
import { buildGuestPassUrl } from "./managerLive";
import { tryGetPublicOrigin } from "./origin";

/**
 * R20 Phase 3 — WhatsApp welcome message a manager sends to a guest the
 * moment they check in at the door. The message announces their table
 * number and links to the public /pass/[eventId]/[guestId] page that
 * carries the full event details.
 */
export interface GuestWelcomeInput {
  guestName: string;
  guestPhone: string;
  guestId: string;
  eventId: string;
  /** The table's display label (uses SeatingTable.name in our schema). */
  tableLabel: string;
  hostName: string;
  partnerName?: string;
}

export interface GuestWelcomeResult {
  /** Ready-to-open wa.me URL. Falls back to recipient-less when phone
   *  fails normalization — manager can still paste the message. */
  url: string;
  text: string;
  /** False if the guest's phone failed normalization (won't open targeted
   *  wa.me). Manager UI should toast a hint in that case. */
  valid: boolean;
}

export function buildGuestWelcomeWhatsapp(input: GuestWelcomeInput): GuestWelcomeResult {
  const origin = tryGetPublicOrigin();
  const passUrl = origin
    ? buildGuestPassUrl(origin, input.eventId, input.guestId)
    : "";

  const subjects = input.partnerName
    ? `${input.hostName} ו-${input.partnerName}`
    : input.hostName;

  const lines = [
    `${input.guestName}, ברוך/ה הבא/ה! 🥂`,
    "",
    `${subjects} שמחים שהצטרפת לאירוע!`,
    "",
    `🪑 *השולחן שלך: ${input.tableLabel}*`,
  ];

  // The pass URL is optional — without NEXT_PUBLIC_SITE_URL set (and not
  // running in a browser yet) `tryGetPublicOrigin()` returns "". In that
  // case we still send a useful "you're at table X" message without a
  // broken link.
  if (passUrl) {
    lines.push("", "👇 כל פרטי האירוע — תפריט, מפה, סדר הזמנים:", passUrl);
  }

  lines.push("", "תהנה/י! 💛");
  const text = lines.join("\n");
  const encoded = encodeURIComponent(text);

  const { phone, valid } = normalizeIsraeliPhone(input.guestPhone);
  return {
    url: valid
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`,
    text,
    valid,
  };
}
