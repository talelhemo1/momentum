import type { MetadataRoute } from "next";

/**
 * R166 — /robots.txt. The app had no robots file, so crawlers had no
 * guidance: they'd try to index private, auth-gated, per-guest, and API
 * routes. We allow the public marketing surface and explicitly disallow
 * everything that's either private (host's planning data), per-recipient
 * (invitation/RSVP links — privacy), or non-content (API). Points
 * crawlers at the sitemap.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://moomentum.events";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/guests",
          "/budget",
          "/balance",
          "/seating",
          "/settings",
          "/inbox",
          "/onboarding",
          "/start",
          "/event-day",
          "/auth/",
          "/manage/",
          "/live/",
          "/rsvp", // per-guest invitation responses — never index
          "/i/", // short invitation links — per-guest, private
          "/vendors/dashboard",
          "/vendors/my",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
