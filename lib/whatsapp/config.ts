import "server-only";

/**
 * Meta WhatsApp Cloud API configuration.
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */

export interface WhatsAppConfig {
  configured: boolean;
  accessToken: string | null;
  phoneNumberId: string | null;
  webhookVerifyToken: string | null;
  appSecret: string | null;
  apiVersion: string;
  templates: {
    rsvp: string;
    seating: string;
    vendorLead: string;
    dailyDigest: string;
  };
  buttonPayloads: {
    yes: string;
    no: string;
    maybe: string;
  };
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim() || null;
  const phoneNumberId =
    (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim() || null;

  return {
    configured: !!(accessToken && phoneNumberId),
    accessToken,
    phoneNumberId,
    webhookVerifyToken:
      (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "").trim() || null,
    appSecret: (process.env.WHATSAPP_APP_SECRET ?? "").trim() || null,
    apiVersion: (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim(),
    templates: {
      rsvp: (process.env.WHATSAPP_TEMPLATE_RSVP ?? "rsvp_confirm").trim(),
      seating: (process.env.WHATSAPP_TEMPLATE_SEATING ?? "seat_assignment").trim(),
      vendorLead: (process.env.WHATSAPP_TEMPLATE_VENDOR_LEAD ?? "vendor_new_lead").trim(),
      dailyDigest: (process.env.WHATSAPP_TEMPLATE_DAILY_DIGEST ?? "daily_digest").trim(),
    },
    buttonPayloads: {
      yes: (process.env.WHATSAPP_BTN_RSVP_YES ?? "rsvp_yes").trim(),
      no: (process.env.WHATSAPP_BTN_RSVP_NO ?? "rsvp_no").trim(),
      maybe: (process.env.WHATSAPP_BTN_RSVP_MAYBE ?? "rsvp_maybe").trim(),
    },
  };
}
