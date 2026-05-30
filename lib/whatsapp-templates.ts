/**
 * R79 — public registry of approved WhatsApp Content Templates.
 *
 * The Content SID is the unique identifier WhatsApp gives an approved
 * template (starts with "HX..."). Reading it as a NEXT_PUBLIC_* env var
 * means the client knows up-front whether a template path is even
 * possible — so we can fall back gracefully to free-form / wa.me when
 * the template isn't configured yet (e.g. during the 24-48h approval
 * window after submission).
 *
 * Empty string when the env var isn't set; callers MUST check before
 * passing to sendWhatsAppMessage({ templateSid }).
 */

/** First-contact guest invitation — required for the very first message
 *  a guest receives. Once the user has replied, free-form text works
 *  inside the 24h customer-service window. */
export const GUEST_INVITATION_TEMPLATE_SID: string =
  process.env.NEXT_PUBLIC_TWILIO_TEMPLATE_INVITATION_SID ?? "";

/** Reminder template for guests who haven't responded in N days. Same
 *  rule: required outside the 24h window. */
export const RSVP_REMINDER_TEMPLATE_SID: string =
  process.env.NEXT_PUBLIC_TWILIO_TEMPLATE_REMINDER_SID ?? "";

/** True when the invitation template SID is set. The send flow uses
 *  this to decide whether to attempt a template-based first send or to
 *  fall straight back to the wa.me path. */
export function hasGuestInvitationTemplate(): boolean {
  return GUEST_INVITATION_TEMPLATE_SID.startsWith("HX");
}

export interface GuestInvitationVars {
  /** Guest first name — {{1}} in the template. */
  guestName: string;
  /** Host names — {{2}} in the template. */
  hostNames: string;
  /** Formatted date string — {{3}} in the template. */
  date: string;
  /** Venue + city — {{4}} in the template. */
  venue: string;
  /** Bare RSVP URL — {{5}} in the template. */
  rsvpUrl: string;
}

/** Build the `variables` map that POST /api/whatsapp/send expects when
 *  the request carries a `templateSid`. The shape mirrors Twilio's
 *  ContentVariables — keys are positional ("1", "2", ...).
 *
 *  R118 — defensive trimming. Meta enforces a per-variable length cap
 *  on approved templates; exceeding it returns code 63020 ("generic
 *  permanent failure") on Twilio's side and the host sees "לא נמסר"
 *  with no useful detail. Trimming AND truncating each value here
 *  keeps long guest names / multi-word venues from blowing through
 *  Meta's silent limit. The 60 / 100 caps are conservative — the
 *  actual Meta limit is 1024 but they also enforce a "looks like
 *  spam" heuristic on anything over ~150 that we want to avoid. */
export function buildGuestInvitationVariables(
  vars: GuestInvitationVars,
): Record<string, string> {
  return {
    "1": (vars.guestName ?? "").trim().slice(0, 60) || "אורח",
    "2": (vars.hostNames ?? "").trim().slice(0, 60) || "המשפחה",
    "3": (vars.date ?? "").trim().slice(0, 40) || "פרטים בלינק",
    "4": (vars.venue ?? "").trim().slice(0, 100) || "פרטים בלינק",
    "5": (vars.rsvpUrl ?? "").trim().slice(0, 200),
  };
}

export interface RsvpReminderVars {
  /** Guest first name — {{1}} */
  guestName: string;
  /** Host names — {{2}} */
  hostNames: string;
  /** Days until the event ("3", "7", ...) — {{3}} */
  daysUntil: string;
  /** Bare RSVP URL — {{4}} */
  rsvpUrl: string;
}

export function buildRsvpReminderVariables(
  vars: RsvpReminderVars,
): Record<string, string> {
  return {
    "1": vars.guestName,
    "2": vars.hostNames,
    "3": vars.daysUntil,
    "4": vars.rsvpUrl,
  };
}

/** True when the reminder template SID is set. Used by the (future)
 *  reminder cron / bulk-action UI to decide whether the API path is
 *  available, or to fall back to a manual nudge. */
export function hasRsvpReminderTemplate(): boolean {
  return RSVP_REMINDER_TEMPLATE_SID.startsWith("HX");
}

/**
 * R94 — `event_update_he` template. Sent to guests who have ALREADY
 * confirmed, to (a) remind them the event is near (cron: 7-day + 1-day),
 * and (b) let the host push a manual update from the dashboard. Same
 * 5-variable shape as the invitation template so the approved Meta
 * content can reuse familiar positional slots ({{1}}..{{5}}).
 */
export const EVENT_UPDATE_TEMPLATE_SID: string =
  process.env.NEXT_PUBLIC_TWILIO_TEMPLATE_EVENT_UPDATE_SID ?? "";

/** True when the event-update template SID is configured. Callers MUST
 *  check this before sending — without an approved template, WhatsApp
 *  silently drops messages sent outside the 24h window. */
export function hasEventUpdateTemplate(): boolean {
  return EVENT_UPDATE_TEMPLATE_SID.startsWith("HX");
}

export interface EventUpdateVars {
  /** Guest first name — {{1}} */
  guestName: string;
  /** Host names — {{2}} */
  hostNames: string;
  /** Formatted (Hebrew) date string — {{3}} */
  date: string;
  /** Venue + city — {{4}} */
  venue: string;
  /** Bare RSVP / details URL — {{5}} */
  rsvpUrl: string;
}

/** Build the positional `variables` map for the event-update template.
 *  Mirrors `buildGuestInvitationVariables`: defensive trim + truncate
 *  (R118) so long names / multi-word venues don't trip Meta's silent
 *  per-variable length cap (error 63020). */
export function buildEventUpdateVariables(
  vars: EventUpdateVars,
): Record<string, string> {
  return {
    "1": (vars.guestName ?? "").trim().slice(0, 60) || "אורח",
    "2": (vars.hostNames ?? "").trim().slice(0, 60) || "המשפחה",
    "3": (vars.date ?? "").trim().slice(0, 40) || "פרטים בלינק",
    "4": (vars.venue ?? "").trim().slice(0, 100) || "פרטים בלינק",
    "5": (vars.rsvpUrl ?? "").trim().slice(0, 200),
  };
}
