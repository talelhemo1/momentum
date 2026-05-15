// R25 — server-only Twilio SMS sender. The `server-only` import makes
// any accidental client import a build error (keeps TWILIO_AUTH_TOKEN
// out of the browser bundle), matching lib/vendorNotificationsRich.ts.
import "server-only";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_SMS_FROM ?? "+972533625007";

/**
 * Send a single SMS via the Twilio REST API (direct fetch, no SDK —
 * same pattern as vendorNotificationsRich / cfo extract).
 *
 * Never throws: returns `{ ok: false, error }` so callers can degrade
 * gracefully (the WhatsApp channel is the primary path; SMS is backup).
 */
export async function sendSms({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!to) return { ok: false, error: "missing recipient" };
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    // Feature-detect: missing creds = silent, optional skip.
    return { ok: false, error: "twilio not configured" };
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", TWILIO_FROM);
  form.set("Body", body);

  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString(
      "base64",
    );
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[twilioClient] Twilio ${res.status}: ${errBody.slice(0, 200)}`,
      );
      return { ok: false, error: `twilio ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[twilioClient] fetch failed", e);
    return { ok: false, error: "network" };
  }
}
