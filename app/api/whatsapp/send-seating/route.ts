import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { logWhatsAppOutbound } from "@/lib/whatsapp/tracking";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/serverRateLimit";

interface GuestSeatRow {
  id: string;
  name: string;
  phone: string;
  tableLabel: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromBearer(req);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!rateLimit("whatsapp-seating", user.id, 3, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const body = (await req.json()) as {
      eventId?: string;
      guests?: GuestSeatRow[];
    };
    const eventId = (body.eventId ?? "").trim();
    const guests = Array.isArray(body.guests) ? body.guests : [];

    if (!eventId || guests.length === 0) {
      return NextResponse.json({ error: "missing_data" }, { status: 400 });
    }

    const cfg = getWhatsAppConfig();
    if (!cfg.configured) {
      return NextResponse.json({
        configured: false,
        message: "WhatsApp Business לא מחובר.",
        sent: 0,
        failed: 0,
      });
    }

    let sent = 0;
    let failed = 0;
    const results: Array<{ guestId: string; ok: boolean; error?: string }> = [];

    for (const g of guests) {
      const { valid, phone } = normalizeIsraeliPhone(g.phone);
      if (!valid) {
        failed += 1;
        results.push({ guestId: g.id, ok: false, error: "invalid_phone" });
        continue;
      }

      const send = await sendWhatsAppTemplate({
        toE164Digits: phone,
        templateName: cfg.templates.seating,
        bodyParameters: [
          g.name.slice(0, 80),
          g.tableLabel.slice(0, 60),
        ],
      });

      await logWhatsAppOutbound({
        userId: user.id,
        eventId,
        guestId: g.id,
        phoneE164: phone,
        templateName: cfg.templates.seating,
        waMessageId: send.messageId,
        status: send.ok ? "sent" : "failed",
        error: send.error,
      });

      if (send.ok) {
        sent += 1;
        results.push({ guestId: g.id, ok: true });
      } else {
        failed += 1;
        results.push({ guestId: g.id, ok: false, error: send.error });
      }
    }

    return NextResponse.json({ configured: true, sent, failed, results });
  } catch (e) {
    console.error("[whatsapp/send-seating]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
