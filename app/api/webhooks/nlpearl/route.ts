import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  mapVoiceCallToRsvp,
  parseExternalGuestId,
} from "@/lib/voiceRsvpFromCall";
import { upsertRsvpFromServer } from "@/lib/rsvpServer";

/**
 * NLPearl Call Webhook (V2 camelCase).
 * Configure in Pearl settings → Webhooks → Call Webhook URL:
 *   https://<your-domain>/api/webhooks/nlpearl
 *
 * Optional: set NLPEARL_WEBHOOK_SECRET and send header x-nlpearl-secret.
 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "nlpearl-webhook" });
}

export async function POST(req: NextRequest) {
  const secret = (process.env.NLPEARL_WEBHOOK_SECRET ?? "").trim();
  if (secret) {
    const got = req.headers.get("x-nlpearl-secret");
    if (got !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const collectedInfo = body.collectedInfo as
    | { id?: string; name?: string; value?: unknown }[]
    | undefined;
  const collectedData = body.collectedData as Record<string, unknown> | undefined;

  const mapping = mapVoiceCallToRsvp({
    conversationStatus: body.conversationStatus as string | undefined,
    status: body.status as string | undefined,
    collectedInfo,
    collectedData,
    summary: (body.summary as string) ?? null,
  });

  const callData = body.callData as Record<string, unknown> | undefined;
  const externalId =
    (body.externalId as string) ??
    (collectedData?.externalId as string) ??
    (callData?.externalId as string);

  const ids = parseExternalGuestId(
    typeof externalId === "string" ? externalId : null,
  );

  if (!mapping || !ids) {
    return NextResponse.json({
      ok: true,
      applied: false,
      reason: mapping ? "missing_external_id" : "no_rsvp_mapping",
    });
  }

  const upsert = await upsertRsvpFromServer({
    eventId: ids.eventId,
    guestId: ids.guestId,
    status: mapping.status,
    attendingCount: mapping.attendingCount,
    notes: mapping.note,
  });

  if (!upsert.ok) {
    console.error("[webhooks/nlpearl] rsvp upsert:", upsert.error);
    return NextResponse.json({ ok: false, error: upsert.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    applied: true,
    guestId: ids.guestId,
    status: mapping.status,
    attendingCount: mapping.attendingCount,
  });
}
