/**
 * URL safety helpers — prevent XSS via vendor-supplied or guest-supplied URLs.
 *
 * The threat model:
 *  - Today, vendor URLs in `lib/vendors.ts` are a hand-curated static list,
 *    so they're safe by construction.
 *  - The moment we open self-service vendor signup, a malicious vendor could
 *    set `website = "javascript:alert(document.cookie)"`. Without a guard,
 *    React would happily render `<a href="javascript:...">` and a click would
 *    execute the script.
 *  - Same applies to user-imported JSON data (settings → import).
 *
 * Use `safeUrl` everywhere we render an untrusted URL into an `href`.
 */

/**
 * Returns the URL if and only if it parses as a valid http(s) or mailto: URL.
 * Rejects javascript:, data:, vbscript:, file:, and malformed inputs.
 *
 * @param url Untrusted URL string (or undefined).
 * @returns The original URL if safe, otherwise `undefined`.
 */
export function safeUrl(url: string | undefined | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // Allow only relative URLs that start with "/" (in-app navigation).
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  try {
    const u = new URL(trimmed);
    const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
    return SAFE_PROTOCOLS.has(u.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Like safeUrl but only allows http/https — for external website links. */
export function safeHttpUrl(url: string | undefined | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" || u.protocol === "http:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
