import "server-only";

import { getWhatsAppConfig } from "./config";

export interface SendTemplateInput {
  toE164Digits: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: string[];
}

export interface SendTemplateResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an approved WhatsApp template message via Meta Cloud API.
 * `toE164Digits` — digits only, 972… (no leading +).
 */
export async function sendWhatsAppTemplate(
  input: SendTemplateInput,
): Promise<SendTemplateResult> {
  const cfg = getWhatsAppConfig();
  if (!cfg.configured || !cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: "whatsapp_not_configured" };
  }

  const components: Array<Record<string, unknown>> = [];
  if (input.bodyParameters && input.bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: input.bodyParameters.map((text) => ({
        type: "text",
        text: text.slice(0, 1024),
      })),
    });
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: input.toE164Digits.replace(/\D/g, ""),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode ?? "he" },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      },
    );

    const data = (await res.json()) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      const msg = data.error?.message ?? `whatsapp_${res.status}`;
      console.error("[whatsapp] send failed:", msg, data.error?.code);
      return { ok: false, error: msg };
    }

    return {
      ok: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (e) {
    console.error("[whatsapp] send threw:", e);
    return { ok: false, error: "whatsapp_network" };
  }
}
