import type { EventType, VendorType } from "./types";

export interface SubjectFields {
  /** Should we show the second-name field? */
  hasPartner: boolean;
  hostLabel: string;
  hostPlaceholder: string;
  partnerLabel?: string;
  partnerPlaceholder?: string;
  /** Should we show synagogue field? */
  hasSynagogue?: boolean;
  synagogueLabel?: string;
  /** Headline for step 1 */
  step1Title: string;
  step1Subtitle: string;
}

export interface JourneyStepDef {
  id: string;
  title: string;
  description: string;
  href: string;
  /** Pre-condition keys: "vendors", "guests", "budget" — checked at runtime. */
  unlockBy?: "always" | "afterEvent" | "afterGuests";
  /** Completion condition. */
  completeBy: "hasEvent" | "hasVendors" | "hasInvited" | "hasBudget" | "hasResponses" | "hasChecklistProgress" | "hasSeating" | "hasEnvelopes";
}

export interface EventTypeConfig {
  label: string;
  /** Short tagline shown under the title. */
  tagline: string;
  /** Recommended categories on the Vendors page (in display order). */
  recommendedVendors: VendorType[];
  /** Custom step-1 onboarding fields. */
  subject: SubjectFields;
  /** Custom journey for this event type. */
  journey: JourneyStepDef[];
  /** WhatsApp invitation host phrasing — how subjects identify themselves. */
  invitationHostPhrase: (host: string, partner?: string) => string;
  /** Inline phrase for the event itself in the message. */
  invitationEventPhrase: string;
  /** Default budget guidance — average per guest in NIS. */
  avgPerGuest: number;
}

const COMMON_END_STEPS: JourneyStepDef[] = [
  {
    id: "checklist",
    title: "צ׳קליסט המשימות",
    description: "כל מה שצריך לעשות, מסודר לפי שלב.",
    href: "/checklist",
    unlockBy: "afterEvent",
    completeBy: "hasChecklistProgress",
  },
  {
    id: "guests",
    title: "רשימת מוזמנים",
    description: "הוסף מוזמנים ושלח הזמנות בוואטסאפ.",
    href: "/guests",
    unlockBy: "afterEvent",
    completeBy: "hasInvited",
  },
  {
    id: "budget",
    title: "תקציב חכם",
    description: "מעקב הוצאות וחיזוי עלות סופית.",
    href: "/budget",
    unlockBy: "afterEvent",
    completeBy: "hasBudget",
  },
  {
    id: "rsvp",
    title: "מעקב אישורי הגעה",
    description: "ראה בזמן אמת מי מגיע וכמה.",
    href: "/guests",
    unlockBy: "afterGuests",
    completeBy: "hasResponses",
  },
  {
    id: "seating",
    title: "סידורי הושבה",
    description: "סדר את האורחים סביב השולחנות.",
    href: "/seating",
    unlockBy: "afterGuests",
    completeBy: "hasSeating",
  },
  {
    id: "balance",
    title: "סיכום ומאזן",
    description: "אחרי האירוע — רישום מעטפות ורווח/הפסד.",
    href: "/balance",
    unlockBy: "afterGuests",
    completeBy: "hasEnvelopes",
  },
];

const STEP_DEFINE: JourneyStepDef = {
  id: "concept",
  title: "הגדרת האירוע",
  description: "סוג, תאריך, אזור ותקציב.",
  href: "/onboarding",
  unlockBy: "always",
  completeBy: "hasEvent",
};

const STEP_VENDORS_GENERIC: JourneyStepDef = {
  id: "vendors",
  title: "ספקים באזור שלך",
  description: "חיפוש, השוואה ובחירת ספקים.",
  href: "/vendors",
  unlockBy: "afterEvent",
  completeBy: "hasVendors",
};

export const EVENT_CONFIG: Record<EventType, EventTypeConfig> = {
  wedding: {
    label: "חתונה",
    tagline: "מהתכנון הראשון ועד הריקוד האחרון.",
    recommendedVendors: ["venue", "photography", "dj", "band", "florist", "social", "alcohol", "catering", "makeup", "dress", "rabbi", "drone", "stationery", "lighting", "cocktail", "photobooth", "hosting", "security"],
    subject: {
      hasPartner: true,
      hostLabel: "שם החתן",
      hostPlaceholder: "השם של החתן",
      partnerLabel: "שם הכלה",
      partnerPlaceholder: "השם של הכלה",
      step1Title: "ספרו לנו על הזוג",
      step1Subtitle: "השמות יופיעו על הזמנות, RSVP ומסמכי האירוע.",
    },
    avgPerGuest: 700,
    invitationHostPhrase: (host, partner) =>
      partner ? `${host} ו${partner}` : host,
    invitationEventPhrase: "לחתונתם",
    journey: [
      STEP_DEFINE,
      {
        id: "venue",
        title: "סגירת אולם",
        description: "השלב הקריטי — סגור אולם או גן אירועים.",
        href: "/vendors?type=venue",
        unlockBy: "afterEvent",
        completeBy: "hasVendors",
      },
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  "bar-mitzvah": {
    label: "בר מצווה",
    tagline: "מהעלייה לתורה ועד הריקוד עם החברים.",
    recommendedVendors: ["venue", "photography", "social", "dj", "alcohol", "catering", "florist", "rabbi", "kids", "magician", "photobooth", "hosting", "lighting"],
    subject: {
      hasPartner: false,
      hostLabel: "שם החתן בר המצווה",
      hostPlaceholder: "השם של בר המצווה",
      hasSynagogue: true,
      synagogueLabel: "בית הכנסת לעלייה לתורה",
      step1Title: "ספרו לנו על החתן בר המצווה",
      step1Subtitle: "פרטים על החוגג ובית הכנסת לעלייה לתורה.",
    },
    avgPerGuest: 450,
    invitationHostPhrase: (host) => `משפחת ${host}`,
    invitationEventPhrase: "לבר המצווה של בנם",
    journey: [
      STEP_DEFINE,
      {
        id: "synagogue",
        title: "תיאום בית הכנסת",
        description: "מועד עלייה לתורה ופרטי הקריאה.",
        href: "/dashboard",
        unlockBy: "afterEvent",
        completeBy: "hasEvent",
      },
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  "bat-mitzvah": {
    label: "בת מצווה",
    tagline: "מסיבת הבגרות שלה — מושלמת.",
    recommendedVendors: ["venue", "photography", "social", "dj", "florist", "designer", "catering", "makeup", "kids", "magician", "photobooth", "hosting", "stationery"],
    subject: {
      hasPartner: false,
      hostLabel: "שם הכלה בת המצווה",
      hostPlaceholder: "השם של בת המצווה",
      step1Title: "ספרו לנו על בת המצווה",
      step1Subtitle: "השם יופיע על הזמנות וברכות.",
    },
    avgPerGuest: 400,
    invitationHostPhrase: (host) => `משפחת ${host}`,
    invitationEventPhrase: "לבת המצווה של בתם",
    journey: [
      STEP_DEFINE,
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  "shabbat-chatan": {
    label: "שבת חתן",
    tagline: "שבת מאחדת לזוג ולמשפחה.",
    recommendedVendors: ["catering", "florist", "rabbi", "photography", "social"],
    subject: {
      hasPartner: true,
      hostLabel: "שם החתן",
      hostPlaceholder: "החתן",
      partnerLabel: "שם הכלה",
      partnerPlaceholder: "הכלה",
      hasSynagogue: true,
      synagogueLabel: "בית הכנסת",
      step1Title: "פרטי שבת החתן",
      step1Subtitle: "שם הזוג ובית הכנסת בו תתקיים העליה.",
    },
    avgPerGuest: 250,
    invitationHostPhrase: (host, partner) =>
      partner ? `${host} ו${partner}` : host,
    invitationEventPhrase: "לשבת החתן שלהם",
    journey: [
      STEP_DEFINE,
      {
        id: "synagogue",
        title: "תיאום בית כנסת ועלייה",
        description: "מועד העליה, פרטי הרב, וסידור הקריאה.",
        href: "/dashboard",
        unlockBy: "afterEvent",
        completeBy: "hasEvent",
      },
      {
        id: "kiddush",
        title: "תכנון קידוש וסעודות",
        description: "קידוש בבית הכנסת, סעודת ליל שבת, קבלת פנים.",
        href: "/vendors?type=catering",
        unlockBy: "afterEvent",
        completeBy: "hasVendors",
      },
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  brit: {
    label: "ברית",
    tagline: "אירוע משפחתי וחם של ימי החיים הראשונים.",
    recommendedVendors: ["venue", "catering", "photography", "rabbi", "florist"],
    subject: {
      hasPartner: false,
      hostLabel: "שם המשפחה",
      hostPlaceholder: "לדוגמה: כהן",
      hasSynagogue: true,
      synagogueLabel: "מקום הברית (בית כנסת או אולם)",
      step1Title: "פרטי הברית",
      step1Subtitle: "שם המשפחה ומקום הברית.",
    },
    avgPerGuest: 200,
    invitationHostPhrase: (host) => `משפחת ${host}`,
    invitationEventPhrase: "לברית של בנם",
    journey: [
      STEP_DEFINE,
      {
        id: "mohel",
        title: "תיאום מוהל ורב",
        description: "מוהל מומלץ, רב, וזמן הברית.",
        href: "/vendors?type=rabbi",
        unlockBy: "afterEvent",
        completeBy: "hasVendors",
      },
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  engagement: {
    label: "אירוסין",
    tagline: "האירוע הראשון של הדרך.",
    recommendedVendors: ["venue", "florist", "photography", "social", "catering"],
    subject: {
      hasPartner: true,
      hostLabel: "שם החתן",
      hostPlaceholder: "החתן",
      partnerLabel: "שם הכלה",
      partnerPlaceholder: "הכלה",
      step1Title: "ספרו לנו על הזוג",
      step1Subtitle: "השמות יופיעו על הזמנות.",
    },
    avgPerGuest: 350,
    invitationHostPhrase: (host, partner) =>
      partner ? `${host} ו${partner}` : host,
    invitationEventPhrase: "לאירוסים שלהם",
    journey: [
      STEP_DEFINE,
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  birthday: {
    label: "יום הולדת",
    tagline: "אירוע אישי ובלתי נשכח.",
    recommendedVendors: ["venue", "dj", "social", "alcohol", "photography", "catering", "cocktail", "photobooth", "magician", "kids", "lighting"],
    subject: {
      hasPartner: false,
      hostLabel: "שם החוגג",
      hostPlaceholder: "השם המלא של חוגג היום הולדת",
      step1Title: "ספרו לנו על החוגג",
      step1Subtitle: "השם יופיע על הזמנות וברכות.",
    },
    avgPerGuest: 300,
    invitationHostPhrase: (host) => host,
    invitationEventPhrase: "ליום ההולדת",
    journey: [
      STEP_DEFINE,
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  corporate: {
    label: "אירוע עסקי",
    tagline: "אירוע מותג ברמה הגבוהה ביותר.",
    recommendedVendors: ["venue", "catering", "photography", "videography", "social", "dj", "alcohol", "lighting", "signage", "stationery", "hosting", "security"],
    subject: {
      hasPartner: false,
      hostLabel: "שם החברה / הארגון",
      hostPlaceholder: "לדוגמה: Momentum Inc.",
      step1Title: "פרטי האירוע העסקי",
      step1Subtitle: "החברה / הארגון המארח.",
    },
    avgPerGuest: 400,
    invitationHostPhrase: (host) => host,
    invitationEventPhrase: "לאירוע",
    journey: [
      STEP_DEFINE,
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },

  other: {
    label: "אירוע",
    tagline: "אירוע מותאם אישית.",
    recommendedVendors: ["venue", "photography", "dj", "catering", "social"],
    subject: {
      hasPartner: false,
      hostLabel: "שם המארח",
      hostPlaceholder: "השם המלא שלך",
      step1Title: "ספרו לנו על האירוע",
      step1Subtitle: "כמה פרטים בסיסיים.",
    },
    avgPerGuest: 350,
    invitationHostPhrase: (host) => host,
    invitationEventPhrase: "לאירוע",
    journey: [
      STEP_DEFINE,
      STEP_VENDORS_GENERIC,
      ...COMMON_END_STEPS,
    ],
  },
};

export function getEventConfig(type: EventType): EventTypeConfig {
  return EVENT_CONFIG[type];
}
