/**
 * RSVP link + WhatsApp message builders.
 *
 * One source of truth for the URL shape we send guests. Other modules import
 * from here so the URL contract stays unified — change a query param name once
 * and every page picks it up.
 *
 * URL shape:    https://<origin>/rsvp?e=<eventId>&g=<guestId>&t=<rsvpToken>
 * The token is HMAC-SHA256(signingKey, "rsvp:<eventId>|<guestId>"). See
 * lib/crypto.ts for generation/verification helpers.
 */

import { generateRsvpToken } from "./crypto";
import { EVENT_CONFIG } from "./eventConfig";
import type { EventInfo, Guest } from "./types";
import { normalizeIsraeliPhone } from "./phone";

function trimOrigin(origin: string): string {
  return (origin ?? "").replace(/\/+$/, "");
}

export async function buildRsvpUrl(
  origin: string,
  event: Pick<EventInfo, "id" | "signingKey">,
  guest: Pick<Guest, "id" | "rsvpToken">,
): Promise<string> {
  const cleaned = trimOrigin(origin);
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) {
    throw new Error(`[momentum/rsvpLinks] buildRsvpUrl received invalid origin: "${origin}"`);
  }
  const token = guest.rsvpToken
    ?? (event.signingKey ? await generateRsvpToken(event.id, guest.id, event.signingKey) : "");
  const params = new URLSearchParams({ e: event.id, g: guest.id });
  if (token) params.set("t", token);
  return `${cleaned}/rsvp?${params.toString()}`;
}

/**
 * Format the event date as a Hebrew weekday + day month + year string.
 * Lives here so every WhatsApp message uses the same formatting.
 */
function formatEventDate(date: string): string {
  if (!date) return "";
  const d = new Date(date);
  // Invalid input (e.g. "2025-13-99") used to leak the raw string into the
  // WhatsApp body. Return empty so the caller can omit the date line entirely.
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Choose the human-friendly subjects line based on event type & partner presence. */
function subjectsLine(event: Pick<EventInfo, "type" | "hostName" | "partnerName">): string {
  // R15 §1C — defensive lookup (was already soft-guarded by `config?.`
  // below; normalized to the standard wedding-fallback pattern).
  const config = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.wedding;
  return config.invitationHostPhrase(event.hostName, event.partnerName)
    ?? (event.partnerName ? `${event.hostName} ו${event.partnerName}` : event.hostName);
}

export interface WhatsAppMessage {
  /** Body text (already URL-encoded internally — `url` is ready to open). */
  text: string;
  /** Pre-built `https://wa.me/<phone>?text=<encoded>` link, if phone is usable. */
  url: string;
  /** False when the phone number couldn't be normalized to dial-able digits;
   *  the caller should still allow copy-to-clipboard / share fallbacks. */
  hasPhone: boolean;
}

// Phone normalization moved to lib/phone.ts so rsvpLinks/invitation/whatsapp
// share one implementation. Old local copies had drift (no trim, no "00"
// handling, no validation) which produced different "valid" answers for the
// same input depending on which entry point ran.

/**
 * Build the WhatsApp invitation message + wa.me URL for a single guest.
 * The message is intentionally short and warm: ברכה אישית, פרטי האירוע, ולינק.
 */
export async function buildWhatsAppMessage(
  origin: string,
  event: Pick<EventInfo, "id" | "type" | "hostName" | "partnerName" | "date" | "city" | "synagogue" | "signingKey">,
  guest: Pick<Guest, "id" | "name" | "phone" | "rsvpToken">,
  opts?: { kind?: "invite" | "reminder" | "final" },
): Promise<WhatsAppMessage> {
  const kind = opts?.kind ?? "invite";
  const url = await buildRsvpUrl(origin, event, guest);
  const subjects = subjectsLine(event);
  const dateStr = formatEventDate(event.date);
  const where = [event.synagogue, event.city].filter(Boolean).join(" · ");

  let body: string[];
  if (kind === "reminder") {
    body = [
      `היי ${guest.name}, רק תזכורת 💛`,
      "",
      `נשמח לדעת אם תוכלו להגיע ל${EVENT_CONFIG[event.type]?.label ?? "אירוע"} שלנו:`,
      "",
    ];
    if (dateStr) body.push(`📅 ${dateStr}`);
    if (where) body.push(`📍 ${where}`);
    body.push("", "👇 אישור הגעה כאן (לוקח רגע):", url);
  } else if (kind === "final") {
    body = [
      `היי ${guest.name}! 🎉`,
      "",
      `מתרגשים לראות אותך מחר ב${EVENT_CONFIG[event.type]?.label ?? "אירוע"}!`,
      "",
    ];
    if (dateStr) body.push(`📅 ${dateStr}`);
    if (where) body.push(`📍 ${where}`);
    body.push("", "פרטים מלאים ומפת השולחנות:", url);
  } else {
    // Invite
    body = [
      `היי ${guest.name}! 🎉`,
      "",
      `${subjects} שמחים להזמין אותך ל${EVENT_CONFIG[event.type]?.label ?? "אירוע"} שלנו.`,
      "",
    ];
    if (dateStr) body.push(`📅 ${dateStr}`);
    if (where) body.push(`📍 ${where}`);
    body.push(
      "",
      "👇 אישור הגעה (כן / אולי / לא + כמות אנשים):",
      url,
      "",
      "נשמח לראותך 🥂",
    );
  }
  const text = body.join("\n");
  const { phone, valid } = normalizeIsraeliPhone(guest.phone);
  // Only treat the number as dial-able if it parses as a real Israeli line.
  // Partial inputs (e.g. a 5-digit typo) used to slip through the old
  // `length >= 10` check and pop wa.me with garbage; now they degrade to the
  // "no phone" path so the host gets the share dialog instead.
  return {
    text,
    url: valid
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`,
    hasPhone: valid,
  };
}

/** Read query params (e/g/t) into a typed object for the /rsvp page consumer. */
export interface ParsedRsvpQuery {
  eventId: string | null;
  guestId: string | null;
  token: string | null;
}

export function parseRsvpQuery(params: URLSearchParams): ParsedRsvpQuery {
  return {
    eventId: params.get("e"),
    guestId: params.get("g"),
    token: params.get("t"),
  };
}
