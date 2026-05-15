import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  buildInviteText,
  buildManagerInviteWhatsapp,
} from "@/lib/managerInvitation";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { sendSms } from "@/lib/twilioClient";

/**
 * POST /api/manager/invite  (R25 — Momentum Live dual-channel)
 *
 * Body: { eventId, managerName, managerPhone, invitationToken,
 *         eventHostName, eventDate }
 *
 * Fires the SAME invite message over SMS (Twilio) as the WhatsApp
 * builder produces, and returns the wa.me URL so the client can still
 * open WhatsApp in parallel.
 *
 * ALWAYS returns 200 — SMS is the backup channel; a Twilio failure (or
 * no Twilio creds) must not block the WhatsApp flow. The payload tells
 * the client what happened: `{ smsSent, smsError?, waUrl }`.
 */
interface InviteBody {
  eventId?: string;
  managerName?: string;
  managerPhone?: string;
  invitationToken?: string;
  eventHostName?: string;
  eventDate?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InviteBody;
    const managerName = (body.managerName ?? "").trim();
    const managerPhone = (body.managerPhone ?? "").trim();
    const invitationToken = (body.invitationToken ?? "").trim();
    const eventHostName = (body.eventHostName ?? "").trim();

    if (!managerName || !managerPhone || !invitationToken || !eventHostName) {
      // Even on bad input we keep the contract (200 + waUrl) so the
      // client's parallel WhatsApp open still has something to use.
      return NextResponse.json(
        { smsSent: false, smsError: "missing fields", waUrl: "" },
        { status: 200 },
      );
    }

    const inviteInput = {
      managerName,
      managerPhone,
      invitationToken,
      eventHostName,
      eventDate: body.eventDate,
    };

    const text = buildInviteText(inviteInput);
    const { url: waUrl } = buildManagerInviteWhatsapp(inviteInput);

    // SMS recipient must be E.164 (+972…). normalizeIsraeliPhone yields
    // "972XXXXXXXXX"; prefix "+".
    const { phone, valid } = normalizeIsraeliPhone(managerPhone);
    if (!valid) {
      return NextResponse.json(
        { smsSent: false, smsError: "invalid phone", waUrl },
        { status: 200 },
      );
    }

    const sms = await sendSms({ to: `+${phone}`, body: text });

    return NextResponse.json(
      {
        smsSent: sms.ok,
        ...(sms.ok ? {} : { smsError: sms.error }),
        waUrl,
      },
      { status: 200 },
    );
  } catch (e) {
    // Never leak internals; never break the WhatsApp path.
    console.error("[/api/manager/invite]", e);
    return NextResponse.json(
      { smsSent: false, smsError: "server error", waUrl: "" },
      { status: 200 },
    );
  }
}
