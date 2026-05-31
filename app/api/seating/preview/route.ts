import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer } from "@/lib/serverAuthUser";
import {
  getSeatingAdmin,
  loadSeatingState,
  liveValidation,
  reconcileApprovals,
  sendableGuestsForTable,
  hostNamesOf,
  type SessionRow,
} from "@/lib/seating-server";
import { tableNumberOf } from "@/lib/seating-validation";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { hasEventSeatingTemplate } from "@/lib/whatsapp-templates";
import { isWhatsAppConfigured, isWhatsAppSandbox } from "@/lib/twilio-whatsapp";

/**
 * R98 — GET /api/seating/preview?session_id=…
 *
 * The heart of the review screen. Recomputes validation from the CURRENT
 * app_states payload (not the frozen snapshot) so the host always sees live
 * truth, auto-revokes any approval whose table drifted since it was approved
 * (our app-level replacement for the spec's DB trigger), and returns three
 * sample rendered messages so the host can eyeball the real content.
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

  const state = await loadSeatingState(admin, user.id);
  if (!state) return NextResponse.json({ error: "no_event" }, { status: 400 });

  // Revoke drifted approvals before we report anything.
  const { revoked } = await reconcileApprovals(admin, session, state);

  const { tables, summary } = liveValidation(state);

  // Which tables are currently (still) approved?
  const { data: approvalsNow } = (await admin
    .from("seating_table_approvals")
    .select("table_number")
    .eq("session_id", session.id)
    .eq("status", "approved")) as { data: { table_number: number }[] | null };
  const approved = new Set((approvalsNow ?? []).map((a) => a.table_number));

  const tablesOut = tables.map((t) => ({
    ...t,
    approved: approved.has(t.tableNumber),
  }));

  // Build up to 3 sample messages from approvable (non-error) tables.
  const hostNames = hostNamesOf(state.event);
  const samples: {
    guestName: string;
    tableNumber: number;
    text: string;
  }[] = [];

  // Colliding phones across seated guests — so sampled guests match the
  // sendable set the worker will actually message.
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
  const approvable = state.tables.filter((t) => {
    const v = tables.find((x) => x.tableNumber === tableNumberOf(t, state.tables));
    return v && v.status !== "error";
  });
  for (const t of approvable) {
    if (samples.length >= 3) break;
    const sendable = sendableGuestsForTable(t, state, collisions);
    const g = sendable[Math.floor(Math.random() * sendable.length)] ?? sendable[0];
    if (!g) continue;
    const num = tableNumberOf(t, state.tables);
    const first = (g.name || "").split(" ")[0] || g.name || "אורח";
    samples.push({
      guestName: g.name,
      tableNumber: num,
      // Approximation of the approved Twilio template (the real body lives in
      // Meta). Mirrors the 5 variables so the host can sanity-check wording.
      text: `שלום ${first}! מזכירים שאתם מוזמנים לאירוע של ${hostNames}. מספר השולחן שלכם: ${num}. קבלת פנים בשעה ${session.reception_time} ב${session.venue}. נתראה! 🎉`,
    });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      reception_time: session.reception_time,
      venue: session.venue,
      total_guests: session.total_guests,
      total_tables: session.total_tables,
      sent_count: session.sent_count,
      failed_count: session.failed_count,
    },
    summary,
    tables: tablesOut,
    samples,
    revokedTables: revoked,
    diagnostics: {
      templateConfigured: hasEventSeatingTemplate(),
      whatsappConfigured: isWhatsAppConfigured(),
      sandbox: isWhatsAppSandbox(),
    },
  });
}
