/**
 * Rich vendor notifications — SMS (Twilio) + email (Resend).
 *
 * Fires when a couple sends a new lead via /api/vendors/lead. Both
 * channels are independently optional; missing env vars = silent skip.
 * Errors NEVER propagate to the caller — a lead row should still be
 * created even if the notification fails (the vendor will see it in
 * the dashboard regardless).
 *
 * Inputs:
 *   - vendorPhone (E.164, e.g. "+972501234567")
 *   - vendorEmail
 *   - coupleName, coupleMessage
 *   - dashboardUrl (the deep link to the leads page)
 */

interface NotifyInput {
  vendorPhone: string | null;
  vendorEmail: string | null;
  coupleName: string;
  coupleMessage: string | null;
  dashboardUrl: string;
}

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_SMS_FROM ?? "+972533625007";
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "Momentum <noreply@momentum.app>";

export async function notifyVendorOfNewLead(input: NotifyInput): Promise<void> {
  // Fire both channels in parallel. Promise.allSettled because a failure
  // in one shouldn't kill the other — and neither should propagate to
  // the route handler.
  await Promise.allSettled([sendSms(input), sendEmail(input)]);
}

async function sendSms(input: NotifyInput): Promise<void> {
  if (!input.vendorPhone) return;
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.warn("[notify/sms] Twilio creds missing — skipping SMS");
    return;
  }
  const body = buildSmsBody(input);
  // Twilio's REST API takes form-encoded fields. We avoid the SDK to
  // keep the bundle small (matches the pattern used by /api/cfo/extract
  // for OpenAI — direct fetch).
  const form = new URLSearchParams();
  form.set("To", input.vendorPhone);
  form.set("From", TWILIO_FROM);
  form.set("Body", body);

  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[notify/sms] Twilio ${res.status}: ${errBody.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[notify/sms] fetch failed", e);
  }
}

function buildSmsBody(input: NotifyInput): string {
  const snippet = input.coupleMessage
    ? `: "${input.coupleMessage.slice(0, 80)}"`
    : "";
  // Keep under 160 chars (single SMS segment).
  const body = `ליד חדש מ-${input.coupleName}${snippet}. כנס ל-${input.dashboardUrl}`;
  return body.slice(0, 320); // 2-segment hard cap
}

async function sendEmail(input: NotifyInput): Promise<void> {
  if (!input.vendorEmail) return;
  if (!RESEND_KEY) {
    console.warn("[notify/email] RESEND_API_KEY missing — skipping email");
    return;
  }

  const html = buildEmailHtml(input);
  const subject = `ליד חדש מ-${input.coupleName} — Momentum`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [input.vendorEmail],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[notify/email] Resend ${res.status}: ${errBody.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[notify/email] fetch failed", e);
  }
}

function buildEmailHtml(input: NotifyInput): string {
  // Minimal HTML — no fancy framework. Email clients strip half of it
  // anyway. Just a heading, the message, and a single big CTA.
  const safeName = escapeHtml(input.coupleName);
  const safeMessage = input.coupleMessage
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-right:3px solid #D4B068;background:#1A1310;color:#D4D4D4;font-style:italic;">${escapeHtml(input.coupleMessage)}</blockquote>`
    : "";
  return `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:32px 16px;background:#0A0A0B;font-family:-apple-system,Segoe UI,Heebo,sans-serif;color:#F2F2F2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr><td style="padding:24px;background:#14100C;border:1px solid #2A2520;border-radius:16px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#F4DEA9;">ליד חדש מ-${safeName}</h1>
      <p style="margin:0 0 12px;color:#A8A8A8;font-size:14px;">זוג חדש מעוניין בשירותיך דרך Momentum.</p>
      ${safeMessage}
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;background:linear-gradient(135deg,#F4DEA9,#A8884A);color:#1A1310;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">צפה בליד ושלח הצעה</a>
      </p>
    </td></tr>
    <tr><td style="padding:16px;text-align:center;color:#666;font-size:11px;">
      Momentum · פלטפורמה לתכנון אירועים
    </td></tr>
  </table>
</body>
</html>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
