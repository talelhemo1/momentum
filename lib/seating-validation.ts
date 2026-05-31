// R98 — seating-notification validation (pure / isomorphic).
//
// No `server-only` import: this runs BOTH in the dashboard wizard (to show the
// live red/yellow/green table review) AND on the server (the lock + send
// endpoints recompute it from the authoritative app_states payload so the UI
// can never approve a table the server would reject).
//
// It validates against the REAL data model:
//   • SeatingTable = { id, name, capacity, number? }       (lib/types.ts)
//   • Guest        = { id, name, phone, status, ... }        — status, NOT rsvpStatus
//   • table membership is derived from seatAssignments: Record<guestId, tableId>
// The spec's `g.tableNumber` / `g.rsvpStatus` / `table.number` shapes don't
// exist here; this module is the single place that bridges spec → reality.

import type { Guest, SeatingTable } from "./types";
import { normalizeIsraeliPhone } from "./phone";

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Stable machine code — drives UI copy + tests. */
  code:
    | "DUPLICATE_PHONE"
    | "INVALID_PHONE"
    | "MISSING_PHONE"
    | "OVER_CAPACITY"
    | "UNCONFIRMED"
    | "EMPTY_TABLE";
  message: string;
  /** Guest ids the issue points at (empty for table-level issues). */
  guestIds: string[];
}

export interface TableValidation {
  /** The callable "שולחן N" number (table.number ?? positional index + 1). */
  tableNumber: number;
  tableName: string | null;
  /** How many guests are assigned to the table (all statuses). */
  guestCount: number;
  /** Of those, how many will actually be messaged (confirmed + valid + unique). */
  sendableCount: number;
  status: "ok" | "warning" | "error";
  issues: ValidationIssue[];
}

export interface SeatingSummary {
  okTables: number;
  warningTables: number;
  errorTables: number;
  totalTables: number;
  totalGuests: number;
  /** Guests that would receive a message across all OK/approvable tables. */
  sendableGuests: number;
}

/** The callable table number: explicit `number` field, else 1-based position. */
export function tableNumberOf(
  table: SeatingTable,
  tables: SeatingTable[],
): number {
  if (typeof table.number === "number") return table.number;
  const idx = tables.findIndex((t) => t.id === table.id);
  return idx >= 0 ? idx + 1 : 0;
}

/** "שולחן 12" or "שולחן 12 — חברים מהצבא" — matches the teammate's quick-send. */
export function tableLabel(table: SeatingTable, tables: SeatingTable[]): string {
  const n = tableNumberOf(table, tables);
  return table.name ? `שולחן ${n} — ${table.name}` : `שולחן ${n}`;
}

/** Guests assigned to a given table id, in their natural order. */
export function guestsForTable(
  tableId: string,
  guests: Guest[],
  seatAssignments: Record<string, string>,
): Guest[] {
  return guests.filter((g) => seatAssignments[g.id] === tableId);
}

/** A guest is "sendable" when confirmed, with a valid Israeli phone. */
export function isSendable(g: Guest): boolean {
  return g.status === "confirmed" && normalizeIsraeliPhone(g.phone || "").valid;
}

/**
 * Validate a single table.
 *
 * @param table          the table being validated
 * @param tables         all tables (needed to resolve the positional number)
 * @param occupants      guests assigned to THIS table (any status)
 * @param phoneCollisions normalized phones that appear on MORE THAN ONE guest
 *                        across the whole event (so a duplicate that spans two
 *                        tables is still flagged here). Build once with
 *                        `collidingPhones()` and pass in.
 */
export function validateTable(
  table: SeatingTable,
  tables: SeatingTable[],
  occupants: Guest[],
  phoneCollisions: Set<string>,
): TableValidation {
  const issues: ValidationIssue[] = [];
  const tableNumber = tableNumberOf(table, tables);

  // ── BLOCKING errors ───────────────────────────────────────────────
  // Missing phone.
  const missing = occupants.filter((g) => !(g.phone || "").trim());
  if (missing.length) {
    issues.push({
      severity: "error",
      code: "MISSING_PHONE",
      message: `${missing.length} מוזמנים ללא מספר טלפון`,
      guestIds: missing.map((g) => g.id),
    });
  }

  // Invalid (non-Israeli / malformed) phone — excluding the missing ones.
  const invalid = occupants.filter(
    (g) => (g.phone || "").trim() && !normalizeIsraeliPhone(g.phone).valid,
  );
  if (invalid.length) {
    issues.push({
      severity: "error",
      code: "INVALID_PHONE",
      message: `${invalid.length} מוזמנים עם מספר טלפון לא תקין`,
      guestIds: invalid.map((g) => g.id),
    });
  }

  // Duplicate phone — same normalized number on >1 guest (this table or across
  // tables). Sending twice to one phone is the exact footgun we must block.
  const dupHere = occupants.filter((g) => {
    const n = normalizeIsraeliPhone(g.phone || "");
    return n.valid && phoneCollisions.has(n.phone);
  });
  if (dupHere.length) {
    issues.push({
      severity: "error",
      code: "DUPLICATE_PHONE",
      message: `${dupHere.length} מוזמנים חולקים מספר טלפון עם מוזמן אחר`,
      guestIds: dupHere.map((g) => g.id),
    });
  }

  // Over capacity.
  if (table.capacity > 0 && occupants.length > table.capacity) {
    issues.push({
      severity: "error",
      code: "OVER_CAPACITY",
      message: `${occupants.length} מוזמנים בשולחן ל-${table.capacity}`,
      guestIds: [],
    });
  }

  // ── Warnings ──────────────────────────────────────────────────────
  const unconfirmed = occupants.filter((g) => g.status !== "confirmed");
  if (unconfirmed.length) {
    issues.push({
      severity: "warning",
      code: "UNCONFIRMED",
      message: `${unconfirmed.length} טרם אישרו הגעה (לא יקבלו הודעה)`,
      guestIds: unconfirmed.map((g) => g.id),
    });
  }

  if (occupants.length === 0) {
    issues.push({
      severity: "warning",
      code: "EMPTY_TABLE",
      message: "שולחן ריק",
      guestIds: [],
    });
  }

  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");

  const sendableCount = occupants.filter((g) => {
    const n = normalizeIsraeliPhone(g.phone || "");
    return g.status === "confirmed" && n.valid && !phoneCollisions.has(n.phone);
  }).length;

  return {
    tableNumber,
    tableName: table.name || null,
    guestCount: occupants.length,
    sendableCount,
    status: hasError ? "error" : hasWarning ? "warning" : "ok",
    issues,
  };
}

/** Normalized phones that appear on more than one guest across the event. */
export function collidingPhones(guests: Guest[]): Set<string> {
  const counts = new Map<string, number>();
  for (const g of guests) {
    const n = normalizeIsraeliPhone(g.phone || "");
    if (!n.valid) continue;
    counts.set(n.phone, (counts.get(n.phone) ?? 0) + 1);
  }
  const collisions = new Set<string>();
  for (const [phone, count] of counts) if (count > 1) collisions.add(phone);
  return collisions;
}

/**
 * Validate every table in the event. Returns per-table results (sorted
 * error → warning → ok for the review screen) plus a summary tally.
 *
 * Only guests assigned to a table participate; unseated guests are ignored
 * (they're a separate "X without a table" stat in the wizard's step 1).
 */
export function validateAllTables(
  tables: SeatingTable[],
  guests: Guest[],
  seatAssignments: Record<string, string>,
): { tables: TableValidation[]; summary: SeatingSummary } {
  const collisions = collidingPhones(
    // Only seated guests can collide in a way that matters for sending.
    guests.filter((g) => seatAssignments[g.id]),
  );

  const results = tables.map((t) =>
    validateTable(
      t,
      tables,
      guestsForTable(t.id, guests, seatAssignments),
      collisions,
    ),
  );

  const summary: SeatingSummary = {
    okTables: results.filter((r) => r.status === "ok").length,
    warningTables: results.filter((r) => r.status === "warning").length,
    errorTables: results.filter((r) => r.status === "error").length,
    totalTables: results.length,
    totalGuests: results.reduce((s, r) => s + r.guestCount, 0),
    // A table is "approvable" unless it has a blocking error; only those
    // contribute sendable guests to the headline number.
    sendableGuests: results
      .filter((r) => r.status !== "error")
      .reduce((s, r) => s + r.sendableCount, 0),
  };

  const rank = { error: 0, warning: 1, ok: 2 } as const;
  results.sort(
    (a, b) => rank[a.status] - rank[b.status] || a.tableNumber - b.tableNumber,
  );

  return { tables: results, summary };
}
