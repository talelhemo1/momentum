// R98 — server-only core for the bulletproof seating-notification system.
//
// Holds everything that touches the service-role Supabase client or Twilio:
//   • loadSeatingState  — read the authoritative app_states.payload for a user
//   • snapshot builders  — freeze the guest/table lists at lock time
//   • per-table "fingerprint" — the app-level replacement for the spec's
//     (impossible here) DB trigger that revokes an approval when the seating
//     changes. We compare the live fingerprint to the one stored at approval
//     time; any drift revokes the approval before a send can use it.
//   • enqueueApprovedTables — turn live, still-valid approvals into one
//     queued seating_notifications row per guest (UNIQUE(session,guest)
//     guarantees no duplicates)
//   • claimAndSendBatch — atomically claim a batch of queued/retrying rows,
//     send via Twilio, record result, apply exponential backoff. Safe to run
//     from BOTH the dashboard live-pump and the cron backstop at once.
//
// Architecture note: this project stores all user state in a single JSON blob
// (app_states.payload). There is no `events`/`guests` table, so ownership is
// by `user_id` and ids are app-generated TEXT. See the migration header.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EventInfo, Guest, SeatingTable } from "./types";
import {
  validateAllTables,
  guestsForTable,
  tableNumberOf,
  type TableValidation,
  type SeatingSummary,
} from "./seating-validation";
import { normalizeIsraeliPhone } from "./phone";
import {
  EVENT_SEATING_TEMPLATE_SID,
  buildEventSeatingVariables,
} from "./whatsapp-templates";
import { sendWhatsAppTemplate } from "./twilio-whatsapp";

// ── tuning ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;
/** Backoff before retry N (1-indexed): 1min, 5min, 15min. */
const BACKOFFS_MS = [60_000, 5 * 60_000, 15 * 60_000];
/** Polite send pace — ~8/sec, well under Twilio's account cap. */
const THROTTLE_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── service-role client ─────────────────────────────────────────────────────
export function getSeatingAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── load the authoritative live state from app_states ───────────────────────
export interface SeatingState {
  event: EventInfo;
  guests: Guest[];
  tables: SeatingTable[];
  seatAssignments: Record<string, string>;
}

interface AppPayload {
  event?: EventInfo | null;
  guests?: Guest[] | null;
  tables?: SeatingTable[] | null;
  seatAssignments?: Record<string, string> | null;
}

export async function loadSeatingState(
  admin: SupabaseClient,
  userId: string,
): Promise<SeatingState | null> {
  const { data, error } = (await admin
    .from("app_states")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle()) as {
    data: { payload: AppPayload | null } | null;
    error: { message: string } | null;
  };
  if (error || !data?.payload?.event) return null;
  const p = data.payload;
  return {
    event: p.event as EventInfo,
    guests: Array.isArray(p.guests) ? p.guests : [],
    tables: Array.isArray(p.tables) ? p.tables : [],
    seatAssignments:
      p.seatAssignments && typeof p.seatAssignments === "object"
        ? p.seatAssignments
        : {},
  };
}

// ── host display name (matches the reminder cron) ────────────────────────────
export function hostNamesOf(event: EventInfo): string {
  const host = (event.hostName ?? "").trim();
  const partner = (event.partnerName ?? "").trim();
  return partner ? `${host} ו${partner}` : host || "המשפחה";
}

/** Default venue string — synagogue · city, falling back gracefully. */
export function venueOf(event: EventInfo): string {
  return (
    [event.synagogue, event.city].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ") ||
    "פרטים בהזמנה"
  );
}

// ── sendable guests for a table (confirmed + valid + not a phone collision) ──
function collidingPhonesAcross(
  guests: Guest[],
  seatAssignments: Record<string, string>,
): Set<string> {
  const counts = new Map<string, number>();
  for (const g of guests) {
    if (!seatAssignments[g.id]) continue;
    const n = normalizeIsraeliPhone(g.phone || "");
    if (!n.valid) continue;
    counts.set(n.phone, (counts.get(n.phone) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [p, c] of counts) if (c > 1) out.add(p);
  return out;
}

export function sendableGuestsForTable(
  table: SeatingTable,
  state: SeatingState,
  collisions: Set<string>,
): Guest[] {
  return guestsForTable(table.id, state.guests, state.seatAssignments).filter(
    (g) => {
      const n = normalizeIsraeliPhone(g.phone || "");
      return g.status === "confirmed" && n.valid && !collisions.has(n.phone);
    },
  );
}

/**
 * Stable fingerprint of a table's sendable set. ANY change (guest added /
 * removed / moved tables / phone edited / table renumbered) flips it — which
 * is exactly when a prior approval must be revoked. This is the app-level
 * stand-in for the spec's DB trigger.
 */
export function tableFingerprint(
  table: SeatingTable,
  state: SeatingState,
  collisions: Set<string>,
): string {
  const num = tableNumberOf(table, state.tables);
  const parts = sendableGuestsForTable(table, state, collisions)
    .map((g) => `${g.id}:${normalizeIsraeliPhone(g.phone).phone}`)
    .sort();
  return `t${num}|${parts.join(",")}`;
}

// ── snapshots stored on the session at lock time ─────────────────────────────
export interface GuestSnapshotRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  tableId: string;
  tableNumber: number;
  tableName: string | null;
}
export interface TableSnapshotRow {
  id: string;
  number: number;
  name: string | null;
  capacity: number;
}

export function buildSnapshots(state: SeatingState): {
  guestSnapshot: GuestSnapshotRow[];
  tableSnapshot: TableSnapshotRow[];
  totalGuests: number;
  totalTables: number;
} {
  const tableSnapshot: TableSnapshotRow[] = state.tables.map((t) => ({
    id: t.id,
    number: tableNumberOf(t, state.tables),
    name: t.name || null,
    capacity: t.capacity,
  }));
  const byId = new Map(state.tables.map((t) => [t.id, t]));
  const guestSnapshot: GuestSnapshotRow[] = state.guests
    .filter((g) => state.seatAssignments[g.id])
    .map((g) => {
      const tableId = state.seatAssignments[g.id]!;
      const t = byId.get(tableId);
      return {
        id: g.id,
        name: g.name,
        phone: g.phone,
        status: g.status,
        tableId,
        tableNumber: t ? tableNumberOf(t, state.tables) : 0,
        tableName: t?.name || null,
      };
    });
  return {
    guestSnapshot,
    tableSnapshot,
    totalGuests: guestSnapshot.length,
    totalTables: tableSnapshot.length,
  };
}

// ── live validation (recomputed from the current payload) ────────────────────
export function liveValidation(state: SeatingState): {
  tables: TableValidation[];
  summary: SeatingSummary;
} {
  return validateAllTables(state.tables, state.guests, state.seatAssignments);
}

// ── build the Twilio variables for one guest ─────────────────────────────────
export function buildSeatingVariables(
  guest: Guest,
  tableNumber: number,
  event: EventInfo,
  receptionTime: string,
  venue: string,
): Record<string, string> {
  return buildEventSeatingVariables({
    guestName: (guest.name || "").split(" ")[0] || guest.name || "אורח",
    hostNames: hostNamesOf(event),
    tableNumber: String(tableNumber),
    receptionTime,
    venue,
  });
}

// ── DB row shapes we read back ───────────────────────────────────────────────
export interface SessionRow {
  id: string;
  event_id: string;
  user_id: string;
  reception_time: string;
  venue: string;
  status: string;
  total_guests: number;
  total_tables: number;
  sent_count: number;
  failed_count: number;
  locked_at: string;
  completed_at: string | null;
}
export interface ApprovalRow {
  id: string;
  session_id: string;
  table_number: number;
  table_name: string | null;
  guest_count: number;
  guest_snapshot: { fingerprint: string; guestIds: string[] };
  status: string;
}

/**
 * Reconcile approvals against the LIVE state: any approved table whose
 * fingerprint changed since approval is revoked. Returns the set of table
 * numbers that are currently APPROVED and still valid.
 */
export async function reconcileApprovals(
  admin: SupabaseClient,
  session: SessionRow,
  state: SeatingState,
): Promise<{ liveApproved: Set<number>; revoked: number[] }> {
  const { data: approvals } = (await admin
    .from("seating_table_approvals")
    .select("id, table_number, guest_snapshot, status")
    .eq("session_id", session.id)
    .eq("status", "approved")) as {
    data:
      | { id: string; table_number: number; guest_snapshot: { fingerprint?: string }; status: string }[]
      | null;
  };
  const collisions = collidingPhonesAcross(state.guests, state.seatAssignments);
  const byNumber = new Map(
    state.tables.map((t) => [tableNumberOf(t, state.tables), t]),
  );
  const liveApproved = new Set<number>();
  const revoked: number[] = [];

  for (const a of approvals ?? []) {
    const table = byNumber.get(a.table_number);
    const liveFp = table ? tableFingerprint(table, state, collisions) : "__gone__";
    if (table && liveFp === a.guest_snapshot?.fingerprint) {
      liveApproved.add(a.table_number);
    } else {
      revoked.push(a.table_number);
      await admin
        .from("seating_table_approvals")
        .update({ status: "revoked" })
        .eq("id", a.id);
    }
  }
  return { liveApproved, revoked };
}

/**
 * Turn every still-valid approved table into queued notification rows — one
 * per sendable guest. Idempotent: UNIQUE(session_id, guest_id) + upsert
 * ignoreDuplicates means re-running never double-queues or double-sends.
 * Returns how many rows are now queued for this session.
 */
export async function enqueueApprovedTables(
  admin: SupabaseClient,
  session: SessionRow,
  state: SeatingState,
): Promise<{ queued: number; tables: number }> {
  const { liveApproved } = await reconcileApprovals(admin, session, state);
  if (liveApproved.size === 0) return { queued: 0, tables: 0 };

  const collisions = collidingPhonesAcross(state.guests, state.seatAssignments);
  const byNumber = new Map(
    state.tables.map((t) => [tableNumberOf(t, state.tables), t]),
  );

  type NotifInsert = {
    session_id: string;
    event_id: string;
    user_id: string;
    guest_id: string;
    guest_name: string;
    guest_phone: string;
    table_number: number;
    template_sid: string;
    template_variables: Record<string, string>;
    status: "queued";
  };
  const rows: NotifInsert[] = [];

  for (const num of liveApproved) {
    const table = byNumber.get(num);
    if (!table) continue;
    for (const g of sendableGuestsForTable(table, state, collisions)) {
      rows.push({
        session_id: session.id,
        event_id: session.event_id,
        user_id: session.user_id,
        guest_id: g.id,
        guest_name: g.name,
        guest_phone: normalizeIsraeliPhone(g.phone).phone,
        table_number: num,
        template_sid: EVENT_SEATING_TEMPLATE_SID,
        template_variables: buildSeatingVariables(
          g,
          num,
          state.event,
          session.reception_time,
          session.venue,
        ),
        status: "queued",
      });
    }
  }

  if (rows.length === 0) return { queued: 0, tables: liveApproved.size };

  // Insert in chunks; ignoreDuplicates makes the whole thing replay-safe.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await admin
      .from("seating_notifications")
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: "session_id,guest_id",
        ignoreDuplicates: true,
      });
  }

  return { queued: rows.length, tables: liveApproved.size };
}

// ── refresh a session's counters + flip to completed when terminal ───────────
async function refreshSessionStatus(
  admin: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { data } = (await admin
    .from("seating_notifications")
    .select("status")
    .eq("session_id", sessionId)) as { data: { status: string }[] | null };
  const rows = data ?? [];
  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const pending = rows.filter(
    (r) => r.status === "queued" || r.status === "sending" || r.status === "retrying",
  ).length;

  const patch: Record<string, unknown> = { sent_count: sent, failed_count: failed };
  if (rows.length > 0 && pending === 0) {
    patch.status = "completed";
    patch.completed_at = new Date().toISOString();
  }
  await admin.from("seating_send_sessions").update(patch).eq("id", sessionId);
}

// ── atomic claim + send of one batch ─────────────────────────────────────────
interface ClaimRow {
  id: string;
  session_id: string;
  guest_phone: string;
  template_sid: string;
  template_variables: Record<string, string>;
  attempts: number;
}

export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  retrying: number;
  /** Rows still claimable right now (excludes retries scheduled in the future). */
  remaining: number;
}

export async function claimAndSendBatch(
  admin: SupabaseClient,
  opts: { sessionId?: string; limit?: number },
): Promise<DrainResult> {
  const limit = opts.limit ?? 25;
  const nowIso = new Date().toISOString();

  // 1. find claimable rows (queued, or retrying whose backoff elapsed).
  //    Apply the optional session filter BEFORE order/limit — `.eq` lives on
  //    the filter builder, which `.order()/.limit()` transform away.
  let sel = admin
    .from("seating_notifications")
    .select("id, session_id, guest_phone, template_sid, template_variables, attempts")
    .in("status", ["queued", "retrying"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`);
  if (opts.sessionId) sel = sel.eq("session_id", opts.sessionId);
  const { data: candidates } = (await sel
    .order("queued_at", { ascending: true })
    .limit(limit)) as { data: ClaimRow[] | null };
  const cand = candidates ?? [];

  if (cand.length === 0) {
    if (opts.sessionId) await refreshSessionStatus(admin, opts.sessionId);
    return { claimed: 0, sent: 0, failed: 0, retrying: 0, remaining: 0 };
  }

  // 2. atomically claim: flip to 'sending' guarded by current status, so two
  //    concurrent workers can't both grab the same row (the loser's WHERE no
  //    longer matches and it gets back fewer/zero rows).
  const ids = cand.map((r) => r.id);
  const { data: claimedData } = (await admin
    .from("seating_notifications")
    .update({ status: "sending" })
    .in("id", ids)
    .in("status", ["queued", "retrying"])
    .select(
      "id, session_id, guest_phone, template_sid, template_variables, attempts",
    )) as { data: ClaimRow[] | null };
  const claimed = claimedData ?? [];

  let sent = 0;
  let failed = 0;
  let retrying = 0;
  const touchedSessions = new Set<string>();

  // 3. send each claimed row.
  for (const r of claimed) {
    touchedSessions.add(r.session_id);
    const attempts = (r.attempts ?? 0) + 1;
    const result = await sendWhatsAppTemplate({
      to: r.guest_phone,
      contentSid: r.template_sid,
      contentVariables: r.template_variables,
    });

    if (result.ok) {
      await admin
        .from("seating_notifications")
        .update({
          status: "sent",
          attempts,
          twilio_message_sid: result.sid ?? null,
          sent_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        })
        .eq("id", r.id);
      sent += 1;
    } else {
      const permanent = attempts >= MAX_ATTEMPTS;
      const backoff = BACKOFFS_MS[Math.min(attempts - 1, BACKOFFS_MS.length - 1)];
      await admin
        .from("seating_notifications")
        .update({
          status: permanent ? "failed" : "retrying",
          attempts,
          error_code: result.error ?? "twilio_error",
          error_message: (result.detail ?? "").slice(0, 300),
          next_attempt_at: permanent
            ? null
            : new Date(Date.now() + backoff).toISOString(),
          failed_at: permanent ? new Date().toISOString() : null,
        })
        .eq("id", r.id);
      if (permanent) failed += 1;
      else retrying += 1;
    }
    await sleep(THROTTLE_MS);
  }

  // 4. refresh counters / completion for every session we touched.
  for (const sid of touchedSessions) await refreshSessionStatus(admin, sid);

  // 5. how many are still claimable RIGHT NOW (for the live pump's loop).
  let remQ = admin
    .from("seating_notifications")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "retrying"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`);
  if (opts.sessionId) remQ = remQ.eq("session_id", opts.sessionId);
  const { count } = (await remQ) as { count: number | null };

  return { claimed: claimed.length, sent, failed, retrying, remaining: count ?? 0 };
}
