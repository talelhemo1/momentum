import type { VendorType } from "./types";

/**
 * Practical tips users should consider when evaluating a vendor of a given
 * category. Surfaced inside the VendorQuickLook modal so the user has
 * concrete questions to ask before committing.
 *
 * The keys are the project's real `VendorType` enum (lib/types.ts) — not
 * an invented "category" enum — so we don't drift from the catalog shape.
 * Categories that share advice (e.g. dj + band, makeup, dress) point at
 * the same tip set via the resolver below; rare types (kids, security,
 * lighting, etc.) fall back to a sensible "generic vendor" set.
 */

export interface VendorTip {
  icon: string;
  text: string;
}

// ─── Tip libraries ────────────────────────────────────────────────────────
// Defined as named consts so multiple VendorType keys can share a set without
// duplicating the array (e.g. dj + band both reuse MUSIC_TIPS).

const VENUE_TIPS: VendorTip[] = [
  { icon: "📅", text: "בקשו לקבוע ביקור בערב של אירוע אחר — תראו את האולם בפעולה" },
  { icon: "📋", text: "ודאו מה כלול במחיר: שולחנות, חנייה, אבטחה, טכנאי" },
  { icon: "💰", text: "מקדמה רגילה: 30%. הימנעו מתשלום מלא לפני האירוע" },
  { icon: "🎵", text: "שאלו על הגבלות רעש ושעת סיום — חשוב במקומות עם שכנים" },
];

const CATERING_TIPS: VendorTip[] = [
  { icon: "🍽️", text: "תמיד דרשו טעימה לפני חתימה — לא משלמים על מה שלא טעמתם" },
  { icon: "🥗", text: "ודאו זמינות תפריטים מיוחדים: צמחוני, ללא גלוטן, כשרות" },
  { icon: "🍷", text: "שאלו אם הם מספקים בר ואלכוהול או רק אוכל" },
  { icon: "👨‍🍳", text: "כמות מלצרים מומלצת: 1 לכל 25 אורחים" },
];

const PHOTOGRAPHY_TIPS: VendorTip[] = [
  { icon: "📸", text: "בקשו לראות תיק עבודות מ-3 חתונות שלמות (לא רק highlights)" },
  { icon: "⏰", text: "ודאו שעות שטח: רגיל 8-10 שעות, מתחילים בהכנות הכלה" },
  { icon: "💾", text: "שאלו כמה זמן עד שמקבלים את התמונות הסופיות (סטנדרט: 4-8 שבועות)" },
  { icon: "🎁", text: "מה כלול: גלם, עריכה, אלבום, USB, גלריה אונליין?" },
];

const VIDEOGRAPHY_TIPS: VendorTip[] = [
  { icon: "🎥", text: "בקשו לראות סרט שלם של חתונה (לא רק טריילר 2 דקות)" },
  { icon: "🎤", text: "ודאו הקלטת אודיו איכותית — מיקרופון על החתן + מיקרופון לרב" },
  { icon: "✂️", text: "תיאמו אורך הסרט הסופי: 5 דק׳ / 15 דק׳ / מלא?" },
  { icon: "🚁", text: "רחפן? בדקו אם יש להם רישיון ואיפה מותר לטוס" },
];

const MUSIC_TIPS: VendorTip[] = [
  { icon: "🎵", text: "תנו playlist של שירים שאתם רוצים — וגם של מה לא לנגן" },
  { icon: "🎙️", text: "ודאו שיש מערכת backup במקרה של תקלה טכנית" },
  { icon: "💃", text: "קוראים את הקהל היטב? שאלו איך הם מתאימים לאנרגיה משתנה" },
  { icon: "📢", text: "האם כלול MC להכרזות? אם לא — צריך נפרד" },
];

const RABBI_TIPS: VendorTip[] = [
  { icon: "🤝", text: "פגישת היכרות חובה — שירגיש לכם שהוא מתאים לזוג ולסגנון" },
  { icon: "📖", text: "ודאו שהוא מוכר ע״י הרבנות אם רוצים רישום נישואין" },
  { icon: "⏱️", text: "טקס קצר ועניני (15-25 דקות) או ארוך ומפורט?" },
  { icon: "💬", text: "שאלו אם הוא משלב סיפורים אישיים — תוסיפו לו זמן להכיר אתכם" },
];

const MAKEUP_TIPS: VendorTip[] = [
  { icon: "💄", text: "טריאל חובה לפני האירוע — לא הופתעות ביום" },
  { icon: "⏰", text: "מתחילים בדרך כלל 4-5 שעות לפני התמונות הראשונות" },
  { icon: "👯", text: "שאלו אם הם עושים גם לאמא / חברות (במחיר נוסף)" },
  { icon: "🎁", text: "ערכת touch-up לכלה לקראת הריקודים — חיוני" },
];

const DRESS_TIPS: VendorTip[] = [
  { icon: "👗", text: "התחילו 6-9 חודשים לפני — תיקונים יקחו זמן" },
  { icon: "💃", text: "הביאו תחתונים וחזייה שתהיה לכם בערב — משפיע על המידה" },
  { icon: "📸", text: "בקשו לראות איך השמלה נראית בתמונה (לא רק במראה)" },
  { icon: "💰", text: "ודאו מה כלול: תיקונים, גיהוץ, צילום מקצועי?" },
];

const FLORIST_TIPS: VendorTip[] = [
  { icon: "🌸", text: "תיאמו עם המקום: יש להם מגבלות עיצוב? פרחים מוגנים?" },
  { icon: "💐", text: "בקשו mood board עם דוגמאות לפני שאתם מאשרים" },
  { icon: "🚚", text: "הספקה מתי? אריזה ופירוק כלולים?" },
  { icon: "♻️", text: "מה קורה לפרחים אחרי האירוע? תרמו לבית חולים?" },
];

const STATIONERY_TIPS: VendorTip[] = [
  { icon: "✉️", text: "תכנון: הזמנות נשלחות 4-6 שבועות לפני האירוע" },
  { icon: "🎨", text: "בקשו proof לפני הדפסה — כל אות חייבת להיבדק" },
  { icon: "💌", text: "RSVP: דיגיטלי (חינם דרך Momentum) או נייר (עוד מעטפה + בול)?" },
];

const PRINTING_TIPS: VendorTip[] = [
  { icon: "🎨", text: "בקשו דוגמת הדפסה (proof) לפני אישור — אסור על אישור עיוור" },
  { icon: "📐", text: "ודאו שהקובץ שלכם בפורמט נכון: PDF / TIFF, 300dpi, CMYK" },
  { icon: "📦", text: "כמות הזמנות: תמיד הזמינו 10-15% יותר ממה שצריך — מקרים של אורחים שהגיעו ברגע אחרון" },
  { icon: "⏰", text: "לוח זמנים: דפוס איכותי לוקח 5-7 ימי עסקים. אל תחכו לרגע האחרון" },
  { icon: "✉️", text: "לבקש מעטפות ובול בנפרד? בדקו אם זה כלול במחיר" },
];

const DESIGNER_TIPS: VendorTip[] = [
  { icon: "🌿", text: "סגנון חופה: פרחים, פרוכת, מבנה? תיאמו עם הצלם" },
  { icon: "🪑", text: "כיסאות לזוג ולעדים — כלול או נפרד?" },
  { icon: "🎼", text: "מערכת סאונד אקוסטית או חיבור למערכת של DJ?" },
];

const TRANSPORT_TIPS: VendorTip[] = [
  { icon: "🚗", text: "הזמנו 30 דקות מוקדם — מסע פתאומי = איחור לכלה" },
  { icon: "🛡️", text: "ביטוח? נהג מקצועי? הוכחת רישוי?" },
  { icon: "🚌", text: "אורחים מצפון/דרום? שקלו אוטובוס שכלול במחיר האולם" },
];

const ALCOHOL_TIPS: VendorTip[] = [
  { icon: "🍷", text: "כמות יין: 1 בקבוק לכל 4 אורחים מבוגרים" },
  { icon: "🍸", text: "בר קוקטיילים? בקשו 2 בולען לכל 75 אורחים" },
  { icon: "💧", text: "אל תשכחו: מים, סודה, ושתייה ללא אלכוהול בכמות זהה" },
];

const ENTERTAINMENT_TIPS: VendorTip[] = [
  { icon: "🎤", text: "בקשו לראות סרטון של ביצוע חי — לא רק קליפ ערוך" },
  { icon: "⏱️", text: "תאמו זמן הופעה מדויק והפסקות עם DJ / הקייטרינג" },
  { icon: "🎁", text: "מה כלול: ציוד, סאונד, מנחה, או רק האמן?" },
];

const GENERIC_TIPS: VendorTip[] = [
  { icon: "💬", text: "תמיד בקשו 2-3 הצעות מחיר להשוואה" },
  { icon: "📋", text: "כל פרט בכתב — אסור על הסכמות בעל פה" },
  { icon: "💰", text: "מקדמה סבירה: 25-40%, יתרה ביום או אחרי" },
  { icon: "✍️", text: "חוזה חתום לפני תשלום — אסור 'נסגור אחרי'" },
];

// ─── Mapping VendorType → tip set ─────────────────────────────────────────
// Categories that don't have a specialized library yet point to GENERIC_TIPS;
// adding a new dedicated set is just creating the const above and pointing
// the relevant keys here.

export const VENDOR_TIPS: Record<VendorType, VendorTip[]> = {
  venue: VENUE_TIPS,
  catering: CATERING_TIPS,
  alcohol: ALCOHOL_TIPS,
  cocktail: ALCOHOL_TIPS,
  sweets: CATERING_TIPS,
  photography: PHOTOGRAPHY_TIPS,
  videography: VIDEOGRAPHY_TIPS,
  drone: VIDEOGRAPHY_TIPS,
  social: VIDEOGRAPHY_TIPS,
  photobooth: PHOTOGRAPHY_TIPS,
  dj: MUSIC_TIPS,
  band: MUSIC_TIPS,
  rabbi: RABBI_TIPS,
  makeup: MAKEUP_TIPS,
  dress: DRESS_TIPS,
  florist: FLORIST_TIPS,
  stationery: STATIONERY_TIPS,
  signage: STATIONERY_TIPS,
  printing: PRINTING_TIPS,
  designer: DESIGNER_TIPS,
  fx: DESIGNER_TIPS,
  lighting: DESIGNER_TIPS,
  transportation: TRANSPORT_TIPS,
  entertainment: ENTERTAINMENT_TIPS,
  magician: ENTERTAINMENT_TIPS,
  hosting: ENTERTAINMENT_TIPS,
  kids: ENTERTAINMENT_TIPS,
  security: GENERIC_TIPS,
};

/** Resolver — VendorType-typed key (compile-time safe). Falls back to the
 *  generic tip set on any unmapped or invalid input so callers never crash. */
export function getTipsForType(type: VendorType): VendorTip[] {
  return VENDOR_TIPS[type] ?? GENERIC_TIPS;
}
