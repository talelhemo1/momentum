import { describe, it, expect } from "vitest";
import {
  buildInviteText,
  buildManagerInviteWhatsapp,
  type ManagerInviteInput,
} from "@/lib/managerInvitation";

const base: ManagerInviteInput = {
  managerName: "דנה כהן",
  managerPhone: "050-1234567",
  invitationToken: "tok-abc-123",
  eventHostName: "תמר ויוסי",
  eventDate: "2026-08-20",
};

describe("buildInviteText", () => {
  it("includes the token, accept URL, manager + host names and the date", () => {
    const text = buildInviteText(base);
    expect(text).toContain("tok-abc-123");
    expect(text).toContain("/manage/accept?token=tok-abc-123");
    expect(text).toContain("דנה כהן");
    expect(text).toContain("תמר ויוסי");
    // 2026-08-20 → he-IL long form contains the month name.
    expect(text).toContain("אוגוסט");
  });

  it("never emits 'Invalid Date' when eventDate is empty", () => {
    const text = buildInviteText({ ...base, eventDate: "" });
    expect(text).not.toContain("Invalid Date");
    // Still a usable message with the core CTA.
    expect(text).toContain("/manage/accept?token=tok-abc-123");
  });

  it("never emits 'Invalid Date' for a malformed eventDate", () => {
    const text = buildInviteText({ ...base, eventDate: "not-a-date" });
    expect(text).not.toContain("Invalid Date");
  });
});

describe("buildManagerInviteWhatsapp", () => {
  it("returns a wa.me/<phone> URL for a valid Israeli number", () => {
    const r = buildManagerInviteWhatsapp(base);
    expect(r.valid).toBe(true);
    expect(r.url).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/);
    // The encoded text round-trips the token.
    expect(decodeURIComponent(r.url)).toContain("tok-abc-123");
  });

  it("falls back to recipient-less wa.me for an invalid number", () => {
    const r = buildManagerInviteWhatsapp({ ...base, managerPhone: "123" });
    expect(r.valid).toBe(false);
    expect(r.url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it("text matches buildInviteText exactly (single source of truth)", () => {
    const r = buildManagerInviteWhatsapp(base);
    expect(r.text).toBe(buildInviteText(base));
  });
});
