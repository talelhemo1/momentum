import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  handleWhatsAppWebhookPayload,
  verifyWebhookGet,
  verifyWebhookSignature,
} from "@/lib/whatsapp/webhook";

/** Meta WhatsApp webhook — GET verify + POST inbound messages/buttons. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const ok = verifyWebhookGet(mode, token, challenge);
  if (ok) return new NextResponse(ok, { status: 200 });
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, sig)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const { processed } = await handleWhatsAppWebhookPayload(body);
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error("[webhooks/whatsapp]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
