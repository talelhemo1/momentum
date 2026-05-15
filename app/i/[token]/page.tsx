import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { lookupShortLink } from "@/lib/shortLinks";
import { lookupEventByToken } from "@/lib/invitationLookup";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { formatEventDate } from "@/lib/format";

/**
 * R28 — /i/<shortId>. Two jobs:
 *   1. Server-redirect the guest to the real /rsvp?d=…&sig=… path.
 *   2. Exist as a real page so the co-located opengraph-image.tsx +
 *      generateMetadata produce a rich WhatsApp preview.
 *
 * Next 16: `params` is a Promise (async request APIs).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  // R29 — never let a Supabase/decoding hiccup bubble out of
  // generateMetadata (that surfaces as a generic crash page).
  const ev = await lookupEventByToken(token).catch(() => null);
  if (!ev) {
    return {
      title: "הזמנה — Momentum",
      description: "הזמנה לאירוע",
    };
  }
  const hosts = ev.partnerName
    ? `${ev.hostName} ו-${ev.partnerName}`
    : ev.hostName;
  const typeLabel = EVENT_TYPE_LABELS[ev.type] ?? "אירוע";
  const where = [ev.synagogue, ev.city].filter(Boolean).join(" · ");
  const title = `${typeLabel} של ${hosts}`;
  const description = [formatEventDate(ev.date, "long"), where]
    .filter(Boolean)
    .join(" · ");

  // The co-located opengraph-image.tsx file convention auto-injects the
  // og:image / twitter:image meta — we only set the text + locale here.
  return {
    title,
    description,
    openGraph: { type: "website", title, description, locale: "he_IL" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * SECURITY (R30): short_links has an open INSERT policy (the short id is
 * the capability), so `long_path` is attacker-influencable. Only ever
 * redirect to a same-origin /rsvp query path. The RSVP payload is
 * base64url (`A-Za-z0-9-_`) plus query punctuation, so a strict charset
 * whitelist both blocks scheme/backslash phishing redirects and avoids a
 * naive `[\\ -]` range that would wrongly reject the legit base64url `-`.
 */
const SAFE_RSVP_PATH = /^\/rsvp\?[A-Za-z0-9\-_=&%.]+$/;

function safeRedirectPath(longPath: string | null): string | null {
  if (!longPath) return null;
  if (!longPath.startsWith("/rsvp?")) return null;
  if (longPath.includes("://") || longPath.includes("\\")) return null;
  return SAFE_RSVP_PATH.test(longPath) ? longPath : null;
}

export default async function ShortInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const longPath = await lookupShortLink(token);
  const safePath = safeRedirectPath(longPath);

  // redirect() throws NEXT_REDIRECT — must run outside any try/catch.
  if (safePath) redirect(safePath);

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="card p-8 text-center max-w-md">
        <div className="text-4xl">💌</div>
        <h1 className="mt-4 text-xl font-bold">ההזמנה הזאת פגה תוקף</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          ייתכן שהקישור הוחלף או שהאירוע כבר עבר. בקשו מהמארחים קישור עדכני.
        </p>
        <Link
          href="/"
          className="text-xs underline mt-4 inline-block"
          style={{ color: "var(--foreground-muted)" }}
        >
          חזרה לדף הבית
        </Link>
      </div>
    </main>
  );
}
