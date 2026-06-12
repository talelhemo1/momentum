import type { Metadata, Viewport } from "next";
import { Heebo, Frank_Ruhl_Libre } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { DeferredAssistant } from "@/components/DeferredAssistant";
import { ToastHost } from "@/components/Toast";
// R125 — MobileBottomNav removed by product call. The two-tier Header
// already exposes the same destinations as a horizontally-scrolling pill
// row on mobile; the bottom bar duplicated that nav AND occupied 64px of
// vertical space below the fold. The Header is now the single nav surface
// on every viewport. (Component file kept in case we ever want to bring it
// back behind a feature flag — just re-add the import + mount below.)
import { ScrollProgress } from "@/components/ScrollProgress";
import { validateEnv } from "@/lib/env-validate";
import { ErrorListener } from "@/components/error-tracking/ErrorListener";
import { VitalsReporter } from "./vitals";

// R47 — one-shot startup check (server module scope). Logs loudly if
// NEXT_PUBLIC_SITE_URL is missing / stale / non-https after the
// moomentum.events migration. Production only — never throws.
if (process.env.NODE_ENV === "production") validateEnv();

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

// R138 — luxury display serif. Frank Ruhl Libre is the Hebrew display
// face used by Haaretz, premium Israeli editorial brands, and
// wedding-invitation studios. Loaded only for the dashboard hero (and
// any other place we opt-in via the `.font-display` utility class), so
// we don't grow body-copy font weight unnecessarily. Latin subset
// included so English names + Latin punctuation in mixed contexts
// don't fall back to a clashing system serif.
const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-display",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "900"],
  display: "swap",
});

// R32 — canonical site origin so metadata emits ABSOLUTE og:image URLs
// (WhatsApp / social scrapers reject relative ones). NEXT_PUBLIC_SITE_URL
// wins in prod; the deployed domain is the safe fallback.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://moomentum.events";

// R32 — the static brand card. Every route in the App Router inherits
// this; only routes with their own generateMetadata override it.
const OG_IMAGE = {
  url: "/og-default-1200x630.png?v=3",
  width: 1200,
  height: 630,
  alt: "Momentum — מומנטום אירועים",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Momentum — תכנון אירועים חכם",
  description:
    "מרעיון ראשון ועד האורח האחרון. כל מה שאתה צריך לתכנון אירוע מושלם, במקום אחד.",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: SITE_URL,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Momentum",
  },
  openGraph: {
    type: "website",
    siteName: "Momentum — מומנטום אירועים",
    url: SITE_URL,
    locale: "he_IL",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-default-1200x630.png?v=3"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
  // R87 — `viewport-fit: "cover"` is required for
  // `env(safe-area-inset-*)` to return non-zero values on iPhone X+
  // (notch + home indicator). Sheet/Modal footers use
  // `env(safe-area-inset-bottom)` for sticky composer rows; without
  // this, the inset evaluates to 0 and the row sits on top of the
  // home indicator.
  viewportFit: "cover",
  // R120 — `interactiveWidget: "resizes-content"` opts us into the
  // modern keyboard-resize behavior: when the soft keyboard opens
  // on iOS/Android, the page content shrinks to fit the visible
  // area instead of the keyboard overlapping the input and pushing
  // every `position: fixed` element off-screen. Without this hint
  // an input near the bottom of the page on mobile felt like the
  // whole site jumped when focus + the keyboard popped up.
  interactiveWidget: "resizes-content",
  // Note: we intentionally do NOT set `maximumScale` or `userScalable: false` —
  // blocking pinch-zoom violates WCAG 2.1 SC 1.4.4 (Resize Text) and excludes
  // users with low vision. The small UX win on iOS double-tap-to-zoom isn't
  // worth the accessibility regression.
};

// Runs before React hydrates — prevents a flash of the wrong theme.
const themeBootScript = `
(function(){
  try {
    var t = localStorage.getItem('momentum.theme.v1');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

// R63 (R53) — Plausible loader. Inline nonce'd script that (a) sets up
// the `window.plausible` queue so calls before the SDK loads aren't
// lost, and (b) injects the Plausible <script> tag dynamically. The
// dynamic injection is the only way to load an external host under our
// strict-dynamic CSP (host-source expressions are ignored when
// 'strict-dynamic' is present, but scripts inserted by a nonce'd script
// inherit the trust). Plausible itself no-ops on non-registered domains
// (local dev, tunnel URLs) so we don't pollute production stats.
const plausibleDomain =
  process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "moomentum.events";
const plausibleBootScript = `
(function(){
  try {
    window.plausible = window.plausible || function(){ (window.plausible.q = window.plausible.q || []).push(arguments); };
    var s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', ${JSON.stringify(plausibleDomain)});
    s.src = 'https://plausible.io/js/script.tagged-events.js';
    document.head.appendChild(s);
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // R12 §1H — read the per-request nonce that `middleware.ts` set on the
  // incoming request. Apply it to every inline script we emit so the CSP
  // (which now disallows `unsafe-inline` for scripts) lets them run.
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${frankRuhl.variable} h-full antialiased`}
    >
      <head>
        {/* R70 (R59) — `suppressHydrationWarning` on nonce'd scripts.
            Browsers strip `nonce` from the DOM after parsing (security),
            so React's hydration sees nonce="" on the client and warns.
            The scripts execute server-side once anyway; the suppress
            is the documented Next.js pattern for CSP nonce inline. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: plausibleBootScript }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ErrorListener />
        <VitalsReporter />
        <ScrollProgress />
        {children}
        <DeferredAssistant />
        <ToastHost />
      </body>
    </html>
  );
}
