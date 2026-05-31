import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer, verifyCronSecret } from "@/lib/serverAuthUser";
import { getSeatingAdmin, claimAndSendBatch } from "@/lib/seating-server";

/**
 * R98 — the delivery worker. Two entry points, same engine:
 *
 *   GET  — Vercel Cron backstop. Auth: `Authorization: Bearer ${CRON_SECRET}`.
 *          Drains a batch across ALL sessions (handles retries whose backoff
 *          has elapsed even if the host closed their tab).
 *
 *   POST — Dashboard live-pump. Auth: user bearer token. Drains a batch for
 *          ONE session the caller owns and returns progress so the wizard's
 *          step-4 loop can keep pumping until `remaining` hits 0.
 *
 * claimAndSendBatch atomically flips rows to 'sending' before dispatch, so the
 * cron and the live-pump can run simultaneously without double-sending.
 */

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSeatingAdmin();
  if (!admin)
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  // Larger batch for the cron — it runs unattended and has the full
  // maxDuration budget (declared in vercel.json).
  const result = await claimAndSendBatch(admin, { limit: 50 });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSeatingAdmin();
  if (!admin)
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    session_id?: string;
    retry?: boolean;
  };
  const sessionId = (body.session_id ?? "").trim();
  if (!sessionId)
    return NextResponse.json({ error: "missing_session" }, { status: 400 });

  // Confirm ownership before draining a session.
  const { data: session } = (await admin
    .from("seating_send_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!session)
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });

  // Manual "retry failures": reset permanently-failed rows back to a fresh
  // attempt budget and reopen the session so the pump picks them up.
  if (body.retry) {
    await admin
      .from("seating_notifications")
      .update({
        status: "retrying",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        failed_at: null,
      })
      .eq("session_id", sessionId)
      .eq("status", "failed");
    await admin
      .from("seating_send_sessions")
      .update({ status: "sending" })
      .eq("id", sessionId);
  }

  const result = await claimAndSendBatch(admin, { sessionId, limit: 25 });
  return NextResponse.json({ ok: true, ...result });
}
