export type EventType =
  | "wedding"
  | "bar-mitzvah"
  | "bat-mitzvah"
  | "shabbat-chatan"
  | "engagement"
  | "brit"
  | "birthday"
  | "corporate"
  | "other";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "חתונה",
  "bar-mitzvah": "בר מצווה",
  "bat-mitzvah": "בת מצווה",
  "shabbat-chatan": "שבת חתן",
  engagement: "אירוסין",
  brit: "ברית",
  birthday: "יום הולדת",
  corporate: "אירוע עסקי",
  other: "אחר",
};

export type Region =
  | "tel-aviv"
  | "jerusalem"
  | "haifa"
  | "north"
  | "south"
  | "sharon"
  | "shfela"
  | "negev";

export const REGION_LABELS: Record<Region, string> = {
  "tel-aviv": "תל אביב והמרכז",
  jerusalem: "ירושלים והסביבה",
  haifa: "חיפה והקריות",
  north: "צפון הארץ",
  south: "דרום הארץ",
  sharon: "השרון",
  shfela: "השפלה",
  negev: "הנגב",
};

export type GuestStatus = "pending" | "invited" | "confirmed" | "declined" | "maybe";

export interface Guest {
  id: string;
  name: string;
  phone: string;
  attendingCount: number;
  status: GuestStatus;
  side?: "bride" | "groom" | "shared";
  notes?: string;
  invitedAt?: string;
  respondedAt?: string;
  /** Money in NIS the guest gave at the event. Used for post-event balance & reciprocity. */
  envelopeAmount?: number;
}

export type BudgetCategory =
  | "venue"
  | "catering"
  | "photography"
  | "music"
  | "flowers"
  | "decoration"
  | "attire"
  | "invitations"
  | "transportation"
  | "other";

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  venue: "אולם / מקום",
  catering: "קייטרינג",
  photography: "צילום",
  music: "מוזיקה / DJ",
  flowers: "פרחים",
  decoration: "עיצוב",
  attire: "לבוש",
  invitations: "הזמנות",
  transportation: "הסעות",
  other: "שונות",
};

export interface BudgetItem {
  id: string;
  category: BudgetCategory;
  title: string;
  estimated: number;
  actual?: number;
  paid?: number;
  vendorId?: string;
  notes?: string;
}

export type VendorType =
  | "venue"
  | "photography"
  | "videography"
  | "dj"
  | "band"
  | "social"
  | "alcohol"
  | "catering"
  | "florist"
  | "designer"
  | "rabbi"
  | "makeup"
  | "dress"
  | "entertainment"
  | "transportation"
  | "sweets"
  | "fx";

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  venue: "אולמות וגני אירועים",
  photography: "צלמים",
  videography: "צילום וידאו",
  dj: "תקליטנים",
  band: "להקות",
  social: "סושיאל ורילז",
  alcohol: "ברים ואלכוהול",
  catering: "קייטרינג",
  florist: "פרחים",
  designer: "מעצבים",
  rabbi: "רבנים",
  makeup: "איפור ושיער",
  dress: "שמלות וחליפות",
  entertainment: "מנחים ואטרקציות",
  transportation: "הסעות ורכבים",
  sweets: "בר מתוקים",
  fx: "אפקטים ובמה",
};

export interface Vendor {
  id: string;
  name: string;
  type: VendorType;
  region: Region;
  rating: number;
  reviews: number;
  priceFrom: number;
  description: string;
  phone: string;
  /** Vendor is listed in our catalog — does NOT imply verification or endorsement.
   *  Renamed from `verified` to remove any implied legal claim about vendor quality;
   *  the data field stays so existing seeded data keeps working. */
  inCatalog: boolean;
  tags: string[];
  /** Optional social / web presence — surfaced as one-tap links in the vendor card. */
  instagram?: string; // handle without "@"
  facebook?: string;  // page slug or full URL
  website?: string;   // full https URL
}

export interface EventInfo {
  id: string;
  type: EventType;
  /** Random 32-byte signing key for this event. Used to HMAC invitation URLs so
   *  guests can't forge or replay RSVP responses. Generated locally; never sent
   *  to vendors / guests in plain form. */
  signingKey?: string;
  /** Primary subject — groom for wedding, celebrant for bar/bat mitzvah / shabbat chatan, baby for brit, host for everything else. */
  hostName: string;
  /** Optional second name — bride for wedding, second parent for bar/bat mitzvah & brit. */
  partnerName?: string;
  /** Optional synagogue (for shabbat chatan, brit, religious bar/bat mitzvah). */
  synagogue?: string;
  /** Host's WhatsApp number — required so RSVP responses can be sent back. */
  hostPhone?: string;
  date: string;
  region: Region;
  city?: string;
  budgetTotal: number;
  guestEstimate: number;
  createdAt: string;
  /** Guardian consent — REQUIRED for events celebrating a minor (brit, bar/bat
   *  mitzvah). Set when the parent/legal guardian explicitly confirms during
   *  onboarding that they're acting on the minor's behalf. ISO timestamp records
   *  when consent was given. Absence on a minor event = the event was created
   *  before this requirement existed and should be re-affirmed on next edit. */
  guardianConsent?: {
    acceptedAt: string;
  };
}

/** Event types that celebrate a minor and therefore require guardian consent. */
export const MINOR_EVENT_TYPES: ReadonlyArray<EventType> = ["brit", "bar-mitzvah", "bat-mitzvah"];

// (Removed unused `JourneyStep` interface — the active model is
// `JourneyStepDef` in `./eventConfig.ts`, which is per-event-type and lives
// next to the configuration tables that consume it.)

export type ChecklistPhase =
  | "early"      // 6+ months before
  | "mid"        // 3-6 months before
  | "late"       // 1-3 months before
  | "final"      // 1-2 weeks before
  | "day-of";    // event day

export const CHECKLIST_PHASE_LABELS: Record<ChecklistPhase, string> = {
  early: "חצי שנה ויותר לפני",
  mid: "3-6 חודשים לפני",
  late: "1-3 חודשים לפני",
  final: "שבועות אחרונים",
  "day-of": "יום האירוע",
};

export interface ChecklistItem {
  id: string;
  title: string;
  phase: ChecklistPhase;
  done: boolean;
  isCustom?: boolean;
  note?: string;
  /** ISO date (YYYY-MM-DD) — when the user wants this task done by. Computed
   *  initially from the event date + the phase window, editable by the user. */
  dueDate?: string;
}

export interface SeatingTable {
  id: string;
  name: string;
  capacity: number;
}

export interface VendorMessage {
  id: string;
  vendorId: string;
  fromUser: boolean;
  text: string;
  at: string;
}

export interface AssistantMessage {
  id: string;
  fromUser: boolean;
  text: string;
  at: string;
}

export interface AppState {
  event: EventInfo | null;
  guests: Guest[];
  budget: BudgetItem[];
  selectedVendors: string[];
  checklist: ChecklistItem[];
  /** Tables for the seating chart. */
  tables: SeatingTable[];
  /** guestId -> tableId mapping (one assignment per guest). */
  seatAssignments: Record<string, string>;
  /** Per-vendor message threads. */
  vendorChats: VendorMessage[];
  /** AI assistant conversation history. */
  assistantMessages: AssistantMessage[];
  /** Vendor IDs the user is comparing side-by-side. */
  compareVendors: string[];
}
