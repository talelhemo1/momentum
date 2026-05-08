/**
 * Event share-card generator.
 *
 * Renders a 1080×1920 (Instagram Story aspect) image entirely client-side via
 * the Canvas API. No server, no external services. The output is a `Blob` the
 * caller can:
 *   - Pass to `navigator.share()` for native share sheets
 *   - Convert to an Object URL and trigger a download
 *   - Show as preview via URL.createObjectURL
 *
 * Why Canvas and not html-to-image:
 *   - Predictable output sizing (no DOM measurement quirks)
 *   - No DOM mounting required → can run on background data
 *   - Smaller bundle footprint (no html2canvas / dom-to-image)
 *
 * Fonts: we use the project's Heebo via the layout's CSS variable, but Canvas
 * needs explicit font names. We use system-ui as the fallback so the card
 * renders cleanly even before web fonts finish loading.
 */

import QRCode from "qrcode";
import type { EventInfo } from "./types";
import { EVENT_TYPE_LABELS } from "./types";
import { EVENT_CONFIG } from "./eventConfig";

export type CardTemplate = "classic" | "modern" | "minimalist" | "festive";

export const TEMPLATE_LABELS: Record<CardTemplate, string> = {
  classic: "קלאסי",
  modern: "מודרני",
  minimalist: "מינימליסטי",
  festive: "חגיגי",
};

export interface CardInput {
  event: EventInfo;
  template: CardTemplate;
  /** URL the QR code should encode. Caller passes the public RSVP / live link. */
  qrTarget?: string;
}

const W = 1080;
const H = 1920;

/** A small palette per template — colors only, layout differences handled in render fns. */
interface Palette {
  bg: [string, string]; // gradient top → bottom
  accent: string;
  ink: string;
  muted: string;
  /** RGB used to tint the QR's "dark" pixels. */
  qrDark: string;
  qrLight: string;
}

const PALETTES: Record<CardTemplate, Palette> = {
  classic: {
    bg: ["#1A1310", "#0A0708"],
    accent: "#D4B068",
    ink: "#F4DEA9",
    muted: "rgba(244,222,169,0.6)",
    qrDark: "#1A1310",
    qrLight: "#F4DEA9",
  },
  modern: {
    bg: ["#0F0F12", "#1A1310"],
    accent: "#F4DEA9",
    ink: "#FFFFFF",
    muted: "rgba(255,255,255,0.65)",
    qrDark: "#0F0F12",
    qrLight: "#F4DEA9",
  },
  minimalist: {
    bg: ["#0A0708", "#0A0708"],
    accent: "#D4B068",
    ink: "#FFFFFF",
    muted: "rgba(255,255,255,0.45)",
    qrDark: "#0A0708",
    qrLight: "#FFFFFF",
  },
  festive: {
    bg: ["#3A1F0E", "#1A1310"],
    accent: "#F4DEA9",
    ink: "#F4DEA9",
    muted: "rgba(244,222,169,0.7)",
    qrDark: "#1A1310",
    qrLight: "#F4DEA9",
  },
};

/** Hebrew weekday + day month + year, e.g. "יום שבת, 22 באוגוסט 2026". */
function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Word-wrap a string to fit a max width. Returns the lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawQR(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  x: number,
  y: number,
  palette: Palette,
) {
  const dataUrl = await QRCode.toDataURL(text, {
    width: size * 2, // 2x for crisp rendering
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: palette.qrDark, light: palette.qrLight },
  });
  const img = await loadImage(dataUrl);
  // White card behind QR for max contrast across templates.
  ctx.fillStyle = palette.qrLight;
  ctx.fillRect(x - 16, y - 16, size + 32, size + 32);
  ctx.drawImage(img, x, y, size, size);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// ──────────────────────────────── Template renderers ────────────────────────────────

interface Strings {
  badge: string;
  subjects: string;
  date: string;
  where: string;
  cta: string;
}

function buildStrings(event: EventInfo): Strings {
  const config = EVENT_CONFIG[event.type];
  const subjects = config.invitationHostPhrase(event.hostName, event.partnerName);
  const where = [event.synagogue, event.city].filter(Boolean).join(" · ");
  return {
    badge: EVENT_TYPE_LABELS[event.type],
    subjects,
    date: fmtDate(event.date),
    where,
    cta: "RSVP",
  };
}

function paintBackground(ctx: CanvasRenderingContext2D, p: Palette) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(1, p.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function paintGoldOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, alpha = 0.35) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, `rgba(212,176,104,${alpha})`);
  g.addColorStop(1, "rgba(212,176,104,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function fontStack(weight: number, size: number): string {
  return `${weight} ${size}px Heebo, "Assistant", system-ui, -apple-system, sans-serif`;
}

async function renderClassic(ctx: CanvasRenderingContext2D, s: Strings, p: Palette, qrTarget: string | undefined) {
  paintBackground(ctx, p);
  paintGoldOrb(ctx, W / 2, 200, 700, 0.55);
  paintGoldOrb(ctx, W / 2, H - 200, 600, 0.4);

  ctx.textAlign = "center";
  ctx.direction = "rtl";

  // Top eyebrow
  ctx.fillStyle = p.accent;
  ctx.font = fontStack(600, 38);
  ctx.fillText(`✦  ${s.badge}  ✦`, W / 2, 220);

  // Subjects (auto-wrap)
  ctx.fillStyle = p.ink;
  ctx.font = fontStack(800, 124);
  const lines = wrap(ctx, s.subjects, W - 140);
  let y = 480;
  for (const line of lines.slice(0, 3)) {
    ctx.fillText(line, W / 2, y);
    y += 150;
  }

  // Hairline divider
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 110, y + 30);
  ctx.lineTo(W / 2 + 110, y + 30);
  ctx.stroke();

  // Date
  ctx.fillStyle = p.ink;
  ctx.font = fontStack(500, 56);
  ctx.fillText(s.date, W / 2, y + 130);

  // Location
  if (s.where) {
    ctx.fillStyle = p.muted;
    ctx.font = fontStack(400, 42);
    ctx.fillText(s.where, W / 2, y + 200);
  }

  // QR + CTA at bottom
  if (qrTarget) {
    const qrSize = 280;
    await drawQR(ctx, qrTarget, qrSize, W / 2 - qrSize / 2, H - qrSize - 220, p);
    ctx.fillStyle = p.accent;
    ctx.font = fontStack(700, 44);
    ctx.fillText("סרוק לאישור הגעה", W / 2, H - 140);
  }

  // Branding bottom
  ctx.fillStyle = p.muted;
  ctx.font = fontStack(400, 28);
  ctx.fillText("Momentum · momentum.app", W / 2, H - 70);
}

async function renderModern(ctx: CanvasRenderingContext2D, s: Strings, p: Palette, qrTarget: string | undefined) {
  paintBackground(ctx, p);
  // Asymmetric blocks
  ctx.fillStyle = p.accent;
  ctx.fillRect(0, 0, 12, H);
  ctx.fillStyle = "rgba(244,222,169,0.06)";
  ctx.fillRect(80, 80, W - 160, H - 160);

  ctx.direction = "rtl";
  ctx.textAlign = "right";

  ctx.fillStyle = p.accent;
  ctx.font = fontStack(700, 32);
  ctx.fillText(s.badge.toUpperCase(), W - 140, 200);

  ctx.fillStyle = p.ink;
  ctx.font = fontStack(900, 140);
  const lines = wrap(ctx, s.subjects, W - 240);
  let y = 480;
  for (const line of lines.slice(0, 3)) {
    ctx.fillText(line, W - 140, y);
    y += 165;
  }

  ctx.fillStyle = p.accent;
  ctx.fillRect(W - 140 - 360, y + 40, 360, 6);

  ctx.fillStyle = p.ink;
  ctx.font = fontStack(600, 60);
  ctx.fillText(s.date, W - 140, y + 160);

  if (s.where) {
    ctx.fillStyle = p.muted;
    ctx.font = fontStack(400, 44);
    ctx.fillText(s.where, W - 140, y + 230);
  }

  ctx.textAlign = "left";
  if (qrTarget) {
    const qrSize = 240;
    await drawQR(ctx, qrTarget, qrSize, 140, H - qrSize - 200, p);
    ctx.fillStyle = p.accent;
    ctx.font = fontStack(700, 40);
    ctx.fillText("סרוק", 140 + qrSize + 32, H - qrSize - 100);
    ctx.fillStyle = p.ink;
    ctx.font = fontStack(800, 56);
    ctx.fillText("RSVP", 140 + qrSize + 32, H - qrSize - 36);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = p.muted;
  ctx.font = fontStack(500, 28);
  ctx.fillText("MOMENTUM", W - 140, H - 100);
}

async function renderMinimalist(ctx: CanvasRenderingContext2D, s: Strings, p: Palette, qrTarget: string | undefined) {
  paintBackground(ctx, p);

  ctx.direction = "rtl";
  ctx.textAlign = "center";

  // Tiny eyebrow
  ctx.fillStyle = p.accent;
  ctx.font = fontStack(500, 30);
  ctx.fillText(s.badge, W / 2, 320);

  // Hairline
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 60, 360);
  ctx.lineTo(W / 2 + 60, 360);
  ctx.stroke();

  // Subjects, lighter weight, more breathing room
  ctx.fillStyle = p.ink;
  ctx.font = fontStack(300, 110);
  const lines = wrap(ctx, s.subjects, W - 180);
  let y = 600;
  for (const line of lines.slice(0, 3)) {
    ctx.fillText(line, W / 2, y);
    y += 140;
  }

  // Date — small, ALL CAPS feel via spaced letters
  ctx.fillStyle = p.muted;
  ctx.font = fontStack(400, 42);
  ctx.fillText(s.date, W / 2, y + 100);

  if (s.where) {
    ctx.fillStyle = p.muted;
    ctx.font = fontStack(300, 38);
    ctx.fillText(s.where, W / 2, y + 170);
  }

  // QR — small, centered, with a thin label below
  if (qrTarget) {
    const qrSize = 220;
    await drawQR(ctx, qrTarget, qrSize, W / 2 - qrSize / 2, H - qrSize - 220, p);
    ctx.fillStyle = p.accent;
    ctx.font = fontStack(400, 32);
    ctx.fillText("RSVP", W / 2, H - 160);
  }

  ctx.fillStyle = p.muted;
  ctx.font = fontStack(300, 24);
  ctx.fillText("M O M E N T U M", W / 2, H - 80);
}

async function renderFestive(ctx: CanvasRenderingContext2D, s: Strings, p: Palette, qrTarget: string | undefined) {
  paintBackground(ctx, p);
  paintGoldOrb(ctx, 200, 200, 600, 0.6);
  paintGoldOrb(ctx, W - 200, H - 400, 700, 0.5);
  paintGoldOrb(ctx, W / 2, H / 2, 400, 0.25);

  // Sparkle dots scattered
  for (let i = 0; i < 18; i++) {
    const sx = (i * 137) % W;
    const sy = ((i * 251) % (H - 400)) + 60;
    const r = ((i * 7) % 6) + 3;
    ctx.fillStyle = `rgba(244,222,169,${0.25 + ((i * 17) % 60) / 100})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.direction = "rtl";
  ctx.textAlign = "center";

  ctx.fillStyle = p.accent;
  ctx.font = fontStack(700, 48);
  ctx.fillText(`🎉  ${s.badge}  🎉`, W / 2, 240);

  ctx.fillStyle = p.ink;
  ctx.font = fontStack(800, 132);
  const lines = wrap(ctx, s.subjects, W - 140);
  let y = 500;
  for (const line of lines.slice(0, 3)) {
    ctx.fillText(line, W / 2, y);
    y += 158;
  }

  // Decorative stars left-right
  ctx.fillStyle = p.accent;
  ctx.font = fontStack(700, 50);
  ctx.fillText("✦   ✦   ✦", W / 2, y + 70);

  ctx.fillStyle = p.ink;
  ctx.font = fontStack(600, 60);
  ctx.fillText(s.date, W / 2, y + 180);

  if (s.where) {
    ctx.fillStyle = p.muted;
    ctx.font = fontStack(400, 44);
    ctx.fillText(s.where, W / 2, y + 260);
  }

  if (qrTarget) {
    const qrSize = 280;
    await drawQR(ctx, qrTarget, qrSize, W / 2 - qrSize / 2, H - qrSize - 220, p);
    ctx.fillStyle = p.accent;
    ctx.font = fontStack(700, 44);
    ctx.fillText("נשמח לראותך 🥂", W / 2, H - 140);
  }

  ctx.fillStyle = p.muted;
  ctx.font = fontStack(400, 28);
  ctx.fillText("Momentum · momentum.app", W / 2, H - 70);
}

// ──────────────────────────────── Public API ────────────────────────────────

const RENDERERS: Record<CardTemplate, typeof renderClassic> = {
  classic: renderClassic,
  modern: renderModern,
  minimalist: renderMinimalist,
  festive: renderFestive,
};

/**
 * Generate a 1080×1920 share card as a Blob (image/png).
 * Synchronous-ish: returns a Promise that resolves when the QR + image bytes
 * are ready.
 */
export async function generateShareCard(input: CardInput): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("generateShareCard must run in the browser");
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // High-quality smoothing for the QR drawImage step.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const palette = PALETTES[input.template];
  const strings = buildStrings(input.event);
  const renderer = RENDERERS[input.template];
  await renderer(ctx, strings, palette, input.qrTarget);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas toBlob returned null"));
        return;
      }
      resolve(blob);
    }, "image/png", 0.95);
  });
}

/** Convenience: blob → object URL for previews / downloads. */
export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/** Trigger a browser download of the share card. */
export function downloadShareCard(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after the click handler had a chance to fire.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
