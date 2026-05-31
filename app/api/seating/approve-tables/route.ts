import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import {
  getSeatingAdmin,
  loadSeatingState,
  liveValidation,
  sendableGuestsForTable,
  tableFingerprint,
  type SessionRow,
} from "@/lib/seating-server";
import { tableNumberOf } from "@/lib/seating-validation";
import { normalizeIsraeliPhone } from "@/lib/phone";

/**
 * R98 — POST /api/seating/approve-tables
 *
 * Body: { session_id, table_numbers: number[] }
 * Approves only tables that currently pass validation (no blocking errors).
 * Stores each table's fingerprint + guest ids so a later assignment change
 * auto-revokes the approval (see reconcileApprovals).
 *
 * Returns: { approved: number, rejected: number[] }
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSeatingAdmin();
  if (!admin)
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    session_id?: string;
    table_numbers?: number[];
  };
  const sessionId = (body.session_id ?? "").trim();
  const requested = Array.isArray(body.table_numbers) ? body.table_numbers : [];
  if (!sessionId || requested.length === 0)
    return NextResponse.json({ error: "missing_data" }, { status: 400 });

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
  if (session.status !== "locked" && session.status !== "approved")
    return NextResponse.json({ error: "session_not_editable" }, { status: 409 });

  const state = await loadSeatingState(admin, user.id);
  if (!state) return NextResponse.json({ error: "no_event" }, { status: 400 });

  const { tables } = liveValidation(state);
  const byNumber = new Map(
    state.tables.map((t) => [tableNumberOf(t, state.tables), t]),
  );

  // Collisions for fingerprint/sendable consistency.
  const collisions = new Set<string>();
  {
    const counts = new Map<string, number>();
    for (const g of state.guests) {
      if (!state.seatAssignments[g.id]) continue;
      const n = normalizeIsraeliPhone(g.phone || "");
      if (n.valid) counts.set(n.phone, (counts.get(n.phone) ?? 0) + 1);
    }
    for (const [p, c] of counts) if (c > 1) collisions.add(p);
  }

  const rejected: number[] = [];
  const toUpsert: {
    session_id: string;
    user_id: string;
    table_number: number;
    table_name: string | null;
    guest_count: number;
    guest_snapshot: { fingerprint: string; guestIds: string[] };
    validation_result: unknown;
    status: "approved";
  }[] = [];

  for (const num of requested) {
    const table = byNumber.get(num);
    const validation = tables.find((t) => t.tableNumber === num);
    if (!table || !validation || validation.status === "error") {
      rejected.push(num);
      continue;
    }
    const sendable = sendableGuestsForTable(table, state, collisions);
    toUpsert.push({
      session_id: session.id,
      user_id: user.id,
      table_number: num,
      table_name: table.name || null,
      guest_count: validation.guestCount,
      guest_snapshot: {
        fingerprint: tableFingerprint(table, state, collisions),
        guestIds: sendable.map((g) => g.id),
      },
      validation_result: validation,
      status: "approved",
    });
  }

  if (toUpsert.length > 0) {
    const { error } = await admin
      .from("seating_table_approvals")
      .upsert(toUpsert, { onConflict: "session_id,table_number" });
    if (error) {
      console.error("[seating/approve-tables] upsert failed:", error.message);
      return NextResponse.json({ error: "approve_failed" }, { status: 500 });
    }
    // Move the session out of "locked" the moment anything is approved.
    if (session.status === "locked") {
      await admin
        .from("seating_send_sessions")
        .update({ status: "approved" })
        .eq("id", session.id);
    }
  }

  return NextResponse.json({ approved: toUpsert.length, rejected });
}
