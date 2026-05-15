import type { EventType } from "@/lib/types";
import { decodeInvitation } from "@/lib/invitation";
import { lookupShortLink } from "@/lib/shortLinks";

/**
 * R28 — resolve a short invitation id to displayable event details,
 * SERVER-SIDE (the OG image + /i page run on the server and have no
 * access to the host's localStorage).
 *
 * Path: shortId → short_links.long_path (e.g. `/rsvp?d=<payload>&sig=…`)
 * → decode the self-contained `d` payload (no DB/event table needed —
 * the invitation payload embeds the event). All pure + isomorphic
 * (`decodeInvitation` uses `atob`, available on the server runtime).
 */
export interface InviteEventView {
  type: EventType;
  hostName: string;
  partnerName?: string;
  date: string; // YYYY-MM-DD
  city?: string;
  synagogue?: string;
  guestName?: string;
}

function payloadFromPath(path: string): string | null {
  // path looks like "/rsvp?d=<payload>&sig=<sig>"; tolerate a full URL too.
  const qIndex = path.indexOf("?");
  if (qIndex === -1) return null;
  const params = new URLSearchParams(path.slice(qIndex + 1));
  return params.get("d");
}

export async function lookupEventByToken(
  token: string,
): Promise<InviteEventView | null> {
  if (!token) return null;
  // R29 — fully guarded: lookupShortLink already swallows its own
  // errors, but decodeInvitation / URL parsing must not throw out of
  // here either (this runs in the OG/server path).
  try {
    const longPath = await lookupShortLink(token);
    if (!longPath) return null;

    const d = payloadFromPath(longPath);
    if (!d) return null;

    const decoded = decodeInvitation(d);
    if (!decoded) return null;

    const e = decoded.e;
    return {
      type: e.type,
      hostName: e.host,
      partnerName: e.partner,
      date: e.date,
      city: e.city,
      synagogue: e.synagogue,
      guestName: decoded.g?.name,
    };
  } catch (e) {
    console.error("[invitationLookup] failed", e);
    return null;
  }
}
