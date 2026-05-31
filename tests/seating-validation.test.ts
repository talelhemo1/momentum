import { describe, expect, it } from "vitest";
import {
  validateAllTables,
  validateTable,
  collidingPhones,
  tableNumberOf,
} from "@/lib/seating-validation";
import type { Guest, SeatingTable } from "@/lib/types";

// ── fixtures ────────────────────────────────────────────────────────────────
let seq = 0;
function g(partial: Partial<Guest> & { phone: string }): Guest {
  seq += 1;
  return {
    id: `g${seq}`,
    name: `אורח ${seq}`,
    attendingCount: 1,
    status: "confirmed",
    ...partial,
  };
}

function table(partial: Partial<SeatingTable> & { id: string }): SeatingTable {
  return {
    id: partial.id,
    name: partial.name ?? "",
    capacity: partial.capacity ?? 12,
    number: partial.number,
  };
}

/** A fresh Israeli mobile per call, e.g. 0501000001, 0501000002, … */
let phoneSeq = 0;
function phone(): string {
  phoneSeq += 1;
  return `05010${String(phoneSeq).padStart(5, "0")}`;
}

describe("seating-validation", () => {
  it("clean table of 12 confirmed guests with valid phones → ok", () => {
    const t = table({ id: "t1", number: 1, capacity: 12 });
    const guests = Array.from({ length: 12 }, () => g({ phone: phone() }));
    const seat: Record<string, string> = {};
    guests.forEach((x) => (seat[x.id] = "t1"));

    const { tables, summary } = validateAllTables([t], guests, seat);
    expect(tables[0].status).toBe("ok");
    expect(tables[0].issues).toHaveLength(0);
    expect(tables[0].sendableCount).toBe(12);
    expect(summary.okTables).toBe(1);
    expect(summary.sendableGuests).toBe(12);
  });

  it("duplicate phone → error DUPLICATE_PHONE", () => {
    const shared = "0509999999";
    const t = table({ id: "t1", number: 1 });
    const guests = [
      g({ id: "a", phone: shared }),
      g({ id: "b", phone: shared }),
      g({ phone: phone() }),
    ];
    const seat = { a: "t1", b: "t1", [guests[2].id]: "t1" };

    const { tables } = validateAllTables([t], guests, seat);
    expect(tables[0].status).toBe("error");
    const codes = tables[0].issues.map((i) => i.code);
    expect(codes).toContain("DUPLICATE_PHONE");
    // The two colliding guests are flagged, the unique one is not.
    const dup = tables[0].issues.find((i) => i.code === "DUPLICATE_PHONE")!;
    expect(dup.guestIds.sort()).toEqual(["a", "b"]);
    // The unique guest is still sendable; the two colliding ones are not.
    expect(tables[0].sendableCount).toBe(1);
  });

  it("duplicate phone spanning two tables is still caught", () => {
    const shared = "0508888888";
    const t1 = table({ id: "t1", number: 1 });
    const t2 = table({ id: "t2", number: 2 });
    const a = g({ id: "a", phone: shared });
    const b = g({ id: "b", phone: shared });
    const seat = { a: "t1", b: "t2" };
    const collisions = collidingPhones([a, b]);
    expect(collisions.size).toBe(1);

    const { tables } = validateAllTables([t1, t2], [a, b], seat);
    expect(tables.every((x) => x.status === "error")).toBe(true);
  });

  it("non-Israeli phone → error INVALID_PHONE", () => {
    const t = table({ id: "t1", number: 1 });
    const bad = g({ id: "x", phone: "+1 555 0100" });
    const ok = g({ phone: phone() });
    const seat = { x: "t1", [ok.id]: "t1" };

    const { tables } = validateAllTables([t], [bad, ok], seat);
    expect(tables[0].status).toBe("error");
    expect(tables[0].issues.map((i) => i.code)).toContain("INVALID_PHONE");
    expect(tables[0].sendableCount).toBe(1);
  });

  it("missing phone → error MISSING_PHONE", () => {
    const t = table({ id: "t1", number: 1 });
    const noPhone = g({ id: "x", phone: "" });
    const seat = { x: "t1" };

    const { tables } = validateAllTables([t], [noPhone], seat);
    expect(tables[0].issues.map((i) => i.code)).toContain("MISSING_PHONE");
    expect(tables[0].status).toBe("error");
  });

  it("unconfirmed guests → warning UNCONFIRMED (not blocking)", () => {
    const t = table({ id: "t1", number: 1 });
    const guests = [
      ...Array.from({ length: 7 }, () => g({ phone: phone() })),
      ...Array.from({ length: 5 }, () =>
        g({ phone: phone(), status: "pending" }),
      ),
    ];
    const seat: Record<string, string> = {};
    guests.forEach((x) => (seat[x.id] = "t1"));

    const { tables } = validateAllTables([t], guests, seat);
    expect(tables[0].status).toBe("warning");
    const u = tables[0].issues.find((i) => i.code === "UNCONFIRMED")!;
    expect(u.guestIds).toHaveLength(5);
    // Only the 7 confirmed are messaged.
    expect(tables[0].sendableCount).toBe(7);
  });

  it("over capacity → error OVER_CAPACITY", () => {
    const t = table({ id: "t1", number: 1, capacity: 4 });
    const guests = Array.from({ length: 6 }, () => g({ phone: phone() }));
    const seat: Record<string, string> = {};
    guests.forEach((x) => (seat[x.id] = "t1"));

    const { tables } = validateAllTables([t], guests, seat);
    expect(tables[0].status).toBe("error");
    expect(tables[0].issues.map((i) => i.code)).toContain("OVER_CAPACITY");
  });

  it("empty table → warning EMPTY_TABLE", () => {
    const t = table({ id: "t1", number: 1 });
    const { tables } = validateAllTables([t], [], {});
    expect(tables[0].status).toBe("warning");
    expect(tables[0].issues.map((i) => i.code)).toContain("EMPTY_TABLE");
    expect(tables[0].guestCount).toBe(0);
  });

  it("tableNumberOf falls back to 1-based position when number is absent", () => {
    const t1 = table({ id: "t1" });
    const t2 = table({ id: "t2" });
    expect(tableNumberOf(t1, [t1, t2])).toBe(1);
    expect(tableNumberOf(t2, [t1, t2])).toBe(2);
  });

  it("summary sorts error → warning → ok and tallies correctly", () => {
    const ok = table({ id: "ok", number: 3, capacity: 12 });
    const warn = table({ id: "warn", number: 2, capacity: 12 });
    const err = table({ id: "err", number: 1, capacity: 2 });

    const okG = [g({ phone: phone() }), g({ phone: phone() })];
    const warnG = [g({ phone: phone(), status: "pending" })];
    const errG = Array.from({ length: 5 }, () => g({ phone: phone() })); // > capacity 2

    const seat: Record<string, string> = {};
    okG.forEach((x) => (seat[x.id] = "ok"));
    warnG.forEach((x) => (seat[x.id] = "warn"));
    errG.forEach((x) => (seat[x.id] = "err"));

    const { tables, summary } = validateAllTables(
      [ok, warn, err],
      [...okG, ...warnG, ...errG],
      seat,
    );
    expect(tables.map((t) => t.status)).toEqual(["error", "warning", "ok"]);
    expect(summary.errorTables).toBe(1);
    expect(summary.warningTables).toBe(1);
    expect(summary.okTables).toBe(1);
    // sendable = ok table (2) + warn table confirmed (0). err excluded.
    expect(summary.sendableGuests).toBe(2);
  });

  it("validateTable can be called directly with explicit collisions", () => {
    const t = table({ id: "t1", number: 9 });
    const occupants = [g({ phone: phone() })];
    const v = validateTable(t, [t], occupants, new Set());
    expect(v.tableNumber).toBe(9);
    expect(v.status).toBe("ok");
  });
});
