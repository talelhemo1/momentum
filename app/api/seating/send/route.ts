import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import {
  getSeatingAdmin,
  loadSeatingState,
  enqueueApprovedTables,
  type SessionRow,
} from "@/lib/seating-server";
import { hasEventSeatingTemplate } from "@/lib/whatsapp-templates";
import { isWhatsAppConfigured } from "@/lib/twilio-whatsapp";

/**
 * R98 — POST /api/seating/send
 *
 * Body: { session_id }
 * Blocked unless the seating template + WhatsApp sender are configured.
 * Reconciles approvals (drifted tables are revoked), then creates ONE queued
 * notification row per sendable guest in a still-approved table. The actual
 * delivery happens in /api/seating/worker (pumped live by the dashboard and
 * by the cron backstop). Returns: { session_id, queued, tables }.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSeatingAdmin();
  if (!admin)
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  if (!isWhatsAppConfigured())
    return NextResponse.json({ error: "whatsapp_not_configured" }, { status: 400 });
  if (!hasEventSeatingTemplate())
    return NextResponse.json({ error: "template_not_configured" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { session_id?: string };
  const sessionId = (body.session_id ?? "").trim();
  if (!sessionId)
    return NextResponse.json({ error: "missing_session" }, { status: 400 });

  const { data: session } = (await admin
    .from("seating_send_sessions")
    .select(
      "id, event_id, user_id, reception_time, venue, status, total_guests, total_tables, sent_count, failed_count, locked_at, completed_at",
    )
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle()) as { data: SessionRow | null };

  if (!session)
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  if (session.status === "completed" || session.status === "cancelled")
    return NextResponse.json({ error: "session_closed" }, { status: 409 });

  const state = await loadSeatingState(admin, user.id);
  if (!state) return NextResponse.json({ error: "no_event" }, { status: 400 });

  const { queued, tables } = await enqueueApprovedTables(admin, session, state);
  if (tables === 0)
    return NextResponse.json({ error: "no_approved_tables" }, { status: 400 });
  if (queued === 0)
    return NextResponse.json({ error: "no_sendable_guests" }, { status: 400 });

  await admin
    .from("seating_send_sessions")
    .update({ status: "sending" })
    .eq("id", session.id);

  return NextResponse.json({ session_id: session.id, queued, tables });
}
