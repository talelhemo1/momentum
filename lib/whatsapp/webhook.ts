import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { getWhatsAppConfig } from "./config";
import { rsvpStatusFromWebhookButton } from "./rsvpButtons";
import { createServiceClient } from "@/lib/supabase/service";
import { upsertRsvpFromServer } from "@/lib/rsvpServer";

export function verifyWebhookGet(
  mode: string | null,
  token: string | null,
  challenge: string | null,
): string | null {
  const cfg = getWhatsAppConfig();
  if (mode === "subscribe" && token && cfg.webhookVerifyToken && token === cfg.webhookVerifyToken) {
    return challenge;
  }
  return null;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = getWhatsAppConfig().appSecret;
  if (!secret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = signatureHeader.slice(7);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

interface TrackingRow {
  event_id: string;
  guest_id: string;
  user_id: string;
}

async function findGuestByPhone(phoneDigits: string): Promise<TrackingRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("whatsapp_guest_tracking")
    .select("event_id, guest_id, user_id")
    .eq("phone_e164", phoneDigits)
    .is("rsvp_replied_at", null)
    .order("rsvp_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as TrackingRow | null;
}

export async function handleWhatsAppWebhookPayload(
  body: Record<string, unknown>,
): Promise<{ processed: number }> {
  let processed = 0;
  const entries = body.entry as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(entries)) return { processed: 0 };

  const admin = createServiceClient();

  for (const entry of entries) {
    const changes = entry.changes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined;
      if (!value) continue;

      const messages = value.messages as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(messages)) continue;

      for (const msg of messages) {
        const from = String(msg.from ?? "").replace(/\D/g, "");
        if (!from) continue;

        let status: "confirmed" | "declined" | "maybe" | null = null;

        if (msg.type === "button") {
          const button = msg.button as { payload?: string; text?: string } | undefined;
          status = rsvpStatusFromWebhookButton(button?.payload ?? button?.text ?? "");
        } else if (msg.type === "interactive") {
          const interactive = msg.interactive as {
            type?: string;
            button_reply?: { id?: string; title?: string };
          };
          if (interactive?.type === "button_reply") {
            status = rsvpStatusFromWebhookButton(
              interactive.button_reply?.id ?? interactive.button_reply?.title ?? "",
            );
          }
        }

        if (!status) continue;

        const tracking = await findGuestByPhone(from);
        if (!tracking) {
          console.warn("[whatsapp/webhook] no tracking for phone", from.slice(-4));
          continue;
        }

        const attendingCount = status === "declined" ? 0 : 1;
        const upsert = await upsertRsvpFromServer({
          eventId: tracking.event_id,
          guestId: tracking.guest_id,
          status,
          attendingCount,
          notes: "WhatsApp button reply",
        });

        if (!upsert.ok) {
          console.error("[whatsapp/webhook] rsvp upsert:", upsert.error);
          continue;
        }

        await admin
          .from("whatsapp_guest_tracking")
          .update({ rsvp_replied_at: new Date().toISOString() })
          .eq("event_id", tracking.event_id)
          .eq("guest_id", tracking.guest_id);

        processed += 1;
      }
    }
  }

  return { processed };
}
