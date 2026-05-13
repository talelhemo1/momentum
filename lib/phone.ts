/**
 * Israeli phone normalization + validation.
 *
 * Single source of truth for every WhatsApp/SMS link in the app. Three
 * call sites (rsvpLinks, invitation, whatsapp) used to maintain near-
 * identical copies, each with subtly different bugs (no trim, no "00"
 * handling, no validation). They now all delegate here.
 *
 * Returns:
 *   { phone, valid }
 *   - `phone`  — digits-only, 972-prefixed when possible (may still be
 *                garbage if the caller passed garbage)
 *   - `valid`  — true only when the result parses as a real Israeli mobile
 *                or landline number, i.e. 11 or 12 digits starting with 972
 *                and the digit-after-972 is one of 5/2/3/4/8/9.
 *
 * Callers should branch their wa.me URL on `valid` rather than `phone.length`.
 */

/** Mobile = 972 + 9 digits starting with 5 (e.g. 972501234567). */
const MOBILE_LEN = 12;
/** Landline = 972 + 8 digits starting with 2/3/4/8/9 (e.g. 97231234567). */
const LANDLINE_LEN = 11;

export interface NormalizedPhone {
  phone: string;
  valid: boolean;
}

export function normalizeIsraeliPhone(raw: string): NormalizedPhone {
  // Trim, drop a leading "+", THEN strip non-digits. The order matters —
  // a leading whitespace would otherwise break a startsWith("+") check.
  const cleaned = String(raw ?? "").trim().replace(/^\+/, "");
  let digits = cleaned.replace(/\D/g, "");
  if (!digits) return { phone: "", valid: false };

  // International "00" prefix (used in some countries instead of +) — drop it.
  if (digits.startsWith("00")) digits = digits.slice(2);

  let phone: string;
  if (digits.startsWith("972")) {
    // A leading 0 AFTER 972 is a common typo (e.g. "+9720501234567" — user
    // typed both the country code AND the local trunk prefix). Strip the
    // extra 0 so the result is the same 12-digit form as "+972501234567".
    const after972 = digits.slice(3);
    phone = "972" + (after972.startsWith("0") ? after972.slice(1) : after972);
  } else if (digits.startsWith("0")) {
    phone = "972" + digits.slice(1);
  } else {
    phone = digits;
  }

  return { phone, valid: isValidIsraeliPhone(phone) };
}

/** True when `phone` is a fully-normalized Israeli mobile or landline. */
export function isValidIsraeliPhone(phone: string): boolean {
  if (!phone.startsWith("972")) return false;
  if (phone.length !== MOBILE_LEN && phone.length !== LANDLINE_LEN) return false;
  const next = phone[3];
  if (phone.length === MOBILE_LEN) return next === "5";
  return next === "2" || next === "3" || next === "4" || next === "8" || next === "9";
}
