import type { EventType, ChecklistItem, ChecklistPhase } from "./types";

interface DefaultTask {
  title: string;
  phase: ChecklistPhase;
}

/** Per-event-type default checklist. Items are seeded the first time a user opens the checklist. */
const DEFAULTS: Record<EventType, DefaultTask[]> = {
  wedding: [
    { title: "קביעת התקציב הכולל", phase: "early" },
    { title: "סגירת תאריך האירוע", phase: "early" },
    { title: "סגירת אולם או גן אירועים", phase: "early" },
    { title: "בחירת רב/מסדר חופה", phase: "early" },
    { title: "סגירת צלם וצלם וידאו", phase: "early" },
    { title: "קביעת DJ או להקה", phase: "early" },
    { title: "בחירת שמלת כלה", phase: "mid" },
    { title: "בחירת חליפת חתן", phase: "mid" },
    { title: "סגירת קייטרינג ותפריט", phase: "mid" },
    { title: "סגירת מעצב פרחים", phase: "mid" },
    { title: "הזמנות דיגיטליות", phase: "mid" },
    { title: "פגישת ייעוץ עם הרבנות", phase: "mid" },
    { title: "טבעות נישואים", phase: "mid" },
    { title: "ירח דבש - תכנון והזמנה", phase: "mid" },
    { title: "סידורי הושבה", phase: "late" },
    { title: "תיאום הסעות לאורחים", phase: "late" },
    { title: "תיאום צילום מקדים (Pre-wedding)", phase: "late" },
    { title: "פגישת איפור וניסוי", phase: "late" },
    { title: "שליחת תזכורות RSVP", phase: "late" },
    { title: "הכנת רשימה למוזמנים מבחוץ (חו״ל)", phase: "late" },
    { title: "סגירת לו״ז ביום האירוע עם הספקים", phase: "final" },
    { title: "אישור סופי עם הקייטרינג על מספר מנות", phase: "final" },
    { title: "ארגון מסמכים לרבנות", phase: "final" },
    { title: "הכנת תיק חירום (סיכות, סיכות בטחון, איפור)", phase: "final" },
    { title: "תרגול ריקוד ראשון", phase: "final" },
    { title: "ארוחת בוקר משותפת", phase: "day-of" },
    { title: "טקס איפור והכנה", phase: "day-of" },
    { title: "צילומים לפני החופה", phase: "day-of" },
    { title: "החופה", phase: "day-of" },
    { title: "ליהנות 💛", phase: "day-of" },
  ],

  "bar-mitzvah": [
    { title: "קביעת תאריך האירוע", phase: "early" },
    { title: "תיאום עליה לתורה עם בית הכנסת", phase: "early" },
    { title: "בחירת אולם או מקום לאירוע", phase: "early" },
    { title: "סגירת צלם", phase: "early" },
    { title: "סגירת תקליטן", phase: "early" },
    { title: "בחירת רב/חזן ללימוד הפטרה", phase: "early" },
    { title: "תפילין - רכישה והכנה", phase: "mid" },
    { title: "חליפה לבר המצווה", phase: "mid" },
    { title: "הזמנות דיגיטליות", phase: "mid" },
    { title: "סגירת קייטרינג", phase: "mid" },
    { title: "תיאום סעודה במוצאי שבת", phase: "mid" },
    { title: "מתנות למוזמנים", phase: "late" },
    { title: "תכנון פעילויות לילדים באירוע", phase: "late" },
    { title: "תיאום הסעות לאורחים מחו״ל", phase: "late" },
    { title: "סידורי הושבה", phase: "late" },
    { title: "אישור סופי על מנות עם הקייטרינג", phase: "final" },
    { title: "אימון אחרון על ההפטרה", phase: "final" },
    { title: "סידור עליות לתורה למשפחה", phase: "final" },
    { title: "עליה לתורה 🕯️", phase: "day-of" },
    { title: "החגיגה", phase: "day-of" },
  ],

  "bat-mitzvah": [
    { title: "קביעת תאריך האירוע", phase: "early" },
    { title: "בחירת מקום לאירוע", phase: "early" },
    { title: "סגירת צלם וסטודיו רילז", phase: "early" },
    { title: "סגירת תקליטן או DJ", phase: "early" },
    { title: "בחירת קונספט / נושא לאירוע", phase: "mid" },
    { title: "שמלה לבת המצווה", phase: "mid" },
    { title: "הזמנות דיגיטליות", phase: "mid" },
    { title: "סגירת קייטרינג", phase: "mid" },
    { title: "מעצבת איפור ושיער", phase: "mid" },
    { title: "מתנה משמעותית לבת המצווה", phase: "late" },
    { title: "פעילויות וריקוד עם החברות", phase: "late" },
    { title: "מתנות לחברות", phase: "late" },
    { title: "סידורי הושבה", phase: "late" },
    { title: "סשן צילומים לפני האירוע", phase: "final" },
    { title: "אישור סופי על מנות עם הקייטרינג", phase: "final" },
    { title: "טקס איפור וסטיילינג", phase: "day-of" },
    { title: "החגיגה", phase: "day-of" },
  ],

  "shabbat-chatan": [
    { title: "תיאום בית כנסת ועליה לתורה", phase: "early" },
    { title: "בחירת רב לדרשה", phase: "early" },
    { title: "תיאום מקום לסעודות", phase: "early" },
    { title: "אירוח אורחים מחו״ל - בית מלון", phase: "mid" },
    { title: "תפריט לסעודת ליל שבת", phase: "mid" },
    { title: "תפריט לסעודת שבת בבוקר", phase: "mid" },
    { title: "תפריט לסעודה שלישית", phase: "mid" },
    { title: "קידוש בבית הכנסת", phase: "mid" },
    { title: "הזמנות לאורחים הקרובים", phase: "mid" },
    { title: "פרחים לעיצוב השולחן", phase: "late" },
    { title: "תיאום שירת זמירות", phase: "late" },
    { title: "תיאום ילדים והפעלה", phase: "late" },
    { title: "אישור מספר אורחים", phase: "final" },
    { title: "תיאום עם בעל הבית/הסבים", phase: "final" },
    { title: "עליה לתורה 📖", phase: "day-of" },
    { title: "חוויה משפחתית", phase: "day-of" },
  ],

  brit: [
    { title: "תיאום מוהל מנוסה", phase: "early" },
    { title: "תיאום רב לטקס", phase: "early" },
    { title: "בחירת מקום (בית כנסת או אולם)", phase: "early" },
    { title: "סגירת קייטרינג כשר", phase: "mid" },
    { title: "כריות ברית וכלי טקס", phase: "mid" },
    { title: "הזמנת בגדים לתינוק", phase: "mid" },
    { title: "הזמנות לאורחים", phase: "mid" },
    { title: "פרחים לקישוט", phase: "late" },
    { title: "צלם לאירוע", phase: "late" },
    { title: "תיאום ספרייה לדבר תורה", phase: "late" },
    { title: "אישור עם המוהל יום לפני", phase: "final" },
    { title: "הכנת תיק לתינוק", phase: "final" },
    { title: "טקס הברית", phase: "day-of" },
    { title: "סעודת מצווה", phase: "day-of" },
  ],

  engagement: [
    { title: "קביעת תאריך", phase: "early" },
    { title: "בחירת מקום לאירוע", phase: "early" },
    { title: "צלם", phase: "mid" },
    { title: "פרחים", phase: "mid" },
    { title: "תפריט / קייטרינג", phase: "mid" },
    { title: "שמלה / חליפה", phase: "mid" },
    { title: "הזמנות לאורחים הקרובים", phase: "late" },
    { title: "טבעת אירוסין מוכנה", phase: "late" },
    { title: "תיאום נאומים", phase: "final" },
    { title: "אירוע אירוסים", phase: "day-of" },
  ],

  birthday: [
    { title: "קביעת קונספט/נושא", phase: "early" },
    { title: "בחירת מקום", phase: "early" },
    { title: "תקליטן או מוזיקה", phase: "mid" },
    { title: "צלם / סטודיו רילז", phase: "mid" },
    { title: "עוגה ומאפים", phase: "mid" },
    { title: "פרחים ועיצוב", phase: "mid" },
    { title: "הזמנות לחברים", phase: "mid" },
    { title: "מתנות לאורחים", phase: "late" },
    { title: "תיאום פעילויות", phase: "late" },
    { title: "סידור פינות צילום", phase: "final" },
    { title: "החגיגה 🎂", phase: "day-of" },
  ],

  corporate: [
    { title: "קביעת מטרת האירוע ומסרים", phase: "early" },
    { title: "אישור תקציב מההנהלה", phase: "early" },
    { title: "סגירת מתחם / אולם", phase: "early" },
    { title: "סגירת קייטרינג", phase: "mid" },
    { title: "הזמנת מערכות סאונד ותאורה", phase: "mid" },
    { title: "תיאום סרט תדמית או מצגת", phase: "mid" },
    { title: "צוות צילום ווידאו", phase: "mid" },
    { title: "הזמנות והרשמה לאירוע", phase: "mid" },
    { title: "מתנות / שי לאורחים", phase: "late" },
    { title: "תיאום נאומים", phase: "late" },
    { title: "תיאום סושיאל מדיה - תכנים בשידור חי", phase: "late" },
    { title: "תיאום אבטחה", phase: "final" },
    { title: "הריצה עם הספקים", phase: "final" },
    { title: "קבלת פנים ורישום", phase: "day-of" },
    { title: "האירוע", phase: "day-of" },
  ],

  other: [
    { title: "קביעת תקציב", phase: "early" },
    { title: "בחירת מקום", phase: "early" },
    { title: "סגירת ספקים מרכזיים", phase: "mid" },
    { title: "הזמנות לאורחים", phase: "mid" },
    { title: "סידור עיצובי וטכני", phase: "late" },
    { title: "אישור פרטים אחרון", phase: "final" },
    { title: "האירוע", phase: "day-of" },
  ],
};

/** Build the initial checklist for a given event type with unique IDs. */
export function buildDefaultChecklist(type: EventType, eventDate?: string): ChecklistItem[] {
  // If we got a malformed date, the math below would build "Invalid Date"
  // entries that render as "NaN ימים" in the UI. Skip the seeded checklist
  // entirely — the user can re-create it after fixing the event date.
  if (eventDate) {
    const probe = new Date(eventDate);
    if (Number.isNaN(probe.getTime())) return [];
  }
  return DEFAULTS[type].map((task) => ({
    id: crypto.randomUUID(),
    title: task.title,
    phase: task.phase,
    done: false,
    dueDate: eventDate ? defaultDueDate(eventDate, task.phase) : undefined,
  }));
}

export const PHASE_ORDER: ChecklistPhase[] = ["early", "mid", "late", "final", "day-of"];

/** Window (in days before the event) where each phase's tasks should land. */
export const PHASE_WINDOWS: Record<ChecklistPhase, { startDays: number; endDays: number; midDays: number }> = {
  early:    { startDays: 365, endDays: 180, midDays: 240 }, // 6+ months out
  mid:      { startDays: 180, endDays: 90,  midDays: 120 }, // 3-6 months
  late:     { startDays: 90,  endDays: 30,  midDays: 60  }, // 1-3 months
  final:    { startDays: 30,  endDays: 7,   midDays: 14  }, // last month
  "day-of": { startDays: 1,   endDays: 0,   midDays: 0   }, // event day itself
};

/** Compute a sensible default due date for a task: midpoint of its phase window. */
export function defaultDueDate(eventDate: string, phase: ChecklistPhase): string {
  const w = PHASE_WINDOWS[phase];
  const event = new Date(eventDate);
  const due = new Date(event);
  due.setDate(due.getDate() - w.midDays);
  return due.toISOString().slice(0, 10);
}

/** Window label for a phase relative to an event date — e.g. "12 ינואר - 12 פברואר 2026". */
export function phaseRangeLabel(eventDate: string | undefined, phase: ChecklistPhase): string {
  if (!eventDate) return "";
  const w = PHASE_WINDOWS[phase];
  const event = new Date(eventDate);
  const start = new Date(event);
  start.setDate(start.getDate() - w.startDays);
  const end = new Date(event);
  end.setDate(end.getDate() - w.endDays);
  const sameYear = end.getFullYear() === start.getFullYear();
  // When the two endpoints share a year, show day+month only and append the year once at the end.
  // When they straddle a year boundary, show year on each endpoint to disambiguate.
  const fmtNoYear = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "short" });
  const fmtWithYear = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "short", year: "numeric" });
  if (sameYear) return `${fmtNoYear(start)} - ${fmtNoYear(end)} ${end.getFullYear()}`;
  return `${fmtWithYear(start)} - ${fmtWithYear(end)}`;
}
