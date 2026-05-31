import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0)
    process.env[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
}

const token = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const verify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const v = process.env.WHATSAPP_API_VERSION || "v21.0";
const tpl = process.env.WHATSAPP_TEMPLATE_RSVP || "rsvp_confirm";

async function findWaba() {
  for (const path of [
    "me?fields=businesses{id,name}",
    "me/businesses?fields=id,name",
    `${phoneId}?fields=throughput`,
  ]) {
    const r = await fetch(`https://graph.facebook.com/${v}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    console.log("probe", path, r.status, JSON.stringify(d).slice(0, 400));
  }
  const r2 = await fetch(
    `https://graph.facebook.com/${v}/${phoneId}/whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  console.log("waba edge", r2.status, (await r2.text()).slice(0, 400));

  const tplPaths = [
    `${phoneId}/message_templates?limit=20&fields=name,status,language`,
    "message_templates?limit=5",
  ];
  for (const path of tplPaths) {
    const r = await fetch(`https://graph.facebook.com/${v}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("templates", path, r.status, (await r.text()).slice(0, 600));
  }
}

async function webhookProd() {
  const base = "https://moomentum.events/api/webhooks/whatsapp";
  const bad = new URL(base);
  bad.searchParams.set("hub.mode", "subscribe");
  bad.searchParams.set("hub.verify_token", "wrong");
  bad.searchParams.set("hub.challenge", "12345");
  const r1 = await fetch(bad);
  console.log("webhook wrong token:", r1.status, await r1.text());

  const good = new URL(base);
  good.searchParams.set("hub.mode", "subscribe");
  good.searchParams.set("hub.verify_token", verify);
  good.searchParams.set("hub.challenge", "12345");
  const r2 = await fetch(good);
  const body = await r2.text();
  console.log("webhook correct token:", r2.status, body === "12345" ? "challenge OK" : body.slice(0, 80));
}

async function templateSend(to) {
  const r = await fetch(
    `https://graph.facebook.com/${v}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: tpl,
          language: { code: "he" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: "בדיקה" },
                { type: "text", text: "מומנטום" },
              ],
            },
          ],
        },
      }),
    },
  );
  const d = await r.json();
  console.log("template send", r.status, JSON.stringify(d));
}

const to = process.argv[2];
console.log("=== WABA discovery ===");
await findWaba();
console.log("\n=== Production webhook ===");
await webhookProd();
if (to) {
  console.log("\n=== Template send test ===");
  await templateSend(to);
} else {
  console.log("\n(skip send — pass E.164 digits as argv[2])");
}
