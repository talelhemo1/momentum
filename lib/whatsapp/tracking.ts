import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export async function logWhatsAppOutbound(input: {
  userId: string;
  eventId?: string;
  guestId?: string;
  vendorSlug?: string;
  phoneE164: string;
  templateName: string;
  waMessageId?: string;
  status: "sent" | "failed";
  error?: string;
}): Promise<void> {
  try {
    const admin = createServiceClient();
    await admin.from("whatsapp_message_log").insert({
      user_id: input.userId,
      event_id: input.eventId ?? null,
      guest_id: input.guestId ?? null,
      vendor_slug: input.vendorSlug ?? null,
      phone_e164: input.phoneE164,
      template_name: input.templateName,
      wa_message_id: input.waMessageId ?? null,
      status: input.status,
      error: input.error ?? null,
    });
  } catch (e) {
    console.error("[whatsapp/tracking] log failed:", e);
  }
}

export async function upsertGuestTracking(input: {
  userId: string;
  eventId: string;
  guestId: string;
  phoneE164: string;
}): Promise<void> {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  await admin.from("whatsapp_guest_tracking").upsert(
    {
      user_id: input.userId,
      event_id: input.eventId,
      guest_id: input.guestId,
      phone_e164: input.phoneE164,
      rsvp_sent_at: now,
    },
    { onConflict: "event_id,guest_id" },
  );
}
