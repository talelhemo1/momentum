import { normalizeIsraeliPhone } from "./phone";
import { EVENT_TYPE_LABELS, type EventInfo } from "./types";

/**
 * Pre-fill builder for a "I want a price quote" WhatsApp message to a
 * vendor. The message is friendly, mentions Momentum (so the vendor knows
 * where the lead came from), embeds the user's actual event details
 * (signals seriousness — vendors get a lot of "just looking" leads), and
 * makes a single clear ask: "אשמח להצעת מחיר".
 *
 * The recipient phone is normalized through `lib/phone.ts` so a "0501234567"
 * entry becomes "972501234567" — same shape the rest of the app uses for
 * wa.me URLs.
 */

export interface ContactMessageInput {
  vendorName: string;
  /** Optional event context — when present the message embeds date/place/headcount. */
  event?: Pick<EventInfo, "type" | "date" | "city" | "synagogue"> | null;
  /** Sum of `attendingCount` across confirmed guests (computed in caller). */
  confirmedGuests?: number;
  /** Free-form note from the user, appended as its own line. */
  customNote?: string;
}

/**
 * Returns a multi-line Hebrew message ready to drop into wa.me.
 * Lines are kept short — WhatsApp wraps badly on long lines and emojis
 * help the vendor scan the request quickly on their phone.
 */
export function buildVendorContactMessage(input: ContactMessageInput): string {
  const { vendorName, event, confirmedGuests, customNote } = input;

  const lines: string[] = [
    `שלום ${vendorName}! 👋`,
    "",
    "הגעתי אליכם דרך אפליקציית *Momentum* — פלטפורמה לתכנון אירועים בישראל.",
    "",
  ];

  if (event) {
    const eventTypeLabel = EVENT_TYPE_LABELS[event.type] ?? "אירוע";
    // toLocaleDateString swallows invalid dates with "Invalid Date"; guard
    // explicitly so a malformed date string doesn't end up in the message.
    let dateStr: string | null = null;
    if (event.date) {
      const d = new Date(event.date);
      if (!Number.isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString("he-IL", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
    }

    lines.push(
      `📅 אני מתכנן/ת *${eventTypeLabel}*${dateStr ? ` בתאריך ${dateStr}` : ""}`,
    );

    if (event.city || event.synagogue) {
      const place = [event.synagogue, event.city].filter(Boolean).join(", ");
      lines.push(`📍 מקום: ${place}`);
    }

    if (confirmedGuests && confirmedGuests > 0) {
      lines.push(`👥 ${confirmedGuests} אורחים אישרו הגעה`);
    }

    lines.push("");
  }

  if (customNote && customNote.trim()) {
    lines.push(`📝 ${customNote.trim()}`);
    lines.push("");
  }

  lines.push("אשמח לקבל הצעת מחיר ופרטים על השירות שלכם.", "תודה רבה!");

  return lines.join("\n");
}

/**
 * Build a wa.me URL with the message pre-filled. Falls back to the
 * recipient-less form (`wa.me/?text=...`) when the phone fails normalization
 * — opens WhatsApp with the message ready to paste manually rather than
 * silently sending a wrong number.
 */
export function buildVendorWhatsappUrl(
  vendorPhone: string,
  message: string,
): { url: string; valid: boolean } {
  const { phone, valid } = normalizeIsraeliPhone(vendorPhone);
  const encoded = encodeURIComponent(message);
  return {
    url: valid
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`,
    valid,
  };
}
