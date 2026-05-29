import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyCronSecret } from "@/lib/serverAuthUser";
import { getNlpearlConfig, nlpearlMakeCall } from "@/lib/nlpearl";
import { buildExternalGuestId } from "@/lib/voiceRsvpFromCall";

const HOURS_48_MS = 48 * 60 * 60 * 1000;

/**
 * Cron: guests who got WhatsApp RSVP template 48h+ ago, no reply → NLPearl call.
 * Requires migration whatsapp_guest_tracking + NLPEARL_* env vars.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nlpearl = getNlpearlConfig();
  if (!nlpearl.configured) {
    return NextResponse.json({ ok: true, skipped: "nlpearl_not_configured" });
  }

  const cutoff = new Date(Date.now() - HOURS_48_MS).toISOString();

  try {
    const admin = createServiceClient();
    const { data: due, error } = await admin
      .from("whatsapp_guest_tracking")
      .select("event_id, guest_id, phone_e164, user_id")
      .not("rsvp_sent_at", "is", null)
      .is("rsvp_replied_at", null)
      .is("voice_queued_at", null)
      .lt("rsvp_sent_at", cutoff)
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let queued = 0;
    let failed = 0;

    for (const row of due ?? []) {
      const externalId = buildExternalGuestId(row.event_id, row.guest_id);
      const phone = String(row.phone_e164);
      const call = await nlpearlMakeCall({
        to: phone.startsWith("+") ? phone : `+${phone}`,
        externalId,
        callData: {
          externalId,
          coupleNames: "האירוע",
          guestName: "",
          eventDate: "",
        },
      });

      const now = new Date().toISOString();
      await admin
        .from("whatsapp_guest_tracking")
        .update({ voice_queued_at: now })
        .eq("event_id", row.event_id)
        .eq("guest_id", row.guest_id);

      if (call.ok) queued += 1;
      else failed += 1;
    }

    return NextResponse.json({ ok: true, eligible: due?.length ?? 0, queued, failed });
  } catch (e) {
    console.error("[cron/whatsapp-voice-fallback]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
