// R94 — server-side WhatsApp event-reminder sender.
//
// Used by the daily cron (app/api/cron/event-reminders) to nudge guests
// who have already CONFIRMED that the event is approaching (7 days out,
// then 1 day out).
//
// Why call `sendWhatsAppTemplate` (lib/twilio-whatsapp) DIRECTLY instead
// of POSTing to /api/whatsapp/send like the client wrapper does:
//   • /api/whatsapp/send requires `Authorization: Bearer <user token>`
//     and rate-limits per signed-in user. A cron has no user session, so
//     that path would 401. The cron runs with the service role and talks
//     to Twilio through the same server-only helper the route itself uses.
//   • Keeps Twilio creds server-side (the helper imports "server-only").
//
// Never throws — returns a small status object so the cron can tally
// sent/failed/skipped without try/catch around every call.
import "server-only";
import {
  hasEventUpdateTemplate,
  EVENT_UPDATE_TEMPLATE_SID,
  buildEventUpdateVariables,
} from "./whatsapp-templates";
import { sendWhatsAppTemplate } from "./twilio-whatsapp";

export interface EventReminderParams {
  guestPhone: string;
  guestName: string;
  hostNames: string;
  /** Pre-formatted Hebrew date string (caller formats it). */
  date: string;
  venue: string;
  rsvpUrl: string;
}

export interface EventReminderResult {
  /** "sent" — Twilio accepted it; "skip" — template not configured;
   *  "failed" — Twilio rejected (bad number, outside policy, etc.). */
  status: "sent" | "skip" | "failed";
  /** Twilio message SID on success — handy for correlating in logs. */
  sid?: string;
  /** Short machine/human detail on failure (already truncated upstream). */
  detail?: string;
}

export async function sendEventReminderWhatsApp(
  params: EventReminderParams,
): Promise<EventReminderResult> {
  // Without an approved Content Template, WhatsApp drops first-contact /
  // out-of-window messages silently. Skip (don't "fail") so the cron
  // doesn't mark these as errors — there's simply no channel yet.
  if (!hasEventUpdateTemplate()) {
    return { status: "skip", detail: "template_not_configured" };
  }

  const result = await sendWhatsAppTemplate({
    to: params.guestPhone,
    contentSid: EVENT_UPDATE_TEMPLATE_SID,
    contentVariables: buildEventUpdateVariables({
      guestName: params.guestName,
      hostNames: params.hostNames,
      date: params.date,
      venue: params.venue,
      rsvpUrl: params.rsvpUrl,
    }),
  });

  if (result.ok) {
    return { status: "sent", sid: result.sid };
  }
  return { status: "failed", detail: result.detail ?? result.error };
}
