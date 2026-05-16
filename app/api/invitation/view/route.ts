import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/invitation/view  (R32)
 *
 * Body: { eventId, shortId?, guestId?, guestName? }
 *
 * Records that someone opened an invitation so the couple's dashboard
 * can show it in real time. Best-effort: ALWAYS returns 200 (a tracking
 * failure must never break the guest's RSVP flow). The guest's browser
 * uses the anon key — the RLS policy on invitation_views allows the
 * open INSERT (same capability model as short_links / event_memories).
 *
 * Privacy: the raw IP is NEVER stored — only a salted SHA-256 hash, so
 * the host can tell "same device opened twice" without us holding a PII
 * identifier. user_agent is truncated to 200 chars.
 *
 * Dedup (E1): the same guest re-opening within 10 minutes is collapsed
 * — no row, returns { ok:true, skipped:true }.
 */

interface ViewBody {
  eventId?: string;
  shortId?: string;
  guestId?: string;
  guestName?: string;
}

// A static app-level salt is sufficient for the privacy goal here: we
// only need "is this the same device?" pseudonymity, not secrecy of the
// IP itself. An env override is honored if set.
const IP_SALT = process.env.IP_HASH_SALT ?? "momentum.v1.invitation-views";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as ViewBody;
    const eventId = (body.eventId ?? "").trim();
    if (!eventId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      // Supabase not configured — tracking is optional, don't error.
      return NextResponse.json({ ok: true, skipped: true });
    }

    const shortId = body.shortId?.trim() || null;
    const guestId = body.guestId?.trim() || null;
    const guestName = body.guestName?.trim()?.slice(0, 120) || null;

    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ipHash = rawIp ? await sha256Hex(`${IP_SALT}:${rawIp}`) : null;
    const userAgent =
      req.headers.get("user-agent")?.slice(0, 200) ?? null;

    const supabase = createClient(supabaseUrl, anonKey);

    // E1 — collapse repeat opens by the same guest within 10 minutes.
    if (guestId) {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: recent } = await supabase
        .from("invitation_views")
        .select("id")
        .eq("event_id", eventId)
        .eq("guest_id", guestId)
        .gt("viewed_at", since)
        .limit(1)
        .maybeSingle();
      if (recent) {
        return NextResponse.json({ ok: true, skipped: true });
      }
    }

    const { error } = await supabase.from("invitation_views").insert({
      event_id: eventId,
      short_id: shortId,
      guest_id: guestId,
      guest_name: guestName,
      user_agent: userAgent,
      ip_hash: ipHash,
    });
    if (error) {
      console.error("[invitation/view] insert failed", error.message);
      return NextResponse.json({ ok: true, skipped: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[invitation/view]", e);
    // Tracking must never surface as an error to the guest.
    return NextResponse.json({ ok: true, skipped: true });
  }
}
