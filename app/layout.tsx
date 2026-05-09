import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AssistantWidget } from "@/components/AssistantWidget";
import { ToastHost } from "@/components/Toast";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ScrollProgress } from "@/components/ScrollProgress";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Momentum — תכנון אירועים חכם",
  description:
    "מרעיון ראשון ועד האורח האחרון. כל מה שאתה צריך לתכנון אירוע מושלם, במקום אחד.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Momentum",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ScrollProgress />
        {children}
        <AssistantWidget />
        <ToastHost />
        <MobileBottomNav />
      </body>
    </html>
  );
}
