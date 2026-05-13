export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "Momentum — תכנון אירועים",
    short_name: "Momentum",
    description: "הדרך החכמה לתכנן אירועים",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0B",
    theme_color: "#0A0A0B",
    lang: "he",
    dir: "rtl",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json" },
  });
}
