// R14.2 — server-only guard. Prevents the RESEND_API_KEY /
// CALLMEBOT_* env-var references from ever appearing in a client
// bundle by accident.
import "server-only";

/**
 * Notification dispatcher for new vendor applications.
 *
 * Tries email (Resend) and WhatsApp (CallMeBot personal API) in parallel.
 * Both are optional — missing env vars degrade to a console warn + DB log
 * row, so the app never crashes on missing config.
 *
 * To enable email: sign up at resend.com, set RESEND_API_KEY in .env.local.
 * To enable WhatsApp: get a CallMeBot key (free for personal use, see
 * https://www.callmebot.com/blog/free-api-whatsapp-messages/) and set
 * CALLMEBOT_PHONE + CALLMEBOT_API_KEY.
 */

import type { VendorApplicationInput } from "./vendorApplication";
import { VENDOR_CATEGORIES } from "./vendorApplication";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "talhemo132@gmail.com";

interface NotifyResult {
  channel: "email" | "whatsapp";
  status: "sent" | "skipped" | "failed";
  error?: string;
}

function categoryLabel(id: string): string {
  return VENDOR_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildMessage(
  app: VendorApplicationInput,
  applicationId: string,
): { subject: string; text: string; html: string } {
  const subject = `🆕 בקשת הצטרפות חדשה: ${app.business_name}`;
  const lines = [
    `התקבלה בקשה חדשה להצטרפות לפלטפורמה.`,
    ``,
    `🏢 שם העסק: ${app.business_name}`,
    `👤 איש קשר: ${app.contact_name}`,
    `📞 טלפון: ${app.phone}`,
    `📧 מייל: ${app.email}`,
    `📍 עיר: ${app.city ?? "לא צוין"}`,
    `📂 קטגוריה: ${categoryLabel(app.category)}`,
    ``,
    `🆔 ת.ז./מס' עוסק: ${app.business_id}`,
    `⏳ ניסיון: ${app.years_in_field} שנים`,
    `🔗 דוגמת עבודה: ${app.sample_work_url}`,
    ``,
  ];
  if (app.website) lines.push(`🌐 אתר: ${app.website}`);
  if (app.instagram) lines.push(`📸 אינסטגרם: ${app.instagram}`);
  if (app.facebook) lines.push(`📘 פייסבוק: ${app.facebook}`);
  if (app.about) lines.push(``, `📝 אודות:`, app.about);
  const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-domain.com"}/admin/vendors`;
  lines.push(``, `👉 לאישור/דחייה: ${adminUrl}`, ``, `מזהה בקשה: ${applicationId}`);
  return {
    subject,
    text: lines.join("\n"),
    html: lines
      .map((l) => (l ? `<p>${escapeHtml(l)}</p>` : "<br>"))
      .join(""),
  };
}

/** External providers occasionally hang. We cap each call at NOTIFY_TIMEOUT_MS
 *  so a slow Resend / CallMeBot can't keep the apply request open. */
const NOTIFY_TIMEOUT_MS = 5000;

async function sendEmail(msg: {
  subject: string;
  text: string;
  html: string;
}): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[vendorNotifications] RESEND_API_KEY not set — skipping email");
    return { channel: "email", status: "skipped" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Momentum <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: msg.subject,
        html: msg.html,
      }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { channel: "email", status: "failed", error: `${res.status}: ${err}` };
    }
    return { channel: "email", status: "sent" };
  } catch (e) {
    return {
      channel: "email",
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function sendWhatsapp(msg: { text: string }): Promise<NotifyResult> {
  const phone = process.env.CALLMEBOT_PHONE;
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!phone || !apiKey) {
    console.warn("[vendorNotifications] CALLMEBOT_PHONE/API_KEY not set — skipping WhatsApp");
    return { channel: "whatsapp", status: "skipped" };
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg.text)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS) });
    if (!res.ok) {
      return { channel: "whatsapp", status: "failed", error: `${res.status}` };
    }
    return { channel: "whatsapp", status: "sent" };
  } catch (e) {
    return {
      channel: "whatsapp",
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function notifyAdminOfNewApplication(
  app: VendorApplicationInput,
  applicationId: string,
): Promise<NotifyResult[]> {
  const msg = buildMessage(app, applicationId);
  const results = await Promise.all([sendEmail(msg), sendWhatsapp({ text: msg.text })]);
  return results;
}
