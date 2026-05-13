/**
 * Momentum Live — Phase 6 Auto-Report (R20).
 *
 * Pure functions. Aggregate post-event data from local AppState + cloud
 * (guest_arrivals + manager_actions) into a single shape the report page
 * renders. CSV export builds a UTF-8 string with a BOM so Hebrew opens
 * correctly in Excel for Mac/Windows.
 */
import type { AppState, GuestArrival, ManagerAction } from "./types";

export interface ReportTableSummary {
  tableId: string;
  label: string;
  capacity: number;
  expectedCount: number;
  arrivedCount: number;
  /** arrived / expected as percent (0-100), 0 when expected is 0. */
  fillPercent: number;
}

export interface ReportGuestRow {
  guestId: string;
  name: string;
  phone: string;
  tableLabel?: string;
  arrived: boolean;
  arrivedAt?: string;
  plusOnes: number;
}

export interface ReportActionSummary {
  actionType: string;
  /** Label from the payload if present, falls back to actionType. */
  label: string;
  count: number;
}

export interface EventReportData {
  eventId: string;
  hostName: string;
  partnerName?: string;
  eventDate: string;
  totalGuests: number;
  totalArrived: number;
  totalPlusOnes: number;
  arrivalRate: number;
  tables: ReportTableSummary[];
  /** Top 5 tables by arrived count, descending. */
  topTables: ReportTableSummary[];
  guests: ReportGuestRow[];
  arrivedGuests: ReportGuestRow[];
  noShowGuests: ReportGuestRow[];
  actions: ReportActionSummary[];
  totalActions: number;
}

export interface BuildReportInput {
  state: Partial<AppState>;
  arrivals: GuestArrival[];
  actions: ManagerAction[];
}

export function buildEventReport(input: BuildReportInput): EventReportData | null {
  const { state, arrivals, actions } = input;
  if (!state.event) return null;

  const assignments = state.seatAssignments ?? {};
  const tables = state.tables ?? [];
  const guests = state.guests ?? [];

  const arrivalByGuest = new Map<string, GuestArrival>(
    arrivals.map((a) => [a.guest_id, a]),
  );

  const tableLookup = new Map(tables.map((t) => [t.id, t]));

  const guestRows: ReportGuestRow[] = guests.map((g) => {
    const tableId = assignments[g.id];
    const table = tableId ? tableLookup.get(tableId) : undefined;
    const arrival = arrivalByGuest.get(g.id);
    return {
      guestId: g.id,
      name: g.name,
      phone: g.phone,
      tableLabel: table?.name,
      arrived: !!arrival,
      arrivedAt: arrival?.arrived_at,
      plusOnes: arrival?.plus_ones ?? 0,
    };
  });

  const arrivedGuests = guestRows.filter((g) => g.arrived);
  const noShowGuests = guestRows.filter((g) => !g.arrived);
  const totalPlusOnes = arrivedGuests.reduce((sum, g) => sum + g.plusOnes, 0);

  const tableSummaries: ReportTableSummary[] = tables.map((t) => {
    const expectedIds = Object.entries(assignments)
      .filter(([, tid]) => tid === t.id)
      .map(([gid]) => gid);
    const arrivedCount = expectedIds.filter((gid) => arrivalByGuest.has(gid)).length;
    const fillPercent =
      expectedIds.length > 0 ? (arrivedCount / expectedIds.length) * 100 : 0;
    return {
      tableId: t.id,
      label: t.name,
      capacity: t.capacity,
      expectedCount: expectedIds.length,
      arrivedCount,
      fillPercent,
    };
  });

  const topTables = [...tableSummaries]
    .sort((a, b) => b.arrivedCount - a.arrivedCount)
    .slice(0, 5);

  const actionCounts = new Map<string, ReportActionSummary>();
  for (const a of actions) {
    const existing = actionCounts.get(a.action_type);
    const payloadLabel =
      a.payload && typeof a.payload === "object" && "label" in a.payload
        ? String((a.payload as { label?: unknown }).label ?? "")
        : "";
    if (existing) {
      existing.count += 1;
      if (!existing.label && payloadLabel) existing.label = payloadLabel;
    } else {
      actionCounts.set(a.action_type, {
        actionType: a.action_type,
        label: payloadLabel || a.action_type,
        count: 1,
      });
    }
  }
  const actionList = [...actionCounts.values()].sort((a, b) => b.count - a.count);

  return {
    eventId: state.event.id,
    hostName: state.event.hostName,
    partnerName: state.event.partnerName,
    eventDate: state.event.date,
    totalGuests: guests.length,
    totalArrived: arrivedGuests.length,
    totalPlusOnes,
    arrivalRate:
      guests.length > 0 ? (arrivedGuests.length / guests.length) * 100 : 0,
    tables: tableSummaries,
    topTables,
    guests: guestRows,
    arrivedGuests,
    noShowGuests,
    actions: actionList,
    totalActions: actions.length,
  };
}

/**
 * Build a CSV string with a UTF-8 BOM so Hebrew opens correctly in Excel.
 * Columns: שם, טלפון, שולחן, הגיע, +1, שעת הגעה.
 */
export function exportReportToCSV(report: EventReportData): string {
  const headers = ["שם", "טלפון", "שולחן", "הגיע", "+1", "שעת הגעה"];

  const escape = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replaceAll("\"", "\"\"")}"`;
    }
    return s;
  };

  const rows = report.guests.map((g) => {
    const time = g.arrivedAt
      ? new Date(g.arrivedAt).toLocaleString("he-IL", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "";
    return [
      escape(g.name),
      escape(g.phone),
      escape(g.tableLabel ?? ""),
      escape(g.arrived ? "כן" : "לא"),
      escape(g.plusOnes || ""),
      escape(time),
    ].join(",");
  });

  const body = [headers.map(escape).join(","), ...rows].join("\n");
  // ﻿ — UTF-8 BOM so Excel auto-detects encoding and Hebrew renders.
  return "﻿" + body;
}
