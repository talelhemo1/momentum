import type { MetadataRoute } from "next";

/**
 * R166 — /sitemap.xml. The app shipped without one, so search engines
 * had no map of the indexable public pages. We list only the PUBLIC
 * marketing surface (the landing, the vendor catalog, the vendor
 * join/apply page, and the legal pages). Private/auth-gated routes
 * (dashboard, guests, budget, seating, …) and per-guest links
 * (/rsvp, /i/…) are intentionally excluded — they're disallowed in
 * robots.ts too.
 *
 * Per-vendor public profiles (/vendor/[slug]) are strong SEO content;
 * they can be added here as a follow-up by fetching approved vendor
 * slugs from Supabase. Kept static for now to keep sitemap generation
 * dependency-free and build-safe.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://moomentum.events";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { path: "", priority: 1.0, changeFrequency: "weekly" },
    { path: "/vendors", priority: 0.8, changeFrequency: "daily" },
    { path: "/vendors/join", priority: 0.6, changeFrequency: "monthly" },
    { path: "/signup", priority: 0.7, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  ];

  return entries.map((e) => ({
    url: `${SITE_URL}${e.path}`,
    lastModified: now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
