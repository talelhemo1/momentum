/**
 * R31 — deep links for the major navigation apps.
 *
 * All three accept a free-text address (lat/lng not required): Waze and
 * Google Maps run an internal search; Apple Maps reads the address as the
 * destination. `encodeURIComponent` makes Hebrew, quotes, dots and
 * parentheses safe inside the query. Pure + isomorphic — safe in a
 * server component, a client component, or the WhatsApp message builder.
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
    appleMaps: `https://maps.apple.com/?q=${enc}`,
    primary: waze,
  };
}
