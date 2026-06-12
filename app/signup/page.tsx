import type { Metadata } from "next";
import { headers } from "next/headers";
import { SignupClient } from "./SignupClient";

// R166 — unique title/description for the signup page (it's public +
// indexable + in the sitemap). Without this it inherited the generic
// layout title, hurting its search snippet.
export const metadata: Metadata = {
  title: "הרשמה וכניסה — Momentum",
  description:
    "פתחו חשבון Momentum בחינם והתחילו לתכנן את האירוע — ניהול מוזמנים, אישורי הגעה ב-WhatsApp, תקציב חכם וסידור הושבה, הכל במקום אחד.",
  alternates: { canonical: "/signup" },
};

/**
 * R62 (R52) — signup-page wrapper that emits the same pre-paint
 * redirect script as `/` and `/start`. Signed-in visitors get sent
 * straight to `?next=` (or /dashboard) before the body paints, so they
 * never see the signup form when they don't need to.
 *
 * Why an inline script and not a Server-Component getUser() redirect:
 * the Supabase session lives in localStorage, not cookies, so the
 * server can't read it. The script runs sync in the SSR HTML before
 * paint — no flash, no client-side bounce.
 *
 * The actual signup form lives in `./SignupClient.tsx` (previously the
 * default export of this file; renamed in R62).
 */

/**
 * Build the inline-redirect IIFE. We escape `next` minimally for
 * safety — accept only same-origin relative paths starting with `/`,
 * anything else falls through to /dashboard.
 */
function buildRedirectScript(next: string): string {
  // Reject open-redirects: scheme-relative `//evil.com`, backslash
  // tricks, or anything not starting with a single `/`.
  const safe =
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !/[<>"'\\\\]/.test(next)
      ? next
      : "/dashboard";
  const safeJson = JSON.stringify(safe);
  return `
(function(){
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) {
        var v = localStorage.getItem(k);
        if (v && v.length > 10) { location.replace(${safeJson}); return; }
      }
    }
  } catch (e) {}
})();
`;
}

export default async function SignupPage({
  searchParams,
}: {
  // Next 16 — searchParams is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nonce, sp] = await Promise.all([
    headers().then((h) => h.get("x-nonce") ?? ""),
    searchParams,
  ]);
  // Honor `?next=` (also accept legacy `?returnTo=`); fall back to /dashboard.
  const rawNext = sp?.next ?? sp?.returnTo;
  const next = typeof rawNext === "string" ? rawNext : "/dashboard";
  return (
    <>
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: buildRedirectScript(next) }}
      />
      <SignupClient />
    </>
  );
}
