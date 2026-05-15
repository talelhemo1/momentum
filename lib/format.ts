/**
 * R18 §N — single source of truth for event-date formatting.
 *
 * Two canonical styles so the app stops hand-rolling
 * `toLocaleDateString("he-IL", {...})` with slightly different option
 * objects in every file:
 *
 *   formatEventDate(date, "long")  → "15 במאי 2026"
 *   formatEventDate(date, "short") → "15/5/26"
 *
 * `date` accepts an ISO string ("YYYY-MM-DD"), any Date-parseable
 * string, or a Date. Invalid / empty input returns "" (callers render
 * nothing rather than the literal "Invalid Date").
 */
export type EventDateStyle = "long" | "short";

export function formatEventDate(
  date: string | Date | null | undefined,
  style: EventDateStyle = "long",
): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  if (style === "short") {
    // Built manually so it's stable regardless of the runtime's he-IL
    // numeric-date separator (some emit "15.5.26", we want "15/5/26").
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const yy = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${yy}`;
  }

  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
