import type { Guest, EventInfo } from "./types";
import { EVENT_CONFIG } from "./eventConfig";
import { normalizeIsraeliPhone } from "./phone";

/**
 * WhatsApp helpers for the host UI ("send invitation" buttons in /guests).
 *
 * NOTE: For the actual invitation pipeline (host → guest → host inbox), use
 * `./invitation.ts`. Those builders embed an HMAC-signed payload and produce
 * the URLs the rest of the app uses. The helpers here are only the message-
 * formatting and `wa.me` link wrapping for the simpler legacy flows.
 *
 * Phone normalization comes from `./phone` — the previous local copy was a
 * subset (no trim, no "00" handling, no validation) and produced different
 * "valid" answers from the same input.
 */

export function buildInvitationMessage(guest: Guest, event: EventInfo, rsvpUrl: string): string {
  const config = EVENT_CONFIG[event.type];
  const eventDate = new Date(event.date);
  const date = Number.isNaN(eventDate.getTime())
    ? ""
    : eventDate.toLocaleDateString("he-IL", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

  const hostsPhrase = config.invitationHostPhrase(event.hostName, event.partnerName);
  const eventPhrase = config.invitationEventPhrase;

  const lines: string[] = [
    `שלום ${guest.name}! 💫`,
    "",
    `${hostsPhrase} מתכבדים להזמין אותך ${eventPhrase}.`,
    "",
  ];
  if (date) lines.push(`📅 ${date}`);

  const where = [event.synagogue, event.city].filter(Boolean).join(" · ");
  if (where) lines.push(`📍 ${where}`);

  lines.push("", "נשמח לדעת אם תוכלו להגיע — אישור הגעה כאן:", rsvpUrl, "", "נתראה!");

  return lines.join("\n");
}

export function buildWhatsappLink(guest: Guest, event: EventInfo, rsvpUrl: string): string {
  const { phone, valid } = normalizeIsraeliPhone(guest.phone);
  const text = buildInvitationMessage(guest, event, rsvpUrl);
  return valid
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
