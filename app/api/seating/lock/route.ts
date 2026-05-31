import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import {
  getSeatingAdmin,
  loadSeatingState,
  buildSnapshots,
  liveValidation,
  venueOf,
} from "@/lib/seating-server";

/**
 * R98 — POST /api/seating/lock
 *
 * Freezes a snapshot of the current seating and opens a send session. Only
 * ONE active session per event (enforced by a partial unique index); if one
 * already exists we return it so the host can resume rather than fork state.
 *
 * Body: { reception_time: "19:00", venue?: string }
 * Returns: { session_id, total_guests, total_tables, summary }
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSeatingAdmin();
  if (!admin)
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    reception_time?: string;
    venue?: string;
  };
  const receptionTime = (body.reception_time ?? "").trim() || "19:00";

  const state = await loadSeatingState(admin, user.id);
  if (!state) return NextResponse.json({ error: "no_event" }, { status: 400 });
  if (state.tables.length === 0)
    return NextResponse.json({ error: "no_tables" }, { status: 400 });

  const venue = (body.venue ?? "").trim() || venueOf(state.event);
  const eventId = state.event.id;

  // Resume an existing active session instead of erroring out.
  const { data: existing } = (await admin
    .from("seating_send_sessions")
    .select(
      "id, total_guests, total_tables, reception_time, venue, status",
    )
    .eq("user_id", user.id)
    .eq("event_id", eventId)
    .in("status", ["locked", "approved", "sending"])
    .maybeSingle()) as {
    data: {
      id: string;
      total_guests: number;
      total_tables: number;
      reception_time: string;
      venue: string;
      status: string;
    } | null;
  };

  const { summary } = liveValidation(state);

  if (existing) {
    return NextResponse.json({
      session_id: existing.id,
      reused: true,
      status: existing.status,
      reception_time: existing.reception_time,
      venue: existing.venue,
      total_guests: existing.total_guests,
      total_tables: existing.total_tables,
      summary,
    });
  }

  const snap = buildSnapshots(state);
  const { data: inserted, error } = (await admin
    .from("seating_send_sessions")
    .insert({
      event_id: eventId,
      user_id: user.id,
      reception_time: receptionTime,
      venue,
      guest_snapshot: snap.guestSnapshot,
      table_snapshot: snap.tableSnapshot,
      status: "locked",
      total_guests: snap.totalGuests,
      total_tables: snap.totalTables,
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };

  if (error || !inserted) {
    console.error("[seating/lock] insert failed:", error?.message);
    return NextResponse.json({ error: "lock_failed" }, { status: 500 });
  }

  return NextResponse.json({
    session_id: inserted.id,
    reused: false,
    status: "locked",
    reception_time: receptionTime,
    venue,
    total_guests: snap.totalGuests,
    total_tables: snap.totalTables,
    summary,
  });
}
