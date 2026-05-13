/**
 * Momentum Live — Phase 6 Thank-You Messages (R20).
 *
 * Pure function. Builds personalized post-event WhatsApp messages — three
 * variants: attended, attended-with-plus-one, no-show. Phone normalization
 * comes from lib/phone.ts so wa.me links match the same conventions as
 * invitations and welcome messages.
 */
import { normalizeIsraeliPhone } from "./phone";

export interface ThankYouInput {
  guestName: string;
  guestPhone: string;
  hostName: string;
  partnerName?: string;
  /** True when the guest's check-in row exists. */
  attended: boolean;
  /** Extra people beyond the guest (0 = just them). Ignored when !attended. */
  plusOnes?: number;
}

export interface ThankYouResult {
  url: string;
  text: string;
  valid: boolean;
}

export function buildThankYouMessage(input: ThankYouInput): ThankYouResult {
  const subjects = input.partnerName
    ? `${input.hostName} ו-${input.partnerName}`
    : input.hostName;

  const lines: string[] = [`${input.guestName}, היי 💛`, ""];

  if (input.attended) {
    if ((input.plusOnes ?? 0) > 0) {
      lines.push(
        `תודה ענקית שבאת/ם איתנו לחגוג — ולמי שהבאת איתך גם! 🎉`,
      );
    } else {
      lines.push(`תודה שהיית חלק מהערב המיוחד הזה איתנו 🎉`);
    }
    lines.push("");
    lines.push(`הנוכחות שלך הפכה את האירוע למשהו ששווה לזכור.`);
  } else {
    lines.push(`התגעגענו אליך באירוע 💛`);
    lines.push("");
    lines.push(`היה ערב יפהפה, ונשמח לראות אותך בקרוב להמשך החגיגות.`);
  }

  lines.push("", `באהבה,`, subjects);

  const text = lines.join("\n");
  const encoded = encodeURIComponent(text);
  const { phone, valid } = normalizeIsraeliPhone(input.guestPhone);
  return {
    url: valid
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`,
    text,
    valid,
  };
}
