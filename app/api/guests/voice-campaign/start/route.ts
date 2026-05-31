import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getNlpearlConfig, nlpearlMakeCall } from "@/lib/nlpearl";
import {
  buildExternalGuestId,
  isGuestEligibleForVoiceCampaign,
} from "@/lib/voiceRsvpFromCall";
import type { GuestStatus } from "@/lib/types";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/serverRateLimit";

interface CampaignGuest {
  id: string;
  name: string;
  phone: string;
  status: string;
  invitedAt?: string | null;
  reminderSentAt?: string | null;
  whatsappRsvpSentAt?: string | null;
}

interface CampaignEvent {
  hostName: string;
  partnerName?: string;
  date?: string;
  type?: string;
}

interface StartBody {
  eventId?: string;
  guests?: CampaignGuest[];
  event?: CampaignEvent;
}

function eventDisplayName(ev: CampaignEvent): string {
  const a = (ev.hostName ?? "").trim();
  const b = (ev.partnerName ?? "").trim();
  if (a && b) return `${a} ו${b}`;
  return a || b || "האירוע";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StartBody;
    const eventId = (body.eventId ?? "").trim();
    const guests = Array.isArray(body.guests) ? body.guests : [];
    const event = body.event ?? { hostName: "" };

    if (!eventId || guests.length === 0) {
      return NextResponse.json(
        { error: "missing_event_or_guests" },
        { status: 400 },
      );
    }

    // SERVER-side enforcement of the voice gate (the client filter can be
    // bypassed): valid phone + no answer yet + already sent ≥2 messages.
    // There is intentionally no "call everyone" path — voice costs money.
    const eligiblePreview = guests.filter((g) => {
      const { valid } = normalizeIsraeliPhone(g.phone);
      if (!valid) return false;
      return isGuestEligibleForVoiceCampaign({
        status: g.status as GuestStatus,
        invitedAt: g.invitedAt ?? null,
        reminderSentAt: g.reminderSentAt ?? null,
        whatsappRsvpSentAt: g.whatsappRsvpSentAt ?? null,
      });
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const auth = req.headers.get("authorization");
    if (!supabaseUrl || !anonKey || !auth?.startsWith("Bearer ")) {
      return NextResponse.json({
        configured: false,
        message:
          "יש להתחבר לחשבון כדי להפעיל שיחות. התחבר/י מהתפריט ואז נסה שוב.",
        eligible: eligiblePreview.length,
        queued: 0,
        failed: 0,
        results: [],
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({
        configured: false,
        message:
          "ההתחברות פגה או לא תקינה. התנתק/י והתחבר/י מחדש, ואז נסה שוב.",
        eligible: eligiblePreview.length,
        queued: 0,
        failed: 0,
        results: [],
      });
    }

    if (!rateLimit("voice-campaign", user.id, 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "rate_limited", message: "יותר מדי קמפיינים בשעה האחרונה" },
        { status: 429 },
      );
    }

    const eligible = eligiblePreview;

    const nlpearl = getNlpearlConfig();
    if (!nlpearl.configured) {
      return NextResponse.json({
        configured: false,
        message:
          "NLPearl עדיין לא מחובר. הוסף NLPEARL_API_KEY ו-NLPEARL_OUTBOUND_ID ב-Vercel (Preview) ואז נסה שוב.",
        eligible: eligible.length,
        queued: 0,
        failed: 0,
        results: [],
      });
    }

    const couple = eventDisplayName(event);
    const results: Array<{
      guestId: string;
      ok: boolean;
      error?: string;
      callId?: string;
    }> = [];

    let queued = 0;
    let failed = 0;

    for (const g of eligible) {
      const { phone } = normalizeIsraeliPhone(g.phone);
      const externalId = buildExternalGuestId(eventId, g.id);
      const call = await nlpearlMakeCall({
        to: phone.startsWith("+") ? phone : `+${phone}`,
        externalId,
        callData: {
          guestName: g.name,
          coupleNames: couple,
          eventDate: event.date ?? "",
          externalId,
        },
      });
      if (call.ok) {
        queued += 1;
        results.push({ guestId: g.id, ok: true, callId: call.callId });
      } else {
        failed += 1;
        results.push({ guestId: g.id, ok: false, error: call.error });
      }
    }

    return NextResponse.json({
      configured: true,
      eligible: eligible.length,
      queued,
      failed,
      results,
    });
  } catch (e) {
    console.error("[voice-campaign/start]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
