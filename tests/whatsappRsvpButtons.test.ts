import { describe, expect, it } from "vitest";
import { rsvpStatusFromButton } from "@/lib/whatsapp/rsvpButtonMap";

describe("whatsappRsvpButtons", () => {
  it("maps yes payload", () => {
    expect(rsvpStatusFromButton("rsvp_yes")).toBe("confirmed");
    expect(rsvpStatusFromButton("מגיע/ה")).toBe("confirmed");
  });

  it("maps no payload", () => {
    expect(rsvpStatusFromButton("rsvp_no")).toBe("declined");
    expect(rsvpStatusFromButton("לא מגיע/ה")).toBe("declined");
  });

  it("maps maybe payload", () => {
    expect(rsvpStatusFromButton("rsvp_maybe")).toBe("maybe");
    expect(rsvpStatusFromButton("עדיין לא החלטתי")).toBe("maybe");
  });

  it("returns null for unknown", () => {
    expect(rsvpStatusFromButton("hello")).toBeNull();
  });
});
