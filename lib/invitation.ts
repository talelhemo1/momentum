import type { EventInfo, Guest, GuestStatus } from "./types";
import { hmacSign, hmacVerify, bytesToBase64Url, base64UrlToBytes } from "./crypto";
import { normalizeIsraeliPhone } from "./phone";

/**
 * The invitation system works without a backend by encoding all needed data
 * into the WhatsApp invitation link itself.
 *
 * Flow:
 * 1. Host creates an invitation URL with the event + guest payload encoded.
 * 2. Guest clicks the WhatsApp link → opens /rsvp?d={payload}.
 * 3. /rsvp page decodes the payload (no localStorage needed) → shows the invitation.
 * 4. Guest selects status + count → page generates a "send back" WhatsApp link.
 * 5. The send-back link contains a URL to /inbox?r={response} that auto-imports
 *    the answer into the host's app when they click it from WhatsApp.
 */

// Bumped to v2 for the compact wire format (shorter URLs). v1 payloads are
// still decodable so older invitation links keep working until they expire.
const APP_VERSION = 2;
const LEGACY_VERSION = 1;

/**
 * Public shape used throughout the app. The compact wire format below maps
 * 1:1 to single-letter keys to keep invitation URLs short for WhatsApp.
 */
export interface InvitationPayload {
  v: number;
  e: {
    id: string;
    type: EventInfo["type"];
    host: string;
    partner?: string;
    date: string;
    region: EventInfo["region"];
    city?: string;
    synagogue?: string;
    hostPhone?: string;
  };
  g: {
    id: string;
    name: string;
  };
}

// Wire format — every key is one letter. Saves roughly 80 chars vs. v1.
interface CompactInvitation {
  v: 2;
  i: string;        // event id
  t: EventInfo["type"];
  h: string;        // host
  p?: string;       // partner
  d: string;        // date (YYYY-MM-DD)
  r: EventInfo["region"];
  c?: string;       // city
  s?: string;       // synagogue
  ph?: string;      // host phone
  gi: string;       // guest id
  gn: string;       // guest name
}

export interface ResponsePayload {
  v: number;
  /** Guest id from the original invitation. */
  gid: string;
  /** Guest's name (for display in the inbox). */
  gn: string;
  /** Event id. */
  eid: string;
  /** Status the guest selected. */
  s: GuestStatus;
  /** How many people are coming. */
  c: number;
}

// URL-safe base64 encoding/decoding via TextEncoder/TextDecoder.
//   - `escape`/`unescape` were removed from the ECMAScript standard in ES5
//     and are flagged by every modern linter. They also mishandle astral-plane
//     characters (emoji, some Hebrew/Arabic ligatures).
//   - The Web Crypto helpers in `./crypto` already do the byte<->base64url
//     conversion correctly; we delegate to them for consistency.

const _enc = new TextEncoder();
const _dec = new TextDecoder();

function encodeB64Url(s: string): string {
  return bytesToBase64Url(_enc.encode(s));
}

function decodeB64Url(s: string): string | null {
  const bytes = base64UrlToBytes(s);
  if (!bytes) return null;
  try {
    return _dec.decode(bytes);
  } catch {
    return null;
  }
}

export function encodeInvitation(event: EventInfo, guest: Guest): string {
  // Skip undefined/empty fields so they don't waste bytes in the encoded URL.
  const payload: CompactInvitation = {
    v: 2,
    i: event.id,
    t: event.type,
    h: event.hostName,
    ...(event.partnerName ? { p: event.partnerName } : {}),
    d: event.date,
    r: event.region,
    ...(event.city ? { c: event.city } : {}),
    ...(event.synagogue ? { s: event.synagogue } : {}),
    ...(event.hostPhone ? { ph: event.hostPhone } : {}),
    gi: guest.id,
    gn: guest.name,
  };
  return encodeB64Url(JSON.stringify(payload));
}

export function decodeInvitation(s: string): InvitationPayload | null {
  const json = decodeB64Url(s);
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { v?: number } & Record<string, unknown>;
    if (!raw || typeof raw.v !== "number") return null;

    // v2 — compact wire format (current).
    if (raw.v === 2) {
      const c = raw as unknown as CompactInvitation;
      if (!c.i || !c.gi || !c.h || !c.d) return null;
      return {
        v: APP_VERSION,
        e: {
          id: c.i,
          type: c.t,
          host: c.h,
          partner: c.p,
          date: c.d,
          region: c.r,
          city: c.c,
          synagogue: c.s,
          hostPhone: c.ph,
        },
        g: { id: c.gi, name: c.gn },
      };
    }

    // v1 — legacy nested shape, kept for backwards compatibility.
    if (raw.v === LEGACY_VERSION) {
      const v1 = raw as unknown as InvitationPayload;
      if (!v1.e || !v1.g) return null;
      return v1;
    }

    return null;
  } catch {
    return null;
  }
}

export function encodeResponse(payload: Omit<ResponsePayload, "v">): string {
  const full: ResponsePayload = { v: APP_VERSION, ...payload };
  return encodeB64Url(JSON.stringify(full));
}

export function decodeResponse(s: string): ResponsePayload | null {
  const json = decodeB64Url(s);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as ResponsePayload;
    if (!payload || payload.v !== APP_VERSION) return null;
    if (!payload.gid || !payload.eid || !payload.s) return null;
    // Reject if `c` is missing or non-numeric, but allow 0 — declined guests
    // legitimately respond with attendingCount=0. The previous truthiness
    // check (`!payload.c`) folded 0 into the missing-field branch.
    if (typeof payload.c !== "number" || Number.isNaN(payload.c)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Build the RSVP page URL the guest will open.
 * If the event has a signing key, append an HMAC so the {eventId, guestId}
 * pair can't be forged or replayed for other invitations.
 */
export async function buildRsvpUrl(origin: string, event: EventInfo, guest: Guest): Promise<string> {
  const cleaned = (origin ?? "").replace(/\/+$/, "");
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) {
    // Refuse to ship a relative URL into a WhatsApp body. Callers should pass
    // a valid origin from getPublicOrigin(). Throwing keeps the bug loud
    // instead of silently mailing a broken link to every guest.
    throw new Error(`[momentum/invitation] buildRsvpUrl received invalid origin: "${origin}"`);
  }
  const d = encodeInvitation(event, guest);
  const params = new URLSearchParams({ d });
  if (event.signingKey) {
    const sig = await hmacSign(event.signingKey, `${event.id}|${guest.id}`);
    params.set("sig", sig);
  }
  return `${cleaned}/rsvp?${params.toString()}`;
}

/**
 * Build the auto-import URL the host clicks from WhatsApp to record a response.
 *
 * Important: the GUEST builds this URL — they don't have the host's signing
 * key. So they pass through the signature they received with their invitation.
 * The host's app then verifies the (eid|gid) HMAC against its signing key,
 * proving the original invitation was real and not fabricated.
 */
export function buildInboxUrl(
  origin: string,
  payload: Omit<ResponsePayload, "v">,
  passthroughSignature?: string,
): string {
  const r = encodeResponse(payload);
  const params = new URLSearchParams({ r });
  if (passthroughSignature) params.set("sig", passthroughSignature);
  const cleaned = (origin ?? "").replace(/\/+$/, "");
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) {
    throw new Error(`[momentum/invitation] buildInboxUrl received invalid origin: "${origin}"`);
  }
  return `${cleaned}/inbox?${params.toString()}`;
}

/** Verify an inbox response signature. Returns true if signature matches. */
export async function verifyInboxSignature(
  signingKey: string,
  eventId: string,
  guestId: string,
  signature: string,
): Promise<boolean> {
  return hmacVerify(signingKey, `${eventId}|${guestId}`, signature);
}

/** Verify an invitation `d`/`sig` pair from a URL. */
export async function verifyInvitationSignature(
  signingKey: string,
  payload: InvitationPayload,
  signature: string,
): Promise<boolean> {
  return hmacVerify(signingKey, `${payload.e.id}|${payload.g.id}`, signature);
}

/**
 * Format an event date for the WhatsApp body. Returns "" for missing or
 * malformed dates so the caller can omit the line entirely instead of
 * leaking "Invalid Date" into the user-facing message.
 */
function formatHebrewDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Build the WhatsApp link the host opens to send the invitation to a single guest. */
export async function buildHostInvitationWhatsappLink(
  origin: string,
  event: EventInfo,
  guest: Guest,
): Promise<{ url: string; rsvpUrl: string; valid: boolean }> {
  const { phone, valid } = normalizeIsraeliPhone(guest.phone);
  const rsvpUrl = await buildRsvpUrl(origin, event, guest);
  const date = formatHebrewDate(event.date);

  const subjects = event.partnerName
    ? `${event.hostName} ו${event.partnerName}`
    : event.hostName;

  const lines = [
    `שלום ${guest.name}! 💫`,
    "",
    `${subjects} מתכבדים להזמין אותך לאירוע שלהם.`,
    "",
  ];
  if (date) lines.push(`📅 ${date}`);
  const where = [event.synagogue, event.city].filter(Boolean).join(" · ");
  if (where) lines.push(`📍 ${where}`);
  lines.push(
    "",
    "👇 לאישור הגעה (כן / לא / אולי + כמות אנשים):",
    rsvpUrl,
    "",
    "נשמח לראותך! 🥂",
  );
  const text = lines.join("\n");

  const url = valid
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  return { url, rsvpUrl, valid };
}

/** Build the WhatsApp link a guest opens to send their answer back to the host. */
export function buildGuestResponseWhatsappLink(
  origin: string,
  event: { hostPhone?: string; hostName: string; partnerName?: string },
  guest: { id: string; name: string },
  eventId: string,
  status: GuestStatus,
  count: number,
  /** Signature received in the original invitation — passed through to /inbox unchanged. */
  passthroughSignature?: string,
  /** Optional free-text note from the guest (allergy, request). Appears in the
   *  WhatsApp text the host receives but is NOT stored in the importable URL,
   *  so it's purely a courtesy message — keeps the schema stable. */
  note?: string,
): { url: string; importUrl: string; valid: boolean } {
  const { phone, valid } = event.hostPhone
    ? normalizeIsraeliPhone(event.hostPhone)
    : { phone: "", valid: false };
  const importUrl = buildInboxUrl(
    origin,
    {
      gid: guest.id,
      gn: guest.name,
      eid: eventId,
      s: status,
      c: count,
    },
    passthroughSignature,
  );

  const statusText =
    status === "confirmed"
      ? `✅ ${guest.name} מאשר/ת הגעה — ${count} ${count === 1 ? "אדם" : "אנשים"}`
      : status === "declined"
        ? `❌ ${guest.name} לא יוכל/תוכל להגיע. תודה רבה על ההזמנה!`
        : `🤔 ${guest.name} עדיין לא בטוח/ה — אעדכן בהקדם.`;

  const subjects = event.partnerName ? `${event.hostName} ו${event.partnerName}` : event.hostName;

  const lines = [
    `היי ${subjects}!`,
    "",
    statusText,
  ];
  // Inject the guest's note (allergy, special request) right after the status
  // so the host sees it before the auto-import link.
  if (note && note.trim()) {
    lines.push("", `📝 הערה: ${note.trim()}`);
  }
  lines.push(
    "",
    "📥 לעדכון אוטומטי באפליקציית התכנון שלכם:",
    importUrl,
  );
  const text = lines.join("\n");

  const url = valid
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  return { url, importUrl, valid };
}
