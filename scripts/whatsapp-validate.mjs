#!/usr/bin/env node
/**
 * Validates Meta WhatsApp Cloud API credentials from .env.local (or shell env).
 *
 * Usage:
 *   node scripts/whatsapp-validate.mjs
 *   node scripts/whatsapp-validate.mjs --env .env.local
 *   node scripts/whatsapp-validate.mjs --dry-send 972501234567
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const WHATSAPP_VARS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_API_VERSION",
  "WHATSAPP_TEMPLATE_RSVP",
  "WHATSAPP_TEMPLATE_SEATING",
  "WHATSAPP_TEMPLATE_VENDOR_LEAD",
  "WHATSAPP_TEMPLATE_DAILY_DIGEST",
];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function mask(val, show = 4) {
  if (!val) return "(empty)";
  if (val.length <= show * 2) return "*".repeat(val.length);
  return `${val.slice(0, show)}…${val.slice(-show)} (${val.length} chars)`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let envPath = resolve(root, ".env.local");
  let drySend = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) {
      envPath = resolve(process.cwd(), args[++i]);
    } else if (args[i] === "--dry-send" && args[i + 1]) {
      drySend = args[++i].replace(/\D/g, "");
    }
  }
  return { envPath, drySend };
}

async function graphGet(path, token, version) {
  const url = `https://graph.facebook.com/${version}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function graphPost(path, token, version, body) {
  const url = `https://graph.facebook.com/${version}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function statusIcon(ok) {
  return ok ? "✓" : "✗";
}

async function main() {
  const { envPath, drySend } = parseArgs();
  loadEnvFile(envPath);

  const banner = "═".repeat(60);
  console.log(banner);
  console.log("  Momentum — WhatsApp Business credential check");
  console.log(banner);
  console.log(`Env file: ${envPath} (${existsSync(envPath) ? "found" : "missing — using shell env only"})`);

  let fail = 0;

  console.log("\n1) Environment variables (presence)");
  const present = {};
  for (const key of WHATSAPP_VARS) {
    const val = (process.env[key] ?? "").trim();
    present[key] = !!val;
    const required = [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
    ].includes(key);
    const icon = statusIcon(val);
    const tag = required ? "REQUIRED" : "recommended";
    console.log(`  ${icon} ${key} [${tag}] ${val ? mask(val) : "(not set)"}`);
    if (required && !val) fail++;
  }

  const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const version = (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim();
  const templates = {
    rsvp: (process.env.WHATSAPP_TEMPLATE_RSVP ?? "rsvp_confirm").trim(),
    seating: (process.env.WHATSAPP_TEMPLATE_SEATING ?? "seat_assignment").trim(),
    vendorLead: (process.env.WHATSAPP_TEMPLATE_VENDOR_LEAD ?? "vendor_new_lead").trim(),
    dailyDigest: (process.env.WHATSAPP_TEMPLATE_DAILY_DIGEST ?? "daily_digest").trim(),
  };

  if (!token || !phoneId) {
    console.log("\n" + banner);
    console.log("Result: FAIL — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID first.");
    process.exit(1);
  }

  console.log("\n2) Meta API — phone number ID + token");
  const phoneFields =
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type";
  const phoneRes = await graphGet(
    `${phoneId}?fields=${phoneFields}`,
    token,
    version,
  );
  let wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null;
  if (phoneRes.ok) {
    const p = phoneRes.data;
    console.log(`  ✓ Phone number authenticated`);
    console.log(`    display: ${p.display_phone_number ?? "—"}`);
    console.log(`    verified name: ${p.verified_name ?? "—"}`);
    console.log(`    quality: ${p.quality_rating ?? "—"}`);
    console.log(`    verification: ${p.code_verification_status ?? "—"}`);
    console.log(`    platform: ${p.platform_type ?? "—"}`);
    if (!wabaId) {
      const wabaRes = await graphGet(
        `${phoneId}?fields=whatsapp_business_account`,
        token,
        version,
      );
      wabaId = wabaRes.data?.whatsapp_business_account?.id ?? null;
    }
    if (wabaId) console.log(`    WABA id: ${wabaId}`);
    else
      console.log(
        "    ℹ WABA id not returned — set WHATSAPP_BUSINESS_ACCOUNT_ID in .env.local to verify templates",
      );
  } else {
    fail++;
    const err = phoneRes.data?.error;
    console.log(`  ✗ Phone number check failed (HTTP ${phoneRes.status})`);
    console.log(`    ${err?.message ?? JSON.stringify(phoneRes.data)}`);
    if (err?.code === 190) console.log("    Hint: token expired or invalid — regenerate in Meta Business / System User.");
    if (err?.code === 100) console.log("    Hint: wrong WHATSAPP_PHONE_NUMBER_ID — copy from WhatsApp → API Setup.");
  }

  console.log("\n3) Message templates (approved names)");
  const templateNames = [...new Set(Object.values(templates))];
  if (wabaId) {
    const tplRes = await graphGet(
      `${wabaId}/message_templates?limit=100&fields=name,status,language,category`,
      token,
      version,
    );
    if (tplRes.ok) {
      const list = tplRes.data?.data ?? [];
      const byName = new Map(list.map((t) => [t.name, t]));
      for (const [label, name] of Object.entries(templates)) {
        const t = byName.get(name);
        if (t?.status === "APPROVED") {
          console.log(`  ✓ ${label}: "${name}" — APPROVED (${t.language ?? "?"})`);
        } else if (t) {
          fail++;
          console.log(`  ✗ ${label}: "${name}" — status ${t.status} (need APPROVED)`);
        } else {
          fail++;
          console.log(`  ✗ ${label}: "${name}" — not found on this WABA`);
        }
      }
    } else {
      fail++;
      console.log(`  ✗ Could not list templates: ${tplRes.data?.error?.message ?? tplRes.status}`);
    }
  } else {
    console.log("  ⚠ Skipped — WABA id unavailable from phone lookup");
    for (const [label, name] of Object.entries(templates)) {
      console.log(`    expected ${label}: "${name}"`);
    }
  }

  console.log("\n4) Webhook readiness (local config only)");
  const verifyTok = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "").trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET ?? "").trim();
  if (verifyTok) {
    console.log(`  ✓ WHATSAPP_WEBHOOK_VERIFY_TOKEN set ${mask(verifyTok)}`);
  } else {
    fail++;
    console.log("  ✗ WHATSAPP_WEBHOOK_VERIFY_TOKEN missing — Meta webhook GET verify will fail");
  }
  if (appSecret) {
    console.log(`  ✓ WHATSAPP_APP_SECRET set ${mask(appSecret)} (POST signature verification enabled)`);
  } else {
    console.log("  ⚠ WHATSAPP_APP_SECRET missing — webhook POST accepts any body (insecure for production)");
  }

  console.log("\n5) Production checklist");
  const checks = [
    ["Access token + phone ID valid", phoneRes.ok],
    ["Webhook verify token set", !!verifyTok],
    ["App secret set (recommended)", !!appSecret],
    ["RSVP template approved", false],
    ["Deployed callback URL", false],
  ];
  if (wabaId && phoneRes.ok) {
    const tplRes2 = await graphGet(
      `${wabaId}/message_templates?limit=100&fields=name,status`,
      token,
      version,
    );
    const approved = new Set(
      (tplRes2.data?.data ?? [])
        .filter((t) => t.status === "APPROVED")
        .map((t) => t.name),
    );
    checks[3][1] = approved.has(templates.rsvp);
  }
  for (const [label, ok] of checks) {
    console.log(`  ${statusIcon(ok)} ${label}`);
  }
  console.log("  ℹ Callback URL (configure in Meta): https://moomentum.events/api/webhooks/whatsapp");
  console.log("  ℹ Add test recipients in Meta Developer Console before messaging non-opted-in numbers");

  if (drySend) {
    console.log(`\n6) Dry template send to ${drySend} (RSVP template)`);
    const sendRes = await graphPost(
      `${phoneId}/messages`,
      token,
      version,
      {
        messaging_product: "whatsapp",
        to: drySend,
        type: "template",
        template: {
          name: templates.rsvp,
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
      },
    );
    if (sendRes.ok) {
      console.log(`  ✓ Message accepted — id: ${sendRes.data?.messages?.[0]?.id ?? "?"}`);
    } else {
      fail++;
      console.log(`  ✗ Send failed: ${sendRes.data?.error?.message ?? sendRes.status}`);
      if (sendRes.data?.error?.code === 131030)
        console.log("    Hint: recipient not in allowed list — add as test number in Meta.");
    }
  } else {
    console.log("\n6) Optional live send: node scripts/whatsapp-validate.mjs --dry-send 972XXXXXXXXX");
  }

  console.log("\n" + banner);
  if (fail > 0) {
    console.log(`Result: FAIL — ${fail} issue(s). Fix before client production testing.`);
    process.exit(1);
  }
  console.log("Result: PASS — credentials and templates look ready for client testing.");
  console.log("Next: deploy env to Vercel Production, subscribe webhook in Meta, run /guests RSVP send.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
