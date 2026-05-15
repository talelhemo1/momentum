import type { EventType } from "@/lib/types";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { formatEventDate } from "@/lib/format";

/**
 * R28 — the polished WhatsApp invite body. Short URL only (the rich OG
 * preview does the heavy lifting). Pure; isomorphic.
 */
export const EVENT_TYPE_EMOJI: Record<EventType, string> = {
  wedding: "💍",
  "bar-mitzvah": "🕯️",
  "bat-mitzvah": "🕯️",
  "shabbat-chatan": "📖",
  engagement: "💞",
  brit: "👶",
  birthday: "🎂",
  corporate: "🎉",
  other: "✨",
};

export function buildWhatsappInviteMessage(input: {
  guestName: string;
  hostName: string;
  partnerName?: string;
  eventType: EventType;
  eventDate: string; // ISO / YYYY-MM-DD
  venue?: string;
  shortUrl: string;
}): string {
  const emoji = EVENT_TYPE_EMOJI[input.eventType] ?? "✨";
  const typeLabel = EVENT_TYPE_LABELS[input.eventType] ?? "אירוע";
  const hosts = input.partnerName
    ? `${input.hostName} ו-${input.partnerName}`
    : input.hostName;
  const dateStr = formatEventDate(input.eventDate, "long");

  const lines: string[] = [
    `שלום ${input.guestName} 👋`,
    "",
    `${emoji} ${typeLabel} של ${hosts}`,
    "",
  ];
  if (dateStr) lines.push(`📅 ${dateStr}`);
  if (input.venue) lines.push(`📍 ${input.venue}`);
  lines.push(
    "",
    "מוזמנים לחגוג איתנו!",
    "👇 לאישור הגעה",
    "",
    input.shortUrl,
  );
  return lines.join("\n");
}
