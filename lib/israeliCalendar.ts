/**
 * Israeli calendar awareness for reminders/notifications.
 *
 * What's here:
 *  - isShabbat(date)  — Friday sunset → Saturday nightfall
 *  - isHoliday(date)  — major Jewish holidays (Rosh Hashana, Yom Kippur,
 *                       Sukkot, Pesach, Shavuot, Purim, Hanukkah)
 *  - isMourningPeriod(date) — Three Weeks (17 Tammuz → 9 Av) and Omer days
 *                              where weddings are traditionally avoided
 *  - nextValidNotificationTime(...) — given a user's observance, return the
 *                                      earliest time we may send a reminder
 *
 * Why hard-coded dates instead of a hebcal library:
 *  - Adding a heavy dependency for ~30 dates/year is overkill.
 *  - Hebcal output is opinionated about diaspora vs. Israel and we'd need
 *    to wire that anyway. This file keeps Israel-only times explicit.
 *  - Coverage: 2025-09 → 2028-12 (3 wedding-planning seasons forward). When
 *    we approach the end of the table we extend it; trying to compute Hebrew
 *    calendar from scratch in 80 LoC would be a footgun.
 *
 * Times are LOCAL-ISRAEL approximations (no per-city sunset). For the purpose
 * of "should I send a reminder?" this is fine — we err on the side of being
 * conservative (start an hour earlier, end half an hour later than astronomical
 * sunset/nightfall).
 */

export type ObservanceLevel = "secular" | "traditional" | "religious";

export const OBSERVANCE_LABELS: Record<ObservanceLevel, string> = {
  secular: "חילוני",
  traditional: "מסורתי",
  religious: "דתי",
};

export const OBSERVANCE_DESCRIPTIONS: Record<ObservanceLevel, string> = {
  secular: "שלח התראות תמיד",
  traditional: "אל תשלח בשבת",
  religious: "אל תשלח בשבת, חגים, ובימי אבל",
};

// ─────────────────────────────────── Shabbat ───────────────────────────────────

/**
 * Shabbat boundaries (Israel Standard Time, no DST shift logic — a 30-minute
 * conservative margin absorbs that). Returns true between Friday ~18:00 and
 * Saturday ~20:00 local time. Good enough for "should I delay a notification".
 */
export function isShabbat(date: Date): boolean {
  // toLocaleString lets us read the calendar values in Asia/Jerusalem regardless
  // of where the device is. We split the parts manually since toLocaleString
  // returns a single string we'd then have to parse — using parts is cleaner.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);

  // Friday 18:00 → midnight  OR  Saturday 00:00 → 20:00 (conservative).
  if (weekday === "Fri" && hour >= 18) return true;
  if (weekday === "Sat" && hour < 20) return true;
  return false;
}

// ─────────────────────────────────── Holidays ───────────────────────────────────

/**
 * Major Jewish holidays in Israel where notifications should be suppressed.
 * Each entry is `[startISO, endISO, label]` where the dates are inclusive
 * full-day windows in Asia/Jerusalem. Half-holidays (chol-hamoed) are NOT
 * included — they're working days for most observance levels and including
 * them would over-suppress.
 */
const HOLIDAY_RANGES: ReadonlyArray<readonly [string, string, string]> = [
  // ─── 5786 (2025-09 → 2026-09) ───
  ["2025-09-22", "2025-09-24", "ראש השנה"],
  ["2025-10-01", "2025-10-02", "יום כיפור"],
  ["2025-10-06", "2025-10-08", "סוכות"],
  ["2025-10-13", "2025-10-15", "שמיני עצרת ושמחת תורה"],
  ["2025-12-14", "2025-12-22", "חנוכה"],
  ["2026-03-02", "2026-03-04", "פורים"],
  ["2026-04-01", "2026-04-03", "פסח (חג ראשון)"],
  ["2026-04-07", "2026-04-09", "פסח (חג אחרון)"],
  ["2026-05-21", "2026-05-22", "שבועות"],

  // ─── 5787 (2026-09 → 2027-09) ───
  ["2026-09-11", "2026-09-13", "ראש השנה"],
  ["2026-09-20", "2026-09-21", "יום כיפור"],
  ["2026-09-25", "2026-09-27", "סוכות"],
  ["2026-10-02", "2026-10-04", "שמיני עצרת ושמחת תורה"],
  ["2026-12-04", "2026-12-12", "חנוכה"],
  ["2027-03-22", "2027-03-24", "פורים"],
  ["2027-04-21", "2027-04-23", "פסח (חג ראשון)"],
  ["2027-04-27", "2027-04-29", "פסח (חג אחרון)"],
  ["2027-06-10", "2027-06-11", "שבועות"],

  // ─── 5788 (2027-09 → 2028-09) ───
  ["2027-10-01", "2027-10-03", "ראש השנה"],
  ["2027-10-10", "2027-10-11", "יום כיפור"],
  ["2027-10-15", "2027-10-17", "סוכות"],
  ["2027-10-22", "2027-10-24", "שמיני עצרת ושמחת תורה"],
  ["2027-12-24", "2028-01-01", "חנוכה"],
  ["2028-03-11", "2028-03-13", "פורים"],
  ["2028-04-10", "2028-04-12", "פסח (חג ראשון)"],
  ["2028-04-16", "2028-04-18", "פסח (חג אחרון)"],
  ["2028-05-30", "2028-05-31", "שבועות"],
];

/** Get the calendar-day key (YYYY-MM-DD) of a Date in Israel time. */
function israelDateKey(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

/**
 * Returns the holiday name if `date` falls inside a major Jewish holiday window,
 * otherwise null. Uses Israel-time day keys to avoid timezone off-by-one.
 */
export function isHoliday(date: Date): string | null {
  const key = israelDateKey(date);
  for (const [start, end, name] of HOLIDAY_RANGES) {
    if (key >= start && key <= end) return name;
  }
  return null;
}

// ─────────────────────────────────── Mourning periods ───────────────────────────────────

/**
 * Mourning periods where Jewish weddings are traditionally avoided. We don't
 * use these to BLOCK weddings (the user already picked a date) — we use them
 * to delay reminders for religious users who'd consider it inappropriate to
 * send festive notifications during these times.
 */
const MOURNING_RANGES: ReadonlyArray<readonly [string, string, string]> = [
  // Three Weeks (17 Tammuz → 9 Av) — bein hametzarim. Weddings forbidden.
  ["2025-07-13", "2025-08-03", "שלושת השבועות"],
  ["2026-07-02", "2026-07-23", "שלושת השבועות"],
  ["2027-07-22", "2027-08-12", "שלושת השבועות"],
  ["2028-07-09", "2028-07-30", "שלושת השבועות"],

  // Sefirat Ha'Omer — abridged to the strict period (Pesach end → Lag Ba'Omer).
  // Weddings traditionally suspended. Lag Ba'omer day itself is a happy break.
  ["2026-04-09", "2026-05-04", "ספירת העומר"],
  ["2027-04-29", "2027-05-25", "ספירת העומר"],
  ["2028-04-18", "2028-05-13", "ספירת העומר"],
];

/** Returns the mourning-period name if `date` is inside one, otherwise null. */
export function isMourningPeriod(date: Date): string | null {
  const key = israelDateKey(date);
  for (const [start, end, name] of MOURNING_RANGES) {
    if (key >= start && key <= end) return name;
  }
  return null;
}

// ─────────────────────────────── Send-window logic ───────────────────────────────

/** Reasons we'd block a notification at a given moment. Empty array = OK to send. */
export interface BlockReason {
  type: "shabbat" | "holiday" | "mourning";
  label: string;
}

export function blockedReasons(date: Date, observance: ObservanceLevel): BlockReason[] {
  if (observance === "secular") return [];
  const reasons: BlockReason[] = [];
  if (isShabbat(date)) reasons.push({ type: "shabbat", label: "שבת" });
  if (observance === "religious") {
    const hol = isHoliday(date);
    if (hol) reasons.push({ type: "holiday", label: hol });
    const mourn = isMourningPeriod(date);
    if (mourn) reasons.push({ type: "mourning", label: mourn });
  }
  return reasons;
}

/**
 * Given an ideal send time and the user's observance, return the earliest time
 * after `idealTime` that's allowed. If `idealTime` itself is allowed, return it.
 *
 * We step in 1-hour increments up to 14 days. That's plenty — the Three Weeks
 * is the longest restricted window at 21 days, and reminders pushed past two
 * weeks would arrive too late to be useful anyway.
 */
export function nextValidNotificationTime(
  idealTime: Date,
  observance: ObservanceLevel,
): Date {
  if (observance === "secular") return idealTime;

  const cursor = new Date(idealTime);
  const HOUR = 60 * 60 * 1000;
  const MAX_STEPS = 14 * 24; // up to 14 days
  for (let i = 0; i < MAX_STEPS; i++) {
    if (blockedReasons(cursor, observance).length === 0) return cursor;
    cursor.setTime(cursor.getTime() + HOUR);
  }
  // Couldn't find a slot in 14 days — return idealTime + 14d so the caller
  // gets a deterministic answer instead of a busy-loop.
  return new Date(idealTime.getTime() + 14 * 24 * HOUR);
}

/** Pretty-format a Date for log/debug output (Hebrew weekday + clock). */
export function formatScheduledTime(date: Date): string {
  return date.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
