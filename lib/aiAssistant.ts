import type { AppState } from "./types";
import { EVENT_TYPE_LABELS } from "./types";
import { EVENT_CONFIG } from "./eventConfig";
import { calcEnvelope } from "./envelope";
import { VENDORS } from "./vendors";

/**
 * Context-aware response engine for the in-app assistant.
 * Reads the user's actual state and crafts a helpful, personalized reply.
 *
 * This is a rule-based responder — not a real LLM call. It feels intelligent
 * because it reasons over the user's data. For real LLM integration, swap
 * generateAssistantReply() for an API call to Claude/OpenAI with the same
 * `state` injected as system context.
 */
export function generateAssistantReply(message: string, state: AppState): string {
  const text = message.toLowerCase().trim();
  const event = state.event;
  const eventLabel = event ? EVENT_TYPE_LABELS[event.type] : "האירוע";

  if (!event) {
    return "כדאי שנתחיל מההתחלה — בוא ניצור לך אירוע. הקלק על 'צור אירוע' למעלה ונבנה את המסלול שלך.";
  }

  // Greetings
  if (/^(שלום|היי|הי|בוקר|ערב)/.test(text)) {
    const name = event.hostName.split(" ")[0];
    return `שלום ${name}! מה אני יכול לעזור עם ה${eventLabel} שלך?`;
  }

  // Budget questions. The regex anchor + length cap on `כמה ___ עולה`
  // prevents matches like "כמה ספקים יש לי בעולם" — the previous greedy
  // `כמה.*עולה` matched any sentence containing both words and routed it
  // through the budget responder.
  if (/תקציב|^\s*כמה\s+\S{1,20}\s+עולה|חורג|תכנון.*כספי/.test(text)) {
    const totalCost = state.budget.reduce((s, b) => s + (b.actual ?? b.estimated), 0);
    const remaining = event.budgetTotal - totalCost;
    // Guard against undefined/zero/NaN inputs propagating into the user-
    // facing text. If we can't compute a meaningful "remaining", say so
    // honestly rather than rendering "חרגת ב-NaN ש"ח".
    if (!Number.isFinite(remaining) || !Number.isFinite(totalCost) || event.budgetTotal <= 0) {
      return "עוד לא הגדרת תקציב כולל לאירוע. בעמוד 'תקציב' אפשר לקבוע סכום יעד, ואחר כך אעזור לעקוב אחר ההוצאות.";
    }
    const pct = event.budgetTotal > 0 ? Math.round((totalCost / event.budgetTotal) * 100) : 0;
    if (totalCost === 0) {
      return `התקציב הכולל שלך הוא ₪${event.budgetTotal.toLocaleString("he-IL")}. עוד לא הוספת הוצאות — בעמוד התקציב אפשר להתחיל למלא, או לחזור לעמוד הספקים ולסמן ספק (זה ייכנס אוטומטית לתקציב).`;
    }
    if (remaining < 0) {
      return `אתה חורג מהתקציב ב-₪${Math.abs(remaining).toLocaleString("he-IL")}. ההמלצות שלי: (1) חזור לעמוד הספקים ובדוק אם יש חלופות זולות יותר באזור שלך, (2) שקול להעלות את התקציב ב-₪${Math.ceil(Math.abs(remaining) / 5000) * 5000}, (3) קצץ ב-15% מקטגוריית הקייטרינג — זה הקטגוריה הגמישה ביותר.`;
    }
    return `הוצאת עד עכשיו ₪${totalCost.toLocaleString("he-IL")} — ${pct}% מהתקציב. נשאר לך ₪${remaining.toLocaleString("he-IL")}. אם אתה רוצה, אעזור לך לחלק את היתרה לקטגוריות שעוד לא סגרת.`;
  }

  // Envelope / gift questions
  if (/מעטפ|מתנ|כמה.*אורח|לרשום.*שיק/.test(text)) {
    const totalCost = state.budget.reduce((s, b) => s + (b.actual ?? b.estimated), 0) || event.budgetTotal;
    const env = calcEnvelope(event.type, totalCost, event.guestEstimate);
    return `לפי החישוב, זוג צריך להביא בממוצע ₪${env.suggestedPerGuest.toLocaleString("he-IL")} כדי לכסות את עלות האירוע. הממוצע הארצי ב${eventLabel} הוא ₪${env.typical.toLocaleString("he-IL")}. בעמוד התקציב יש 3 תרחישים — ממוצע ארצי, כיסוי מלא, וכיסוי + ירח דבש — ועוד מחשבון מדויק לפי סוג מערכת יחסים.`;
  }

  // Vendor / supplier questions
  if (/ספק|צלם|אולם|קייטרינג|תקליטן|dj|פרחים|איפור|שמלה|רב|מוהל/.test(text)) {
    // R15 §1B — defensive lookup; see lib/eventConfig.ts getEventConfig.
    const recommended = (EVENT_CONFIG[event.type] ?? EVENT_CONFIG.wedding).recommendedVendors.slice(0, 5);
    const inRegion = VENDORS.filter((v) => v.region === event.region).length;
    const saved = state.selectedVendors.length;
    if (saved === 0) {
      return `יש לך גישה ל-${inRegion} ספקים בקטלוג ב${event.city || event.region}. הקטגוריות הכי חשובות ל${eventLabel} שלך הן: ${recommended.map((r) => `\`${r}\``).join(", ")}. הקלק על 'ספקים' למעלה כדי להתחיל.`;
    }
    return `בחרת ${saved} ספקים — מצוין. ההמלצה שלי: סגור קודם אולם וצלם, אלו השניים שמתמלאים הכי מהר. אחר כך DJ או להקה. בעמוד הספקים יש סינון לפי מחיר ומיקום.`;
  }

  // Guests / RSVP
  if (/מוזמנ|אורח|rsvp|אישור.*הגע/.test(text)) {
    const total = state.guests.length;
    const confirmed = state.guests.filter((g) => g.status === "confirmed").length;
    const pending = state.guests.filter((g) => g.status === "pending").length;
    const target = event.guestEstimate;
    if (total === 0) {
      return `עוד לא הוספת מוזמנים. הצפי שלך הוא ${target} אורחים. הקלק על 'מוזמנים' כדי להוסיף — אפשר לשלוח הזמנות ישירות בוואטסאפ.`;
    }
    return `יש לך ${total} מוזמנים, ${confirmed} אישרו ו-${pending} עדיין לא ענו. אם נשארו לך פחות מ-3 שבועות — שווה לשלוח תזכורת ידנית למי שלא ענה. אני יכול לעזור לנסח הודעה?`;
  }

  // Seating / arrangement
  if (/הושב|שולחן|ישיב|סידור.*הושבה/.test(text)) {
    const tables = state.tables.length;
    const assigned = Object.keys(state.seatAssignments).length;
    if (tables === 0) {
      return `עוד לא הקמת שולחנות. בעמוד 'סידורי הושבה' אפשר להוסיף שולחנות (10-12 מקומות הוא ממוצע) ואז לסדר את האורחים. יש גם כפתור 'סדר אוטומטי' שעושה הכל בלחיצה.`;
    }
    return `יש לך ${tables} שולחנות ו-${assigned} אורחים סודרו. טיפ: שמור על משפחות יחד ועל קרובי גיל באותו שולחן. אם תזדקק לעזרה — לחץ 'סדר אוטומטי' בעמוד הסידורי הושבה.`;
  }

  // Checklist
  if (/צ.קליסט|משימ|מה.*נשאר.*לעשות|שלב.*הבא/.test(text)) {
    const total = state.checklist.length;
    const done = state.checklist.filter((c) => c.done).length;
    const nextTodo = state.checklist.find((c) => !c.done);
    if (nextTodo) {
      return `סיימת ${done} מתוך ${total} משימות. המשימה הבאה שלך: \"${nextTodo.title}\". הקלק על 'צ׳קליסט' כדי לראות את כל המשימות מסודרות לפי שלב.`;
    }
    return `כל ${total} המשימות שלך הושלמו! 🎉 אתה מוכן ליום הגדול.`;
  }

  // Date / countdown
  if (/תאריך|מתי|כמה.*ימים|עוד.*זמן/.test(text)) {
    const days = Math.max(0, Math.ceil((new Date(event.date).getTime() - Date.now()) / 86400000));
    return `נותרו ${days} ימים ל${eventLabel} שלך (${new Date(event.date).toLocaleDateString("he-IL")}). זה הזמן הנכון להתמקד ב${days > 90 ? "סגירת ספקים מרכזיים" : days > 30 ? "אישורי הגעה ופרטים סופיים" : "סידורי הושבה ולוגיסטיקה של היום"}.`;
  }

  // Help / start
  if (/עזר|מה אתה|מה אתה יכול|מה זה/.test(text)) {
    return `אני העוזר האישי שלך. אני מכיר את כל הפרטים של ה${eventLabel} שלך ויכול לעזור עם:\n• תקציב ועלויות\n• בחירת ספקים\n• סידורי הושבה\n• ניהול מוזמנים\n• המלצות לפי שלב במסע\n\nפשוט תשאל אותי כל דבר.`;
  }

  // Default — encouraging plus contextual nudge
  const nextStep = (() => {
    if (state.selectedVendors.length === 0) return "להתחיל לבחור ספקים";
    if (state.guests.length === 0) return "להוסיף את המוזמנים הראשונים";
    if (state.budget.length < 3) return "למלא קצת יותר את התקציב";
    if (state.checklist.filter((c) => c.done).length < 5) return "להתקדם בצ׳קליסט";
    return "להתחיל בסידורי הושבה";
  })();
  return `שאלה מעניינת! בוא ננסה ביחד. בינתיים, השלב הבא שאני ממליץ לך עליו הוא ${nextStep}. תוכל לשאול אותי על תקציב, ספקים, מוזמנים או סידורי הושבה.`;
}
