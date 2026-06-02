import { describe, it, expect } from "vitest";
import { isSafeInvitationImageUrl } from "@/lib/invitation";

/**
 * R160 — the invitation image is rendered on the anonymous, fully
 * attacker-craftable `/rsvp?d=…` page. The guard must only allow images
 * served from our own Supabase Storage so a forged link can't inject an
 * arbitrary external <img> (tracking beacon / unsavory content).
 */
describe("isSafeInvitationImageUrl", () => {
  const supa =
    "https://abcdefgh.supabase.co/storage/v1/object/public/invitations/u1/invite-e1-1.jpg";

  it("allows a Supabase Storage public object URL", () => {
    expect(isSafeInvitationImageUrl(supa)).toBe(true);
  });

  it("allows the event-memories bucket too (same host + public path)", () => {
    expect(
      isSafeInvitationImageUrl(
        "https://abcdefgh.supabase.co/storage/v1/object/public/event-memories/x.png",
      ),
    ).toBe(true);
  });

  it("rejects an arbitrary external https image", () => {
    expect(isSafeInvitationImageUrl("https://evil.example.com/beacon.gif")).toBe(
      false,
    );
  });

  it("rejects a supabase.co URL that is NOT a public storage path", () => {
    expect(
      isSafeInvitationImageUrl("https://abcdefgh.supabase.co/rest/v1/secret"),
    ).toBe(false);
  });

  it("rejects a non-supabase host even with the storage path shape", () => {
    expect(
      isSafeInvitationImageUrl(
        "https://evil.example.com/storage/v1/object/public/invitations/x.jpg",
      ),
    ).toBe(false);
  });

  it("rejects non-https, empty, and non-string inputs", () => {
    expect(
      isSafeInvitationImageUrl(
        "http://abcdefgh.supabase.co/storage/v1/object/public/invitations/x.jpg",
      ),
    ).toBe(false);
    expect(isSafeInvitationImageUrl("")).toBe(false);
    expect(isSafeInvitationImageUrl(null)).toBe(false);
    expect(isSafeInvitationImageUrl(undefined)).toBe(false);
    expect(isSafeInvitationImageUrl("not a url")).toBe(false);
  });

  it("rejects javascript: and data: URIs", () => {
    expect(isSafeInvitationImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeInvitationImageUrl("data:image/png;base64,AAAA")).toBe(false);
  });
});
