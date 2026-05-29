import "server-only";

import { getWhatsAppConfig } from "./config";
import { sendWhatsAppTemplate } from "./client";
import { logWhatsAppOutbound } from "./tracking";

export async function notifyVendorLeadViaWhatsApp(input: {
  userId: string;
  vendorSlug: string;
  vendorPhoneE164: string;
  coupleName: string;
  couplePhone: string;
  message: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const cfg = getWhatsAppConfig();
  if (!cfg.configured) {
    return { sent: false, error: "whatsapp_not_configured" };
  }

  const bodyText = input.message?.trim() || "התעניינות חדשה מ-Momentum";
  const result = await sendWhatsAppTemplate({
    toE164Digits: input.vendorPhoneE164,
    templateName: cfg.templates.vendorLead,
    bodyParameters: [
      input.coupleName.slice(0, 80),
      input.couplePhone.slice(0, 32),
      bodyText.slice(0, 200),
    ],
  });

  await logWhatsAppOutbound({
    userId: input.userId,
    vendorSlug: input.vendorSlug,
    phoneE164: input.vendorPhoneE164,
    templateName: cfg.templates.vendorLead,
    waMessageId: result.messageId,
    status: result.ok ? "sent" : "failed",
    error: result.error,
  });

  return { sent: result.ok, error: result.error };
}
