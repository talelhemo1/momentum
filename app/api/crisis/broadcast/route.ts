import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { sendSms } from "@/lib/twilioClient";
import { rateLimit } from "@/lib/serverRateLimit";

/**
 * POST /api/crisis/broadcast  (R27)
 *
 * Body: { eventId, message }
 * Auth: Bearer <supabase access token> (the manager triggering it).
 *
 * Blasts the crisis message via SMS to every manager of the event.
 * ALWAYS 200 — partial failure must not block the UI. Payload:
 * `{ sent, failed }`.
 */
interface BroadcastBody {
  eventId?: string;
  message?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { sent: 0, failed: 0, error: "supabase not configured" },
        { status: 200 },
      );
    }

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json(
        { sent: 0, failed: 0, error: "not authenticated" },
        { status: 200 },
      );
    }

    const body = (await req.json()) as BroadcastBody;
    const eventId = (body.eventId ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!eventId || !message) {
      return NextResponse.json(
        { sent: 0, failed: 0, error: "missing fields" },
        { status: 200 },
      );
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${auth.slice(7)}` } },
    });

    // R30 SECURITY: the previous code only checked the header *starts*
    // with "Bearer " (theatre — `Authorization: Bearer x` passed). Now
    // we actually validate the session, and rate-limit per user+event
    // so a manager can't loop this into an SMS-bomb / Twilio cost burn.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { sent: 0, failed: 0, error: "not authenticated" },
        { status: 200 },
      );
    }
    if (
      !rateLimit(
        "crisis-broadcast",
        `${user.id}:${eventId}`,
        5,
        15 * 60 * 1000,
      )
    ) {
      return NextResponse.json(
        { sent: 0, failed: 0, error: "rate_limited" },
        { status: 200 },
      );
    }

    // RLS additionally scopes this to managers the caller may see.
    const { data } = (await supabase
      .from("event_managers")
      .select("invitee_phone, status")
      .eq("event_id", eventId)
      .in("status", ["invited", "accepted"])) as {
      data: { invitee_phone: string | null; status: string }[] | null;
    };

    const phones = Array.from(
      new Set(
        (data ?? [])
          .map((r) => r.invitee_phone)
          .filter((p): p is string => !!p),
      ),
    );

    const prefixed = `🚨 התראת חירום — Momentum Live\n\n${message}`;
    let sent = 0;
    let failed = 0;

    // Sequential keeps us well under Twilio's burst limits for the
    // handful of managers an event has.
    for (const raw of phones) {
      const { phone, valid } = normalizeIsraeliPhone(raw);
      if (!valid) {
        failed += 1;
        continue;
      }
      const r = await sendSms({ to: `+${phone}`, body: prefixed });
      if (r.ok) sent += 1;
      else failed += 1;
    }

    return NextResponse.json({ sent, failed }, { status: 200 });
  } catch (e) {
    console.error("[/api/crisis/broadcast]", e);
    return NextResponse.json(
      { sent: 0, failed: 0, error: "server error" },
      { status: 200 },
    );
  }
}
