import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lookupEventByToken } from "@/lib/invitationLookup";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { EVENT_TYPE_EMOJI } from "@/lib/invitationMessage";
import { formatEventDate } from "@/lib/format";

export const alt = "הזמנה לאירוע — Momentum";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Node runtime (not edge): Next 16's documented OG pattern uses
// node:fs `readFile` for fonts, and edge isn't supported under proxy.

const GoldM = () => (
  <svg width="84" height="84" viewBox="0 0 32 32">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="32" y2="32">
        <stop offset="0" stopColor="#F4DEA9" />
        <stop offset="0.5" stopColor="#D4B068" />
        <stop offset="1" stopColor="#A8884A" />
      </linearGradient>
    </defs>
    <path
      d="M4 23 L10 11 L16 19 L22 7 L28 23"
      stroke="url(#g)"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="28" cy="23" r="2.2" fill="url(#g)" />
  </svg>
);

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [hebrew, latin] = await Promise.all([
    readFile(join(process.cwd(), "assets/Heebo-Bold.ttf")),
    readFile(join(process.cwd(), "assets/Heebo-Latin.ttf")),
  ]);
  const fonts = [
    { name: "Heebo", data: hebrew, weight: 700 as const, style: "normal" as const },
    { name: "Heebo", data: latin, weight: 700 as const, style: "normal" as const },
  ];
  const opts = {
    ...size,
    fonts,
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  };

  const ev = await lookupEventByToken(token).catch(() => null);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        fontFamily: "Heebo",
        direction: "rtl",
        background:
          "linear-gradient(135deg, #0A0A0B 0%, #1A1410 50%, #0A0A0B 100%)",
      }}
    >
      {children}
    </div>
  );

  if (!ev) {
    return new ImageResponse(
      (
        <Shell>
          <GoldM />
          <div
            style={{
              marginTop: 36,
              fontSize: 64,
              fontWeight: 700,
              color: "#F4DEA9",
              display: "flex",
            }}
          >
            הזמנה לאירוע יוקרתי
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 30,
              color: "#A89878",
              display: "flex",
            }}
          >
            Momentum
          </div>
        </Shell>
      ),
      opts,
    );
  }

  const hosts = ev.partnerName
    ? `${ev.hostName} ו-${ev.partnerName}`
    : ev.hostName;
  const where = [ev.synagogue, ev.city].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <Shell>
        <GoldM />

        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#D4B068",
            display: "flex",
          }}
        >
          {`${EVENT_TYPE_EMOJI[ev.type] ?? "✨"} ${EVENT_TYPE_LABELS[ev.type] ?? "אירוע"}`}
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 92,
            fontWeight: 700,
            color: "#F4DEA9",
            textAlign: "center",
            letterSpacing: -2,
            display: "flex",
            lineHeight: 1.1,
          }}
        >
          {hosts}
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 36,
            color: "#FFF9E8",
            display: "flex",
          }}
        >
          {`📅 ${formatEventDate(ev.date, "long")}`}
        </div>

        {where && (
          <div
            style={{
              marginTop: 10,
              fontSize: 28,
              color: "#A89878",
              display: "flex",
            }}
          >
            {`📍 ${where}`}
          </div>
        )}

        <div
          style={{
            marginTop: 48,
            padding: "18px 44px",
            background: "rgba(212,176,104,0.15)",
            border: "2px solid rgba(212,176,104,0.5)",
            borderRadius: 100,
            fontSize: 30,
            color: "#F4DEA9",
            display: "flex",
          }}
        >
          ✨ לחצו לאישור הגעה ✨
        </div>
      </Shell>
    ),
    opts,
  );
}
