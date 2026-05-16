/**
 * R31 — deep links for the major navigation apps.
 *
 * Waze and Google Maps run an internal search on the free-text address.
 * R36 B7 — Apple Maps now uses `?daddr=<addr>&dirflg=d` (destination +
 * drive directions) instead of `?q=` (which only drops a search pin and
 * doesn't start navigation). `encodeURIComponent` makes Hebrew, quotes,
 * dots and parentheses safe. Pure + isomorphic.
 */
export interface NavLinks {
  waze: string;
  googleMaps: string;
  appleMaps: string;
  /** Best default for Israel (Waze). Callers that want OS-awareness can
   *  branch on the user agent themselves; the page UIs just show all 3. */
  primary: string;
}

export function buildNavigationLinks(
  address: string | null | undefined,
): NavLinks | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;
  const enc = encodeURIComponent(trimmed);
  const waze = `https://waze.com/ul?q=${enc}&navigate=yes`;
  return {
    waze,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${enc}`,
    appleMaps: `https://maps.apple.com/?daddr=${enc}&dirflg=d`,
    primary: waze,
  };
}
