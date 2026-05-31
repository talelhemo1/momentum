import { NextResponse, type NextRequest } from "next/server";

/**
 * R12 §1H — CSP with per-request nonce.
 *
 * `script-src 'unsafe-inline'` neuters CSP's XSS protection entirely.
 * The proper fix is a nonce: every inline script in our markup gets the
 * same fresh-per-request nonce, and the CSP header authorises only that
 * nonce. Anything else (including injected `<script>` tags) is blocked.
 *
 * Pipeline:
 *   1. Generate a 128-bit nonce here.
 *   2. Forward it on the incoming request via `x-nonce` so server
 *      components can read it via `headers()` and stamp their inline
 *      `<script>` tags.
 *   3. Set CSP on the response with `'nonce-<n>' 'strict-dynamic'`.
 *      strict-dynamic lets the first nonce-tagged script load further
 *      JS chunks without us having to tag every Next.js chunk URL.
 *
 * Matcher excludes static assets (the CSP doesn't apply to /favicon.ico
 * or /_next/static/* anyway, and running middleware on every image
 * wastes edge cycles).
 *
 * Note: CSP is no longer set from next.config.ts. The static headers in
 * next.config.ts (HSTS, frame-ancestors, etc.) still apply globally;
 * only CSP moved here because it needs the per-request nonce.
 */
export function middleware(request: NextRequest) {
  // ── OAuth / magic-link rescue (R-fix) ────────────────────────────────
  // Google/Apple OAuth (and email magic links) finish by redirecting back
  // with the credentials in the query string: `?code=…` for PKCE, or
  // `?token_hash=…&type=…` for email verify. They're supposed to land on
  // /auth/callback. But when Supabase's "Redirect URLs" allowlist doesn't
  // include /auth/callback, Supabase falls back to the project's SITE URL —
  // typically the landing root "/". The credentials then sit there
  // UNPROCESSED and the user looks "bounced back to the homepage, not
  // logged in" — the exact reported bug.
  //
  // Catch it for ANY non-/auth path and forward to the real handler. Same
  // origin, so the PKCE code-verifier in the browser's localStorage is
  // intact and /auth/callback's exchangeCodeForSession() works. We force
  // PKCE in lib/supabase.ts, so the creds are always in the query string
  // (never only in the URL hash, which wouldn't reach the server).
  {
    const { pathname, searchParams } = request.nextUrl;
    const looksLikeAuthReturn =
      searchParams.has("code") ||
      searchParams.has("token_hash") ||
      searchParams.has("error_description");
    if (looksLikeAuthReturn && !pathname.startsWith("/auth/")) {
      const dest = request.nextUrl.clone();
      dest.pathname = "/auth/callback";
      return NextResponse.redirect(dest);
    }
  }

  // 16 random bytes → 22-char base64. crypto.randomUUID() is available in
  // Edge runtime; we strip dashes + base64-encode for compactness.
  const raw = crypto.randomUUID().replace(/-/g, "");
  // Edge runtime has btoa but not Buffer.
  const nonce = btoa(raw).replace(/=+$/, "");

  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");

  // R12 §1I — connect-src pinned to the specific Supabase project, not the
  // wildcard `*.supabase.co`. WSS uses the same host for Realtime.
  // R63 (R53) — Plausible posts pageviews to https://plausible.io/api/event.
  const connectSrc = ["'self'", "https://plausible.io"];
  if (supabaseHost) {
    connectSrc.push(`https://${supabaseHost}`);
    connectSrc.push(`wss://${supabaseHost}`);
  }
  if (isDev) connectSrc.push("ws:", "wss:");

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://images.unsplash.com",
    ...(supabaseHost ? [`https://${supabaseHost}`] : []),
  ];

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // strict-dynamic lets Next's nonce-tagged script load its chunks
    // without us having to nonce every chunk URL. Modern browsers honor
    // strict-dynamic; older ones fall back to 'self'.
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Styles still need 'unsafe-inline' — Tailwind v4 emits inline styles
    // in some build modes and the app uses inline `style={{...}}` heavily
    // for CSS variables. style-src 'unsafe-inline' is much less dangerous
    // than script-src 'unsafe-inline'.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");

  // Forward the nonce to RSC via the request headers so the layout can
  // read it via `headers()`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  // Expose the nonce on the response too so client-side debugging can
  // confirm the value matches.
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  // Skip middleware on static assets. The CSP header is moot for these,
  // and running middleware on every image wastes compute.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
