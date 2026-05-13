/**
 * R8 — Context-aware assistant helpers.
 *
 * This module is environment-agnostic (no React, no Supabase, no fetch).
 * It defines:
 *   - the data shape sent from the widget to /api/assistant/chat
 *   - the Hebrew system prompt that teaches the LLM what kind of replies
 *     we want and which user-specific facts it should weave in
 *   - the proactive suggested-question chips shown under the input
 *
 * Both client (`components/AssistantWidget`) and server
 * (`app/api/assistant/chat/route.ts`) import from here so the prompt and
 * context shape stay consistent.
 */

import type { AppState, EventInfo, Guest } from "./types";
import { EVENT_TYPE_LABELS } from "./types";

/** Trimmed-down view of the saved-vendor pipeline that the LLM actually needs.
 *  Keeping the surface small on purpose — we don't want to ship the whole
 *  catalog or notes content to OpenAI on every turn. */
export interface AssistantSavedVendorRef {
  vendorId: string;
  status: string;
  agreedPrice?: number;
}

export interface AssistantContext {
  event: EventInfo | null;
  guests: Guest[];
  savedVendors: AssistantSavedVendorRef[];
  /** null when there is no event; otherwise integer days (negative = past). */
  daysToEvent: number | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResponse {
  reply: string;
  /** Remaining daily quota for this user. -1 when quota tracking is off
   *  (anonymous local-mode session). */
  remainingQuota: number;
  /** Optional follow-up chips the widget can render under the reply. */
  suggestedQuestions?: string[];
  /** Soft error — present when the route returned a fallback / partial reply
   *  but didn't fail outright (e.g. quota exhausted). */
  error?: string;
}

// R12 — aligned with the public /pricing page promise. Free users get 5 turns
// per calendar day; premium gets 100. Both numbers must match the pricing
// table copy (app/pricing/page.tsx) exactly so the user gets what we sell.
export const FREE_DAILY_QUOTA = 5;
export const PREMIUM_DAILY_QUOTA = 100;

// ─── Context builder ──────────────────────────────────────────────────────

/**
 * Project the full AppState down to just what the LLM needs. Called by the
 * widget right before each /api/assistant/chat POST. Keeping this in
 * `lib/assistant` (vs in the widget) makes it trivial to test and means the
 * server-side route uses the same projection if it ever needs to verify
 * what the client sent.
 */
/**
 * Days from "today, local midnight" to "event date, local midnight".
 *
 * R14 BUG#5: the previous implementation used raw `getTime()` deltas, which
 * include the local time-of-day. A user who hits the page at 11pm with an
 * event tomorrow would see "0 days" because the millisecond delta was less
 * than 24h. Anchoring both ends at midnight makes the count strictly
 * day-based — same behavior the rest of the app gets via `daysUntil` in
 * lib/useNow.ts.
 */
function calcDaysToEvent(eventDateISO: string): number | null {
  const eventDate = new Date(eventDateISO);
  if (Number.isNaN(eventDate.getTime())) return null;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  return Math.round(
    (eventDate.getTime() - todayMidnight.getTime()) / 86_400_000,
  );
}

export function buildAssistantContext(state: AppState): AssistantContext {
  const days = state.event?.date ? calcDaysToEvent(state.event.date) : null;

  return {
    event: state.event,
    guests: state.guests,
    savedVendors: state.savedVendors.map((v) => ({
      vendorId: v.vendorId,
      status: v.status,
      agreedPrice: v.agreedPrice,
    })),
    daysToEvent: days,
  };
}

// ─── System prompt ────────────────────────────────────────────────────────

/**
 * Build a rich Hebrew system prompt with the user's event context inlined.
 * The prompt sets register (warm friend, not a brochure), constraints (Hebrew,
 * 2-4 sentences, no made-up vendor names or exact prices), and steers the
 * model toward our in-app actions when relevant.
 *
 * Concrete numbers (guest counts, vendor stages, days remaining) come from
 * the live AppState via `buildAssistantContext`, so the model has facts to
 * reference instead of inventing them.
 */
export function buildSystemPrompt(ctx: AssistantContext): string {
  const eventLine = ctx.event
    ? `המארח/ת מתכנן/ת ${EVENT_TYPE_LABELS[ctx.event.type] || "אירוע"} ${
        ctx.event.partnerName
          ? `של ${ctx.event.hostName} ו-${ctx.event.partnerName}`
          : `של ${ctx.event.hostName}`
      }, בתאריך ${ctx.event.date || "לא הוגדר"}${
        ctx.event.city ? `, ב${ctx.event.city}` : ""
      }.`
    : "המשתמש עדיין לא הגדיר אירוע.";

  const daysLine =
    ctx.daysToEvent !== null
      ? ctx.daysToEvent > 0
        ? `נשארו ${ctx.daysToEvent} ימים לאירוע.`
        : ctx.daysToEvent === 0
          ? "האירוע היום!"
          : `האירוע היה לפני ${Math.abs(ctx.daysToEvent)} ימים.`
      : "";

  const confirmedHeads = ctx.guests
    .filter((g) => g.status === "confirmed")
    .reduce((s, g) => s + (g.attendingCount || 1), 0);
  const confirmedFamilies = ctx.guests.filter((g) => g.status === "confirmed").length;
  const declined = ctx.guests.filter((g) => g.status === "declined").length;
  const pending = ctx.guests.filter(
    (g) => g.status === "pending" || g.status === "invited",
  ).length;
  const guestsLine =
    ctx.guests.length > 0
      ? `יש ${ctx.guests.length} אורחים ברשימה: ${confirmedHeads} מאשרים (${confirmedFamilies} משפחות), ${declined} סירבו, ${pending} ממתינים.`
      : "עדיין אין אורחים ברשימה.";

  const closed = ctx.savedVendors.filter(
    (v) => v.status === "signed" || v.status === "paid",
  ).length;
  const meeting = ctx.savedVendors.filter((v) => v.status === "meeting").length;
  const evaluating = ctx.savedVendors.filter(
    (v) => v.status === "lead" || v.status === "contacted",
  ).length;
  const vendorsLine =
    ctx.savedVendors.length > 0
      ? `שמר ${ctx.savedVendors.length} ספקים: ${closed} סגורים, ${meeting} עם פגישה קבועה, ${evaluating} בבחינה.`
      : "עדיין לא שמר ספקים.";

  return `אתה Momentum AI — עוזר מומחה לתכנון אירועים בישראל. אתה מתמחה בחתונות, חינות, בר/בת מצווה, וחגיגות משפחתיות.

# הקונטקסט הנוכחי של המשתמש
${eventLine}
${daysLine}
${guestsLine}
${vendorsLine}

# איך לענות
- **תמיד בעברית**, גם אם השאלה באנגלית
- **תשובות קצרות וחדות** — 2-4 משפטים. הימנע מרשימות ארוכות אלא אם המשתמש מבקש במפורש.
- **חם ואישי** — דבר כמו חבר שמבין בנושא, לא כמו חוברת הדרכה
- **מבוסס על הקונטקסט** — תייחס לפרטי האירוע שלהם (תאריך, אורחים, ספקים) במקום להחזיר תשובות גנריות
- **כן ומדויק** — אם אינך בטוח, אמור "אני לא בטוח, כדאי לבדוק עם...". אסור להמציא מספרים, חוקים, או פרטים שאינך יודע.
- **מודע לזמן** — אם נשאר זמן קצר לאירוע (פחות מ-30 ימים), המלץ פעולות דחופות. אם הרבה זמן, יותר רגוע.
- **מודע לתרבות הישראלית** — חתונות בארץ, מנהגים, ספקים, מקובלות (חינה, אירוסין, וכו')

# מה אתה לא עושה
- לא ממציא ספקים ספציפיים בשם (לא יודע מי בקטלוג)
- לא נותן מחירים מדויקים — רק טווחים סבירים ("בין 5,000 ל-15,000 ש"ח")
- לא נותן עצה משפטית / רפואית / פיננסית מורכבת
- לא ממליץ על אנשים ספציפיים (חברים של המשתמש)

# פעולות מומלצות שאתה יכול להציע
- "כדאי לשלוח תזכורת לאורחים שעדיין לא הגיבו" → המשתמש יכול לעשות את זה ב-/guests
- "בוא נסדר את ההושבה" → המשתמש יכול ב-/seating
- "אתם צריכים DJ?" → /vendors
- "כדאי לחשב כמה אלכוהול" → /alcohol
- "ניהול ספקים: מחירים, פגישות, סטטוס" → /vendors/my

תהיה חינני, מקצועי, ואותנטי. ענה תשובות שיגרמו למשתמש להרגיש שיש לו עוזר אישי שבאמת מבין את האירוע שלו.`;
}

// ─── Suggested questions ──────────────────────────────────────────────────

/**
 * Generate up to 3 follow-up question chips based on the user's state.
 * Pure function so the widget can recompute on every render without paying
 * for a network round-trip.
 */
export function buildSuggestedQuestions(ctx: AssistantContext): string[] {
  if (!ctx.event) {
    return ["איך מתחילים?", "מה המסלולים?", "אני ספק — איך מצטרפים?"];
  }

  const suggestions: string[] = [];

  if (ctx.guests.length === 0) {
    suggestions.push("איך מוסיפים אורחים?");
  } else {
    const pending = ctx.guests.filter(
      (g) => g.status === "pending" || g.status === "invited",
    ).length;
    if (pending > 0) {
      suggestions.push(`איך לעקוב אחרי ${pending} אורחים שלא הגיבו?`);
    }
  }

  if (ctx.daysToEvent !== null && ctx.daysToEvent > 0 && ctx.daysToEvent < 30) {
    suggestions.push(`מה עליי לעשות ב-${ctx.daysToEvent} הימים האחרונים?`);
  }

  const closed = ctx.savedVendors.filter(
    (v) => v.status === "signed" || v.status === "paid",
  ).length;
  if (closed < 3) {
    suggestions.push("אילו ספקים אני עוד צריך?");
  }

  if (ctx.guests.filter((g) => g.status === "confirmed").length > 0) {
    suggestions.push("כמה אלכוהול להזמין?");
  }

  return suggestions.slice(0, 3);
}
