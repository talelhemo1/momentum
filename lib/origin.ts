/**
 * Single source of truth for the public origin we embed in invitation/RSVP URLs.
 *
 * Why this exists:
 *   Several call sites used `typeof window !== "undefined" ? window.location.origin : ""`
 *   inline. When that ran during SSR / first hydration pass, origin came back as
 *   "" — and `${""}/rsvp?...` became a bare `/rsvp?...` path. WhatsApp then
 *   shipped that path inside the guest's invitation message; the guest tapped
 *   it and got a blank screen because the link had no scheme/host.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL  — set this in production (Vercel env). Always wins.
 *   2. window.location.origin — runtime fallback once the browser is alive.
 *   3. throw                  — never silently emit a relative URL again.
 */

const ENV_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

/** Strip trailing slashes — handles `https://x.com//` from PWA edge cases. */
function clean(o: string): string {
  return o.replace(/\/+$/, "");
}

/**
 * Returns the canonical public origin. Throws when called server-side without
 * NEXT_PUBLIC_SITE_URL configured, so callers can't accidentally emit a
 * relative URL into a WhatsApp body.
 */
export function getPublicOrigin(): string {
  if (ENV_ORIGIN) return ENV_ORIGIN;
  if (typeof window !== "undefined" && window.location?.origin) {
    return clean(window.location.origin);
  }
  throw new Error(
    "[momentum/origin] No origin available. Set NEXT_PUBLIC_SITE_URL or call from the browser.",
  );
}

/**
 * Same as `getPublicOrigin` but returns "" instead of throwing. Use this only
 * when the caller will explicitly guard against empty (e.g. show a "preparing"
 * state). Prefer the throwing version everywhere else.
 */
export function tryGetPublicOrigin(): string {
  try {
    return getPublicOrigin();
  } catch {
    return "";
  }
}
