import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import { getSeatingAdmin, type SessionRow } from "@/lib/seating-server";

/**
 * R98 — GET /api/seating/status?session_id=…
 *
 * Reliable polling fallback for the wizard's progress view (the Realtime
 * subscription is an enhancement on top of this). Returns the session row,
 * status tallies, and the most recent notifications for the live feed.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSeatingAdmin();
  if (!admin)
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
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

  const { data: notifs } = (await admin
    .from("seating_notifications")
    .select("status")
    .eq("session_id", sessionId)) as { data: { status: string }[] | null };
  const rows = notifs ?? [];
  const counts = {
    total: rows.length,
    queued: rows.filter((r) => r.status === "queued").length,
    sending: rows.filter((r) => r.status === "sending").length,
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
    retrying: rows.filter((r) => r.status === "retrying").length,
  };

  const { data: recent } = (await admin
    .from("seating_notifications")
    .select("guest_name, table_number, status, error_message, sent_at")
    .eq("session_id", sessionId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(8)) as {
    data:
      | {
          guest_name: string;
          table_number: number;
          status: string;
          error_message: string | null;
          sent_at: string | null;
        }[]
      | null;
  };

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      total_guests: session.total_guests,
      total_tables: session.total_tables,
      sent_count: session.sent_count,
      failed_count: session.failed_count,
      completed_at: session.completed_at,
    },
    counts,
    recent: recent ?? [],
  });
}
