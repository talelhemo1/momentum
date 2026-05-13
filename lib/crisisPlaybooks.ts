/**
 * Momentum Live — Phase 5 Crisis Mode (R20).
 *
 * Pure data + getter. Each "playbook" is a self-contained recipe for a single
 * wedding-day emergency: ordered steps the manager can tick off, a small set
 * of phone numbers to call, a backup-vendor category for one-tap "find a
 * replacement", and a WhatsApp template the manager can copy/paste to send
 * to guests.
 *
 * No React, no Supabase, no DOM. UI lives in app/manage/[eventId]/crisis/*.
 */
import type { VendorType } from "./types";

export type CrisisType =
  | "vendor-noshow"
  | "food-shortage"
  | "medical"
  | "power-outage"
  | "guest-issue"
  | "weather"
  | "vendor-late";

export type CrisisSeverity = "critical" | "high" | "medium";

export interface CrisisStep {
  id: string;
  text: string;
  /** Optional hint surfaced under the step (e.g. "תוך 30 שניות"). */
  hint?: string;
}

export interface EmergencyContact {
  label: string;
  /** International phone number, digits only with country code (used in tel:). */
  number: string;
  /** Optional sub-label, e.g. "מוקד חירום". */
  note?: string;
}

export interface CrisisPlaybook {
  id: CrisisType;
  emoji: string;
  title: string;
  /** One-line hook surfaced on the index page. */
  tagline: string;
  severity: CrisisSeverity;
  /** Ordered checklist — the manager ticks each as they handle it. */
  steps: CrisisStep[];
  /** Tel: phone numbers — Israeli emergency services + venue contacts. */
  contacts: EmergencyContact[];
  /** If non-empty, the detail page renders a "find a backup" tile per
   *  category. Each tile routes to /vendors?type=<category>&urgent=1 for a
   *  one-tap replacement search. Multi-value because a no-show DJ might
   *  open the door to a DJ *or* a band as the fastest swap. */
  backupVendorTypes?: VendorType[];
  /** Pre-written WhatsApp body the manager can copy to update guests.
   *  Use {hostName} / {venue} placeholders that the detail page fills in. */
  guestNotificationTemplate?: string;
}

export const CRISIS_PLAYBOOKS: CrisisPlaybook[] = [
  {
    id: "vendor-noshow",
    emoji: "🚫",
    title: "ספק לא הגיע",
    tagline: "DJ / צלם / קייטרינג לא הופיעו — מצאו תחליף עכשיו",
    severity: "critical",
    backupVendorTypes: ["dj", "band", "photography"],
    steps: [
      { id: "s1", text: "התקשרו לספק וודאו שהוא לא בדרך", hint: "תוך 30 שניות" },
      { id: "s2", text: "בדקו את החוזה — האם יש סעיף 'no-show'?" },
      { id: "s3", text: "פתחו את הקטלוג ומצאו ספק חלופי באזור" },
      { id: "s4", text: "התקשרו ל-3 ספקים במקביל — מי שעונה ראשון, תופס" },
      { id: "s5", text: "תעדו כל מה שקרה — תאריך, שעה, מספרי טלפון. ל-small claims מחר" },
    ],
    contacts: [],
    guestNotificationTemplate:
      "אורחים יקרים, עקב תקלה בספק אנחנו דוחים את [הצילום/המוזיקה] בכמה דקות. תודה על הסבלנות 💛 — {hostName}",
  },
  {
    id: "food-shortage",
    emoji: "🍽️",
    title: "אזל אוכל / משקה",
    tagline: "יותר אורחים מצפי? מזמינים תוספת עכשיו",
    severity: "high",
    backupVendorTypes: ["catering", "sweets", "alcohol"],
    steps: [
      { id: "s1", text: "התקשרו לקייטרינג — בקשו 'משלוח דחוף' של מנות נוספות" },
      { id: "s2", text: "במקביל — פתחו Wolt / 10bis בכמות גדולה לגיבוי" },
      { id: "s3", text: "הודיעו ל-MC לעכב את השלב הבא ב-15 דק׳" },
      { id: "s4", text: "פתחו את בר המתוקים ואת הקפה — לפזר את הקהל" },
      { id: "s5", text: "שלחו הודעה לאורחים שמתרחקים — האוכל בדרך" },
    ],
    contacts: [
      { label: "Wolt — מוקד תמיכה", number: "03-3030460" },
      { label: "10bis עסקים", number: "*9404" },
    ],
    guestNotificationTemplate:
      "האוכל הנוסף בדרך — עוד 15 דק׳ ומתחילים את המנה הבאה. תהנו מהבר! — {hostName}",
  },
  {
    id: "medical",
    emoji: "🚑",
    title: "מקרה רפואי",
    tagline: "אורח / ה זקוק לעזרה רפואית",
    severity: "critical",
    steps: [
      { id: "s1", text: "התקשרו ל-101 עכשיו — תארו במדויק את המצב", hint: "מד״א — קודם כל" },
      { id: "s2", text: "הוציאו את האורח/ת לחלל שקט ומאוורר" },
      { id: "s3", text: "מצאו רופא/אחות באולם — קוראים בשם דרך ה-MC" },
      { id: "s4", text: "הודיעו לבן/בת המשפחה הקרובים, לא לכל הקהל" },
      { id: "s5", text: "הכינו את הכניסה למקום שהאמבולנס יכול להגיע בקלות" },
      { id: "s6", text: "אל תעצרו את האירוע — חוץ מבאמת ובאמת חמור" },
    ],
    contacts: [
      { label: "מד״א — מוקד 101", number: "101", note: "קוראים מיד" },
      { label: "משטרה — 100", number: "100" },
      { label: "מכבי אש — 102", number: "102" },
    ],
  },
  {
    id: "power-outage",
    emoji: "⚡",
    title: "הפסקת חשמל",
    tagline: "אורות / סאונד / קייטרינג נפלו? יש לכם 10 דקות",
    severity: "high",
    steps: [
      { id: "s1", text: "התקשרו למנהל האולם — לבדוק אם זה האולם או כל האזור" },
      { id: "s2", text: "הפעילו את הטלפונים — אורח הופך לזרקור" },
      { id: "s3", text: "הודיעו ל-DJ — האם יש לו לוח-סוללה גיבוי?" },
      { id: "s4", text: "אם החזרה לוקחת >15 דק׳ — קראו לאורחים החוצה לגינה / רחבה" },
      { id: "s5", text: "המנעו ממעלית — אם יש אורחים בה, התקשרו מיד למוקד" },
    ],
    contacts: [
      { label: "חברת חשמל — מוקד תקלות", number: "103" },
      { label: "מכבי אש — 102", number: "102" },
    ],
    guestNotificationTemplate:
      "תקלת חשמל זמנית באולם, מטפלים. ממשיכים תוך מספר דקות — אל דאגה! — {hostName}",
  },
  {
    id: "guest-issue",
    emoji: "😡",
    title: "אורח שיכור / מסוכסך",
    tagline: "מישהו עושה בעיות — מטפלים בשקט, בלי להעלות הילוך",
    severity: "medium",
    steps: [
      { id: "s1", text: "אל תתעמתו לבד — קחו עוד מנהל לידכם" },
      { id: "s2", text: "הוציאו את האורח/ים לחדר שקט, רחוק מהריקודים" },
      { id: "s3", text: "תנו מים, קפה, פרוסת לחם — לפעמים זה הכל מה שצריך" },
      { id: "s4", text: "צרו קשר עם בן/בת זוג שלו/ה — מי שיכול לקחת אותו/ה הביתה" },
      { id: "s5", text: "אם יש איום פיזי — מתקשרים ל-100, לא להיסס" },
    ],
    contacts: [
      { label: "משטרה — 100", number: "100" },
    ],
  },
  {
    id: "weather",
    emoji: "🌧️",
    title: "גשם / חום קיצוני",
    tagline: "אירוע גן ב-mid-event? יש לכם תכנית B",
    severity: "high",
    steps: [
      { id: "s1", text: "התקשרו למנהל המקום — מי מעביר ציוד פנימה, מי דואג לכיסאות?" },
      { id: "s2", text: "הודיעו ל-DJ ולצלם — מעבירים את הציוד מתחת לקירוי" },
      { id: "s3", text: "אם זה חום קיצוני — פתחו תחנות מים בכל פינה" },
      { id: "s4", text: "שלחו הודעה לאורחים: לא לעזוב — האירוע ממשיך פנימה" },
      { id: "s5", text: "אורחים זקנים — חפשו אותם פעיל, ודאו שיש להם מקום מוצל" },
    ],
    contacts: [
      { label: "מד״א — 101", number: "101", note: "מכת חום היא חירום" },
    ],
    guestNotificationTemplate:
      "מעבירים את החגיגה פנימה בגלל מזג האוויר — לא עוזבים, ממשיכים יחד! 🎉 — {hostName}",
  },
  {
    id: "vendor-late",
    emoji: "⏰",
    title: "ספק מאחר",
    tagline: "צלם / DJ / רב מאחר ב-30+ דק׳ — מה עושים?",
    severity: "medium",
    backupVendorTypes: ["dj", "photography", "videography"],
    steps: [
      { id: "s1", text: "התקשרו לספק — קבלו ETA אמיתי, לא 'עוד דקה'" },
      { id: "s2", text: "אם ה-ETA > 45 דק׳, התחילו לחפש גיבוי במקביל" },
      { id: "s3", text: "ספק שמאחר — בקשו הנחה כשמתחשבנים אחר כך, תעדו בכתב" },
      { id: "s4", text: "סדרו מחדש את לוח הזמנים — מה אפשר לדחות, מה אפשר להקדים?" },
      { id: "s5", text: "MC — שמרו על האנרגיה, אל תיתנו לקהל להרגיש את החור" },
    ],
    contacts: [],
    guestNotificationTemplate:
      "אנחנו בעיכוב קטן — עוד מעט ממשיכים את הטקס. תהנו בינתיים מהקבלת פנים 💛 — {hostName}",
  },
];

export function getCrisisPlaybook(id: string): CrisisPlaybook | undefined {
  return CRISIS_PLAYBOOKS.find((p) => p.id === id);
}
