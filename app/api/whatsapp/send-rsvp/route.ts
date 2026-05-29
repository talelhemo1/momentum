import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { logWhatsAppOutbound, upsertGuestTracking } from "@/lib/whatsapp/tracking";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/serverRateLimit";
import { isGuestEligibleForVoiceCall } from "@/lib/voiceRsvpFromCall";

type RsvpScope = "not_confirmed" | "all_with_phone";

interface GuestRow {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface StartBody {
  eventId?: string;
  scope?: RsvpScope;
  guests?: GuestRow[];
  coupleNames?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromBearer(req);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!rateLimit("whatsapp-rsvp", user.id, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "rate_limited", message: "יותר מדי קמפיינים בשעה האחרונה" },
        { status: 429 },
      );
    }

    const body = (await req.json()) as StartBody;
    const eventId = (body.eventId ?? "").trim();
    const scope: RsvpScope =
      body.scope === "all_with_phone" ? "all_with_phone" : "not_confirmed";
    const guests = Array.isArray(body.guests) ? body.guests : [];
    const coupleNames = (body.coupleNames ?? "").trim() || "האירוע";

    if (!eventId || guests.length === 0) {
      return NextResponse.json({ error: "missing_event_or_guests" }, { status: 400 });
    }

    const cfg = getWhatsAppConfig();
    if (!cfg.configured) {
      return NextResponse.json({
        configured: false,
        message:
          "WhatsApp Business עדיין לא מחובר. הוסף WHATSAPP_ACCESS_TOKEN ו-WHATSAPP_PHONE_NUMBER_ID ב-Vercel.",
        eligible: 0,
        sent: 0,
        failed: 0,
        results: [],
      });
    }

    const eligible = guests.filter((g) => {
      const { valid, phone } = normalizeIsraeliPhone(g.phone);
      if (!valid) return false;
      if (scope === "all_with_phone") return true;
      return isGuestEligibleForVoiceCall(
        g.status as "pending" | "invited" | "confirmed" | "declined" | "maybe",
      );
    });

    const results: Array<{ guestId: string; ok: boolean; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const g of eligible) {
      const { phone } = normalizeIsraeliPhone(g.phone);
      const send = await sendWhatsAppTemplate({
        toE164Digits: phone,
        templateName: cfg.templates.rsvp,
        bodyParameters: [g.name.slice(0, 80), coupleNames.slice(0, 120)],
      });

      await logWhatsAppOutbound({
        userId: user.id,
        eventId,
        guestId: g.id,
        phoneE164: phone,
        templateName: cfg.templates.rsvp,
        waMessageId: send.messageId,
        status: send.ok ? "sent" : "failed",
        error: send.error,
      });

      if (send.ok) {
        sent += 1;
        await upsertGuestTracking({
          userId: user.id,
          eventId,
          guestId: g.id,
          phoneE164: phone,
        });
        results.push({ guestId: g.id, ok: true });
      } else {
        failed += 1;
        results.push({ guestId: g.id, ok: false, error: send.error });
      }
    }

    return NextResponse.json({
      configured: true,
      eligible: eligible.length,
      sent,
      failed,
      results,
    });
  } catch (e) {
    console.error("[whatsapp/send-rsvp]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
