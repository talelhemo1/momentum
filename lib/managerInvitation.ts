import { normalizeIsraeliPhone } from "./phone";
import { tryGetPublicOrigin } from "./origin";

/**
 * Momentum Live (R20 Phase 2) — WhatsApp invitation builder for the event
 * manager. Wraps the accept-token URL in a friendly Hebrew message and
 * resolves the destination wa.me URL.
 *
 * Phone normalization goes through lib/phone so two stored variants of the
 * same number ("050-1234567" vs "+972501234567") still hit the same wa.me
 * recipient on send.
 */
export interface ManagerInviteInput {
  managerName: string;
  managerPhone: string;
  invitationToken: string;
  eventHostName: string;
  /** ISO date string (YYYY-MM-DD or full ISO). Optional — message reads
   *  fine without it. */
  eventDate?: string;
}

export interface ManagerInviteResult {
  /** Ready-to-open wa.me URL. Always returns a usable URL (recipient-less
   *  fallback if phone failed normalization). */
  url: string;
  /** Raw multiline Hebrew message text — also useful for a "Copy" button. */
  text: string;
  /** False when phone normalization rejected the number; the wa.me URL
   *  still opens, but without a pre-selected recipient. Caller can warn
   *  the user. */
  valid: boolean;
}

/**
 * R25 — the shared Hebrew invite body. Extracted so the SMS API route
 * (`/api/manager/invite`) sends the EXACT same message the WhatsApp
 * builder produces. Pure: no DOM, no fetch.
 */
export function buildInviteText(input: ManagerInviteInput): string {
  // tryGetPublicOrigin returns "" when called server-side without
  // NEXT_PUBLIC_SITE_URL set. We fall back to a relative path so the
  // message text is at least sensible; the link still works because
  // the manager opens it on the same domain (or the absolute site URL).
  const origin = tryGetPublicOrigin();
  const acceptPath = `/manage/accept?token=${encodeURIComponent(input.invitationToken)}`;
  const acceptUrl = origin ? `${origin}${acceptPath}` : acceptPath;

  // toLocaleDateString returns "Invalid Date" for malformed input — guard
  // explicitly so a bad date doesn't end up in the message body.
  let dateStr = "";
  if (input.eventDate) {
    const d = new Date(input.eventDate);
    if (!Number.isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
  }

  const lines = [
    `היי ${input.managerName}! 👋`,
    "",
    `${input.eventHostName} מבקש/ת ממך לקבל תפקיד מיוחד באירוע${
      dateStr ? ` ב-${dateStr}` : ""
    }:`,
    "",
    `🎯 *מנהל/ת האירוע* — דרך אפליקציית Momentum.`,
    "",
    "מה זה אומר? תקבל/י דשבורד פשוט בנייד שלך:",
    "✅ סורק/ת QR בכניסה — מי הגיע, מי לא",
    "🪑 רואה את כל השולחנות בזמן אמת",
    "📞 כפתורים מהירים לתיאום עם הספקים",
    "",
    "התפקיד נמשך רק במהלך האירוע. *אין צורך להוריד אפליקציה — הכל מהדפדפן.*",
    "",
    `👇 לחץ/י כאן לאישור:`,
    acceptUrl,
    "",
    "תודה רבה! 💛",
  ];
  return lines.join("\n");
}

export function buildManagerInviteWhatsapp(input: ManagerInviteInput): ManagerInviteResult {
  const text = buildInviteText(input);

  const { phone, valid } = normalizeIsraeliPhone(input.managerPhone);
  const encoded = encodeURIComponent(text);
  return {
    url: valid
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`,
    text,
    valid,
  };
}
