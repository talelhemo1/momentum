import { headers } from "next/headers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RedirectIfSignedIn } from "@/components/landing/RedirectIfSignedIn";
import { Hero } from "@/components/landing/Hero";
import { PainSection } from "@/components/landing/PainSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { AppShowcase } from "@/components/landing/AppShowcase";
import { TrustSection } from "@/components/landing/TrustSection";
import { HonestStats } from "@/components/landing/HonestStats";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";

/**
 * R62 (R52) — pre-paint redirect to /dashboard for signed-in users.
 *
 * Why an inline script and not a Server-Component `getUser()` redirect?
 *   This app's Supabase session lives in **localStorage**, not cookies
 *   (the browser client uses persistSession:true → localStorage). The
 *   server can't read it. The spec's `await supabase.auth.getUser()`
 *   on a Server Component would return null for every visitor (signed
 *   in or not), so the redirect would never fire.
 *
 *   An inline `<script>` in the SSR HTML runs synchronously before the
 *   body paints, reads localStorage, and `location.replace()` to the
 *   dashboard if a Supabase session token is found. Signed-out visitors
 *   continue parsing the landing in the same tick → no flash, no delay.
 *
 * CSP: middleware emits a per-request `x-nonce` header and a
 * `script-src 'nonce-…' 'strict-dynamic'` policy. The nonce attribute
 * below lets this inline script execute under that policy.
 */
// R148 — runs BEFORE the body paints. Two-step process:
//   1. Synchronously check if a Supabase session token exists in
//      localStorage. If yes → hide the body INSTANTLY (so no landing
//      content flashes through) and pick the right destination using
//      the cached vendor flag (set by useVendorContext on every
//      successful auth check). Then redirect. The user never sees /.
//   2. If no session → do nothing; landing renders normally.
//
// Pre-R148 the script used `location.replace("/dashboard")`
// unconditionally and waited until the redirect committed. That's
// "fast" in absolute terms but leaves a visible flash of the
// landing hero for one paint cycle — especially noticeable when the
// user hits the browser back button from /vendors/dashboard. The
// hide-then-redirect pattern (used on github.com, vercel.com, etc.)
// guarantees zero flash regardless of how fast the redirect commits.
const REDIRECT_SCRIPT = `
(function(){
  try {
    // ── OAuth / email-verify rescue ──────────────────────────────────
    // Supabase finishes OAuth (Google/Apple) and magic-link verification by
    // redirecting to a URL. When the project's "Redirect URLs" allowlist
    // doesn't include /auth/callback, Supabase falls back to the SITE URL —
    // which is the landing root ("/"). The login credentials (?code=… for
    // PKCE, #access_token=… for implicit, ?token_hash=… for email) then sit
    // UNPROCESSED on the landing page, so the user appears to "bounce back to
    // the homepage without being logged in".
    //
    // Forward those params to our real handler (/auth/callback). It's the
    // SAME origin, so the PKCE code-verifier stored in localStorage is intact
    // and exchangeCodeForSession() works. Runs first, synchronously, before
    // supabase-js initializes — so there's no race and no flash.
    var s = window.location.search || "";
    var h = window.location.hash || "";
    if (
      /[?&](code|token_hash|error_description)=/.test(s) ||
      /[#&](access_token|error_description)=/.test(h)
    ) {
      location.replace("/auth/callback" + s + h);
      return;
    }

    var hasSession = false;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) {
        var v = localStorage.getItem(k);
        if (v && v.length > 10) { hasSession = true; break; }
      }
    }
    if (!hasSession) return;
    // Hide the body immediately so no landing content shows through
    // during the redirect commit.
    var html = document.documentElement;
    if (html && html.style) html.style.visibility = "hidden";
    // Vendor-aware destination. We read the same cached flag that
    // useVendorContext writes after every successful auth check
    // (see lib/storage-keys.ts vendorContext key). Falls back to
    // /dashboard if no cache yet — useVendorRedirect will handle
    // the second hop, same as before the SSR script existed.
    var dest = "/dashboard";
    try {
      var raw = localStorage.getItem("momentum.vendor.context.v1");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.isVendor === true) dest = "/vendors/dashboard";
      }
    } catch (e) {}
    location.replace(dest);
  } catch (e) {}
})();
`;

/**
 * R42 — premium landing page. Composition only; each section is its own
 * component under components/landing/. Order is conversion-tuned:
 * hook → pain → solution → proof → trust → objections → close.
 */
export default async function LandingPage() {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <>
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: REDIRECT_SCRIPT }}
      />
      {/* R126 — client-side counterpart to the SSR script: catches
          users who arrive here via SPA navigation (back button, logo
          click) or sign in while still on this page. */}
      <RedirectIfSignedIn />
      <Header />
      <main className="flex-1 relative">
        <Hero />
        <PainSection />
        <SolutionSection />
        <FeatureGrid />
        <AppShowcase />
        <TrustSection />
        <HonestStats />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
