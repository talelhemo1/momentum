import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Content-Security-Policy moved to `middleware.ts` (R12 §1H) so each
 * request gets a fresh per-request nonce — `unsafe-inline` is no longer
 * in the script-src. The static headers below still apply globally.
 */

const isDev = process.env.NODE_ENV === "development";

const SECURITY_HEADERS = [
  // CSP is set per-request in middleware.ts so the nonce changes every
  // page load. See R12 §1H for the rationale.
  // Clickjacking protection: nobody can iframe our site.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops MIME-type sniffing attacks.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful APIs we never use.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", "),
  },
  // HTTPS-only for the next 2 years (production only).
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
  // Limit cross-origin embedding/opening.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Don't advertise that we run Next.js (small recon hardening).
  poweredByHeader: false,

  // R29 — guarantee the Hebrew OG fonts (assets/Heebo-*.ttf, ~33KB) are
  // traced into the serverless bundle for the /i/[token]/opengraph-image
  // route. Without this Vercel may omit them → readFile throws (now
  // caught, but then Hebrew renders as boxes). Broad route glob keeps it
  // correct regardless of how the metadata route path is matched; the
  // payload is tiny so the over-inclusion cost is negligible.
  outputFileTracingIncludes: {
    "/**": ["./assets/**/*"],
  },

  // R20 — enable next/image optimization for our Unsplash-backed
  // catalog/gallery imagery. Scoped tightly to the exact host so it
  // can't be abused as an open image proxy. User-uploaded vendor media
  // (Supabase storage / arbitrary domains) intentionally stays on plain
  // <img> — see docs/tasklists/TASKLIST.R20.md.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
    ],
  },

  // Allow HMR / dev assets to be fetched when the app is reached via a
  // cloudflared tunnel (or any LAN host). Required as of Next.js 16+, which
  // blocks cross-origin dev resources by default.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "192.168.1.34",
    "192.168.0.0/16",
  ],

  async headers() {
    return [
      {
        // Apply security headers to every route.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
