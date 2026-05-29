import { describe, expect, it } from "vitest";
import {
  buildExternalGuestId,
  mapVoiceCallToRsvp,
  parseExternalGuestId,
  isGuestEligibleForVoiceCall,
} from "@/lib/voiceRsvpFromCall";

describe("voiceRsvpFromCall", () => {
  it("parses external id", () => {
    expect(parseExternalGuestId("ev1:g1")).toEqual({
      eventId: "ev1",
      guestId: "g1",
    });
    expect(parseExternalGuestId("bad")).toBeNull();
  });

  it("builds external id", () => {
    expect(buildExternalGuestId("ev1", "g1")).toBe("ev1:g1");
  });

  it("eligible when not confirmed", () => {
    expect(isGuestEligibleForVoiceCall("pending")).toBe(true);
    expect(isGuestEligibleForVoiceCall("confirmed")).toBe(false);
  });

  it("maps coming + headcount", () => {
    const m = mapVoiceCallToRsvp({
      conversationStatus: "Success",
      collectedInfo: [
        { id: "rsvpStatus", value: "coming" },
        { id: "headCount", value: 4 },
      ],
    });
    expect(m?.status).toBe("confirmed");
    expect(m?.attendingCount).toBe(4);
  });

  it("maps not coming", () => {
    const m = mapVoiceCallToRsvp({
      conversationStatus: "Success",
      collectedData: { rsvpStatus: "not_coming" },
    });
    expect(m?.status).toBe("declined");
    expect(m?.attendingCount).toBe(0);
  });

  it("skips voicemail", () => {
    expect(
      mapVoiceCallToRsvp({ conversationStatus: "VoiceMailLeft" }),
    ).toBeNull();
  });
});
