import { describe, it, expect } from "vitest";
import { buildNavigationLinks } from "@/lib/navigationLinks";

describe("buildNavigationLinks", () => {
  it("builds Waze/Google/Apple deep links with the address encoded", () => {
    const n = buildNavigationLinks("אולם הוורד, יד אליהו, תל אביב")!;
    expect(n).not.toBeNull();
    const enc = encodeURIComponent("אולם הוורד, יד אליהו, תל אביב");
    expect(n.waze).toBe(`https://waze.com/ul?q=${enc}&navigate=yes`);
    expect(n.googleMaps).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${enc}`,
    );
    expect(n.appleMaps).toBe(
      `https://maps.apple.com/?daddr=${enc}&dirflg=d`,
    );
    // Israel default = Waze.
    expect(n.primary).toBe(n.waze);
  });

  it("encodes commas, quotes and parentheses so the link can't break", () => {
    const n = buildNavigationLinks("גן האחוזה (בני ברק), רח' הברזל 5")!;
    expect(n.waze).toContain("%2C"); // comma
    expect(n.waze).not.toContain(" "); // no raw spaces
    expect(n.waze).toContain("&navigate=yes");
  });

  it("returns null for empty / whitespace / nullish input (UI hides)", () => {
    expect(buildNavigationLinks("")).toBeNull();
    expect(buildNavigationLinks("   ")).toBeNull();
    expect(buildNavigationLinks(null)).toBeNull();
    expect(buildNavigationLinks(undefined)).toBeNull();
  });
});
