import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyCronSecret } from "@/lib/serverAuthUser";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { buildDailyDigestParams } from "@/lib/whatsapp/digest";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { logWhatsAppOutbound } from "@/lib/whatsapp/tracking";

interface AppStatePayload {
  event?: {
    hostPhone?: string;
    hostName?: string;
  };
  checklist?: unknown;
  budget?: unknown;
}

/** Daily 09:00 — WhatsApp digest to couples with hostPhone + open tasks. */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = getWhatsAppConfig();
  if (!cfg.configured) {
    return NextResponse.json({ ok: true, skipped: "whatsapp_not_configured" });
  }

  try {
    const admin = createServiceClient();
    const { data: rows, error } = await admin.from("app_states").select("user_id, payload");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;

    for (const row of rows ?? []) {
      const payload = row.payload as AppStatePayload;
      const hostPhone = payload?.event?.hostPhone;
      if (!hostPhone) {
        skipped += 1;
        continue;
      }

      const { valid, phone } = normalizeIsraeliPhone(hostPhone);
      if (!valid) {
        skipped += 1;
        continue;
      }

      const params = buildDailyDigestParams(payload);
      if (params[0]?.includes("אין משימות")) {
        skipped += 1;
        continue;
      }

      const hostName = (payload.event?.hostName ?? "שלום").trim().split(/\s+/)[0] ?? "שלום";
      const result = await sendWhatsAppTemplate({
        toE164Digits: phone,
        templateName: cfg.templates.dailyDigest,
        bodyParameters: [hostName, ...params],
      });

      await logWhatsAppOutbound({
        userId: row.user_id as string,
        phoneE164: phone,
        templateName: cfg.templates.dailyDigest,
        waMessageId: result.messageId,
        status: result.ok ? "sent" : "failed",
        error: result.error,
      });

      if (result.ok) sent += 1;
      else skipped += 1;
    }

    return NextResponse.json({ ok: true, sent, skipped });
  } catch (e) {
    console.error("[cron/whatsapp-digest]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
