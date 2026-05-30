import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  sendRsvpConfirmation,
  sendRsvpDecline,
} from "@/lib/rsvp-confirmation";
import { rateLimit } from "@/lib/serverRateLimit";

/**
 * R119 — POST /api/rsvp/confirm
 *
 * Called by the guest's RSVP client immediately after publishRsvpUpdate
 * resolves successfully. Sends SMS (Twilio) + Email (Resend) to the
 * guest confirming we got their answer, with venue + Waze link for
 * "yes", or just an acknowledgement link for "no".
 *
 * Why a server route instead of calling SMS/Resend straight from the
 * client:
 *   1. Twilio credentials + Resend API key must NEVER ship to the
 *      browser; centralizing here keeps them server-only.
 *   2. Rate limit per (eventId,guestId) so a guest spamming the page
 *      doesn't trigger 50 SMS to themselves.
 *   3. Future: this is where we'll attach an HMAC verification of
 *      the RSVP token if abuse becomes a problem; for now the worst
 *      case is "someone sends a confirmation SMS to a number they
 *      already have" — already-known data + low-cost spam vector,
 *      acceptable.
 *
 * No auth header required — the guest opening the RSVP link is anon.
 * RSVP submissions themselves go through Supabase anon-RLS the same
 * way (see supabase/migrations/2026-05-25-rsvps.sql for the gating
 * rationale).
 *
 * Body:
 *   {
 *     response: "confirmed" | "declined" | "maybe",
 *     eventId: string,           // used for the rate-limit bucket
 *     guestId: string,           // same
 *     guestName: string,
 *     guestPhone?: string,       // optional; SMS skipped if absent
 *     guestEmail?: string,       // optional; email skipped if absent
 *     hostNames: string,
 *     dateText: string,          // pre-formatted Hebrew date
 *     venue: string,
 *     wazeUrl?: string,
 *     rsvpUrl?: string,          // used by decline path
 *   }
 *
 * Returns:
 *   200 { ok: true, sms: {...}, email: {...} } — channel statuses
 *   400 { ok: false, error }                   — missing required fields
 *   429 { ok: false, error: "rate_limited" }   — too many attempts
 */

interface Body {
  response?: "confirmed" | "declined" | "maybe";
  eventId?: string;
  guestId?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  hostNames?: string;
  dateText?: string;
  venue?: string;
  wazeUrl?: string;
  rsvpUrl?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const eventId = (body.eventId ?? "").trim();
  const guestId = (body.guestId ?? "").trim();
  const guestName = (body.guestName ?? "").trim();
  const hostNames = (body.hostNames ?? "").trim();
  const response = body.response;

  if (!eventId || !guestId) {
    return NextResponse.json(
      { ok: false, error: "missing_event_or_guest_id" },
      { status: 400 },
    );
  }
  if (!response || !["confirmed", "declined", "maybe"].includes(response)) {
    return NextResponse.json(
      { ok: false, error: "invalid_response" },
      { status: 400 },
    );
  }
  if (!guestName || !hostNames) {
    return NextResponse.json(
      { ok: false, error: "missing_names" },
      { status: 400 },
    );
  }

  // Rate limit by (eventId,guestId) — 5 confirmations per guest per
  // hour. The guest legitimately changing their mind 2-3 times is
  // normal; 5 is enough headroom; anything beyond is abuse.
  const bucketKey = `${eventId}:${guestId}`;
  if (!rateLimit("rsvp-confirm", bucketKey, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  // "Maybe" → no notification (it's an "I'll get back to you", no
  // logistics or finality to confirm). Return success so the client
  // doesn't show an error for what was a deliberate skip.
  if (response === "maybe") {
    return NextResponse.json({
      ok: true,
      sms: { status: "skipped" },
      email: { status: "skipped" },
    });
  }

  const guestPhone = (body.guestPhone ?? "").trim() || null;
  const guestEmail = (body.guestEmail ?? "").trim() || null;

  // If neither channel was provided there's nothing to send — return
  // success with both skipped so the client treats it as "ok, just
  // no confirmation channel available".
  if (!guestPhone && !guestEmail) {
    return NextResponse.json({
      ok: true,
      sms: { status: "skipped", error: "no_channel" },
      email: { status: "skipped", error: "no_channel" },
    });
  }

  try {
    if (response === "declined") {
      const result = await sendRsvpDecline({
        guestPhone,
        guestEmail,
        guestName,
        hostNames,
        rsvpUrl: body.rsvpUrl ?? "https://moomentum.events",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await sendRsvpConfirmation({
      guestPhone,
      guestEmail,
      guestName,
      hostNames,
      dateText: (body.dateText ?? "").trim() || "פרטים בלינק",
      venue: (body.venue ?? "").trim() || "פרטים בלינק",
      wazeUrl: body.wazeUrl?.trim() || undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/rsvp/confirm] exception:", msg);
    // Don't echo the raw Twilio/Resend error back to the (anonymous) caller
    // — it can leak integration internals like rate-limit state or config
    // hints. It's already logged server-side above; the client only needs
    // the generic failure code (and this path is fire-and-forget anyway).
    return NextResponse.json(
      { ok: false, error: "internal" },
      { status: 500 },
    );
  }
}
