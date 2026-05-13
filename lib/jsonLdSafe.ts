/**
 * R12 §1A — XSS-safe serializer for JSON-LD inside `<script>` tags.
 *
 * `JSON.stringify` does NOT escape characters that can terminate a
 * `<script>` tag from inside a string value. A vendor-controlled field
 * (name, tagline, etc.) containing `</script><script>alert(1)</script>`
 * would otherwise ship arbitrary JavaScript to every visitor.
 *
 * Escaped characters:
 *   `<`  → `<`   prevents `</script>` break-out
 *   `>`  → `>`   defense in depth
 *   `&`  → `&`   prevents HTML entity injection
 *   `'`  → `'`   prevents single-quote contexts
 * Double-quotes are already JSON-escaped by stringify, so no change there.
 *
 * Always use this when emitting JSON-LD via
 *   <script dangerouslySetInnerHTML={{ __html: jsonLdSafe(o) }} />.
 */
export function jsonLdSafe(o: unknown): string {
  return JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027");
}
