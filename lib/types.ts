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

export type GuestGroup = "family" | "friends" | "work" | "neighbors" | "other";
export type GuestAgeGroup = "child" | "teen" | "adult" | "senior";

export const GUEST_GROUP_LABELS: Record<GuestGroup, string> = {
  family: "משפחה",
  friends: "חברים",
  work: "עבודה",
  neighbors: "שכנים",
  other: "אחר",
};

export const GUEST_AGE_GROUP_LABELS: Record<GuestAgeGroup, string> = {
  child: "ילד/ה",
  teen: "נוער",
  adult: "מבוגר/ת",
  senior: "קשיש/ה",
};

export interface Guest {
  id: string;
  name: string;
  /** Phone number, ideally in E.164 form (+972...) but tolerant of local formats. */
  phone: string;
  /** Total head count including the guest themselves (1+). The spec calls it
   *  `plus_ones` but we keep `attendingCount` for backwards compatibility with
   *  every page that already reads it. `plusOnes` (below) is the additional-only
   *  field for new code that prefers the explicit semantics. */
  attendingCount: number;
  status: GuestStatus;
  side?: "bride" | "groom" | "shared";
  notes?: string;
  invitedAt?: string;
  respondedAt?: string;
  /** When the host sent a follow-up reminder. Used to gate "send reminder"
   *  buttons (no spamming guests more than once per 7 days). */
  reminderSentAt?: string;
  /** Additional guests beyond this one (default 0). Optional alias for
   *  `attendingCount - 1`; new RSVP code should write both. */
  plusOnes?: number;
  /** HMAC-SHA256 signed token over `<eventId>|<guestId>` with the event's
   *  signing key. Used in invitation URLs so we can verify the guest is who
   *  they claim. Auto-minted on first creation; lazily backfilled for legacy
   *  guests on read. */
  rsvpToken?: string;
  /** Money in NIS the guest gave at the event. Used for post-event balance & reciprocity. */
  envelopeAmount?: number;
  // ─── Smart-seating signals (all optional; backfilled with sensible defaults) ───
  /** Social context — drives seating cohesion. */
  group?: GuestGroup;
  /** Age bucket — drives age balance across tables. */
  ageGroup?: GuestAgeGroup;
  /**
   * Free-form social circle label (e.g. "חברים מהצבא", "משפחה רחוקה",
   * "חברי הכיתה י׳"). When this matches a `SeatingTable.circle`, the
   * smart-arrangement gives the guest a massive bias toward that table —
   * effectively pinning them there unless capacity won't allow it.
   *
   * Distinct from `group` (a closed enum for broad demographics like
   * family/friends/work). `circle` is the user's own naming scheme;
   * matched case-insensitively after trimming.
   */
  circle?: string;
  /** "Male" / "female" / null — used only for soft gender balance, never as gating. */
  gender?: "male" | "female";
  /** Guest IDs this person should NEVER share a table with (exes, feuds). */
  conflictsWith?: string[];
  /** Guest IDs this person MUST share a table with (couples, parents+kids). */
  mustSitWith?: string[];
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
  | "fx"
  // ─── New categories (2026 expansion) ───
  | "drone"
  | "kids"
  | "security"
  | "magician"
  | "lighting"
  | "stationery"
  | "signage"
  | "cocktail"
  | "photobooth"
  | "hosting"
  // R11 — print houses (separate from "stationery" which covers design/digital).
  | "printing";

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
  drone: "צילומי רחפן",
  kids: "פעילות לילדים",
  security: "אבטחה ומלתחה",
  magician: "קוסמים ובידור",
  lighting: "תאורה אדריכלית",
  stationery: "הזמנות והדפסים",
  signage: "שילוט וכניסה",
  cocktail: "בר קוקטיילים",
  photobooth: "מתחם צילום",
  hosting: "מנחי טקס / MC",
  printing: "בתי דפוס",
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
  /**
   * Display number — the big "12" inside the table circle that lets the host
   * call out "שולחן 12" across the venue. Auto-assigned (max + 1) on create,
   * editable in the table modal. Optional because tables created before this
   * field existed get backfilled on first render — the seating page maps
   * `t.number ?? <index+1>` so legacy data still renders sane labels.
   */
  number?: number;
  /**
   * Optional named circle the table belongs to. When set, the smart-
   * arrangement algorithm strongly prefers placing guests whose own
   * `circle` (case-insensitive trimmed match) equals this value here.
   * Common usage: name the table "חברים מהצבא" and tag the matching
   * guests with the same circle — the auto-arrangement does the rest.
   */
  circle?: string;
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

/** Live-mode "ברכה" submitted by a guest at the event. Anonymous-by-default — guest
 *  may add their name. Capped to 280 chars (handled at submission). */
export interface Blessing {
  id: string;
  text: string;
  /** Optional display name. Falls back to "אורח אנונימי". */
  fromName?: string;
  at: string;
}

/** Live-mode photo uploaded from a guest's phone. Stored as data: URL because we
 *  often run without a backend; max 5MB enforced upstream. The image bytes live
 *  in localStorage which has its own caps — we trim oldest first if quota fails. */
export interface LivePhoto {
  id: string;
  /** data: or https: URL. We avoid Object URLs so they survive page reload. */
  src: string;
  /** Optional uploader name + caption. */
  fromName?: string;
  caption?: string;
  at: string;
}

// ─── Saved-vendor pipeline (R7) ─────────────────────────────────────────────
// Replaces the old "favorited heart" semantics with a real lead pipeline. The
// id-only `selectedVendors` array stays as the source of truth for legacy
// readers (dashboard count, journey milestones, AI assistant context, settings
// export) — every action keeps `savedVendors[].vendorId` and `selectedVendors`
// in sync, so neither side drifts.

export type SavedVendorStatus =
  | "lead"        // נוסף לרשימה, לא יצרתי קשר
  | "contacted"   // יצרתי קשר ראשון
  | "meeting"     // קבועה פגישה
  | "signed"      // חתמנו חוזה
  | "paid"        // שולם במלואו
  | "cancelled";  // החלטתי לא לקחת

export const SAVED_VENDOR_STATUS_LABELS: Record<SavedVendorStatus, string> = {
  lead: "ברשימה",
  contacted: "יצרתי קשר",
  meeting: "פגישה קבועה",
  signed: "חתמתי",
  paid: "שולם",
  cancelled: "בוטל",
};

export const SAVED_VENDOR_STATUS_COLORS: Record<SavedVendorStatus, string> = {
  lead: "bg-white/5 text-white/60 border-white/10",
  contacted: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  meeting: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  signed: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  paid: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-red-400/10 text-red-400 border-red-400/20",
};

export interface SavedVendor {
  /** Reference to vendor in the catalog (lib/vendors.ts) or vendor_applications. */
  vendorId: string;
  status: SavedVendorStatus;
  /** מחיר שסגרת — לאחר משא ומתן. */
  agreedPrice?: number;
  /** מקדמה ששולמה. */
  depositAmount?: number;
  /** תאריך תשלום מקדמה (ISO date). */
  depositDate?: string;
  /** מועד פגישה (ISO datetime). */
  meetingDate?: string;
  /** מקום פגישה — כתובת או "Zoom" / "WhatsApp call". */
  meetingLocation?: string;
  /** הערות חופשיות. */
  notes?: string;
  /** הדירוג האישי שלך אחרי שעבדת איתו (1-5). */
  rating?: number;
  /** קובץ חוזה — Supabase Storage URL בעתיד. כרגע placeholder. */
  contractFileUrl?: string;
  addedAt: string;
  updatedAt: string;
}

export interface AppState {
  event: EventInfo | null;
  guests: Guest[];
  budget: BudgetItem[];
  /**
   * Legacy id-only list of "saved" vendors. Kept in sync with
   * `savedVendors[].vendorId` for readers that don't need the richer pipeline
   * data (dashboard count, journey milestones, AI assistant, settings export).
   */
  selectedVendors: string[];
  /**
   * R7: Saved-vendor pipeline. Each entry tracks status, agreed price,
   * deposits, meeting details, and notes. New code should read this; legacy
   * readers continue to use `selectedVendors`.
   */
  savedVendors: SavedVendor[];
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
  /** Blessings submitted in live mode. Surfaced both during the event and in
   *  the post-event memory-album view. */
  blessings: Blessing[];
  /** Photos uploaded in live mode. Same lifecycle as blessings. */
  livePhotos: LivePhoto[];
}

// ───────────────────────── Momentum Live (R20) ───────────────────────────
// Cloud-only types — the live-event manager system runs against Supabase
// tables (event_managers, guest_arrivals, manager_actions). Local-only
// users without a configured Supabase instance see the opt-in banner but
// the actual feature requires cloud sync to be live.

export type ManagerRole = "general" | "door" | "floor" | "vip" | "kids" | "vendor";
export type ManagerStatus = "invited" | "accepted" | "declined";

export interface EventManager {
  id: string;
  event_id: string;
  user_id: string | null;
  invited_by: string;
  invitee_phone: string;
  invitee_name: string;
  role: ManagerRole;
  status: ManagerStatus;
  invitation_token: string;
  accepted_at: string | null;
  created_at: string;
}

export interface GuestArrival {
  id: string;
  event_id: string;
  guest_id: string;
  arrived_at: string;
  marked_by: string;
  plus_ones: number;
  notes: string | null;
}

export interface ManagerAction {
  id: string;
  event_id: string;
  manager_id: string;
  action_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ───────────────────────── Vendor Studio (R20 Phase 9) ────────────────
// Self-contained landing-page data for an approved vendor. The owner is
// the auth user that signed up as a vendor; the public reads by slug.

export type LandingTemplate = "luxurious" | "modern" | "rustic";
export type PriceRange = "budget" | "mid" | "premium" | "luxury";

export interface VendorLandingData {
  id: string;
  slug: string | null;
  owner_user_id: string;

  name: string;
  category: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;

  tagline: string | null;
  about_long: string | null;
  description: string | null;

  hero_photo_path: string | null;
  gallery_paths: string[];
  video_url: string | null;

  service_areas: string[];
  price_range: PriceRange | null;
  years_experience: number | null;
  languages: string[];
  certifications: string[];

  landing_template: LandingTemplate;
  landing_published: boolean;
  featured: boolean;

  landing_updated_at: string | null;
  created_at: string;
}

export interface VendorAnalytics {
  vendor_id: string;
  active_days_30d: number;
  views_30d: number;
  views_7d: number;
  views_today: number;
  unique_sources_30d: number;
}

export const TEMPLATE_LABELS: Record<LandingTemplate, { label: string; description: string }> = {
  luxurious: { label: "יוקרתי", description: "כהה, זהוב, אלגנטי — לאולמות, אירועים גדולים" },
  modern: { label: "מודרני", description: "נקי, גיאומטרי, רענן — לצלמים, DJים" },
  rustic: { label: "כפרי", description: "חמים, אורגני — לפרחים, מקומות בוטיק" },
};

export const PRICE_RANGE_LABELS: Record<PriceRange, string> = {
  budget: "₪",
  mid: "₪₪",
  premium: "₪₪₪",
  luxury: "₪₪₪₪",
};

// ───────────────────────── Vendor Reviews (R20 Phase 8) ────────────────
// Verified reviews with sub-ratings, tags, photos, and price disclosure.

export interface VendorReview {
  id: string;
  vendor_id: string;
  vendor_name: string;
  user_id: string;
  event_id: string;
  event_date: string | null;
  overall_rating: number;
  quality_rating: number | null;
  value_rating: number | null;
  communication_rating: number | null;
  punctuality_rating: number | null;
  title: string | null;
  review_text: string | null;
  highlights: string[];
  concerns: string[];
  /** Both prices are agorot. UI divides by 100 for display. */
  agreed_price: number | null;
  initial_quote: number | null;
  would_recommend: boolean | null;
  recommend_tags: string[];
  photo_paths: string[];
  quote_document_path: string | null;
  is_verified: boolean;
  is_published: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface VendorReviewStats {
  vendor_id: string;
  total_reviews: number;
  avg_rating: number;
  avg_quality: number;
  avg_value: number;
  avg_communication: number;
  avg_punctuality: number;
  recommend_count: number;
  recommend_percent: number;
  count_5: number;
  count_4: number;
  count_3: number;
  count_2: number;
  count_1: number;
}

export interface VendorReviewResponse {
  review_id: string;
  vendor_user_id: string;
  response_text: string;
  responded_at: string;
}

export const RECOMMEND_TAGS = [
  { id: "budget-friendly", label: "מתאים לתקציב", emoji: "💰" },
  { id: "premium", label: "פרימיום", emoji: "👑" },
  { id: "religious-friendly", label: "מתאים לדתיים", emoji: "🕊️" },
  { id: "creative", label: "יצירתי", emoji: "🎨" },
  { id: "fast-response", label: "תגובה מהירה", emoji: "⚡" },
  { id: "flexible", label: "גמיש", emoji: "🤝" },
  { id: "professional", label: "מקצועי מאוד", emoji: "✨" },
  { id: "family-friendly", label: "ידידותי למשפחה", emoji: "👨‍👩‍👧" },
  { id: "english-speaking", label: "דובר אנגלית", emoji: "🌍" },
  { id: "outdoor", label: "מתמחה בחוצות", emoji: "🌳" },
] as const;

export const REVIEW_HIGHLIGHTS = [
  "הגיע בזמן", "מקצועי מאוד", "גמיש בבקשות", "המלצות שימושיות",
  "תקשורת מצוינת", "יחס אישי", "איכות ברמה גבוהה", "מחיר הוגן",
  "צוות נעים", "ערך מוסף מעבר לציפיות",
] as const;

export const REVIEW_CONCERNS = [
  "איחור קל", "תקשורת ארוכה", "תוספת עלויות", "פחות גמיש בלוח זמנים",
  "סטיות מהמתוכנן", "דרש תשלום מראש גבוה",
] as const;

// ───────────────────────── Wedding CFO (R20 Phase 7) ───────────────────
// AI-assisted receipt capture + cashflow forecast. Amounts are stored in
// agorot (1 NIS = 100 agorot) to avoid float drift; UI displays shekels.

export type ReceiptStatus = "pending" | "partial" | "paid" | "overdue" | "disputed";

export interface EventReceipt {
  id: string;
  event_id: string;
  user_id: string;
  vendor_name: string | null;
  category: string | null;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  status: ReceiptStatus;
  raw_text: string | null;
  image_path: string | null;
  notes: string | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentScheduleItem {
  id: string;
  receipt_id: string;
  installment_label: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  paid_amount: number | null;
  notes: string | null;
  created_at: string;
}

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-white/5 text-white/60 border-white/10" },
  partial: { label: "תשלום חלקי", color: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
  paid: { label: "שולם", color: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" },
  overdue: { label: "באיחור", color: "bg-red-400/10 text-red-400 border-red-400/20" },
  disputed: { label: "במחלוקת", color: "bg-purple-400/10 text-purple-400 border-purple-400/20" },
};

export const MANAGER_ROLE_LABELS: Record<ManagerRole, { label: string; emoji: string; description: string }> = {
  general: { label: "מנהל כללי", emoji: "🎯", description: "אחראי על כל מהלך האירוע" },
  door: { label: "Door Captain", emoji: "🚪", description: "אחראי על הכניסה — סורק אורחים, מאשר הגעה" },
  floor: { label: "Floor Captain", emoji: "🪑", description: "אחראי על השולחנות — סידור, בקשות, swap" },
  vip: { label: "VIP Captain", emoji: "👑", description: "דואג להורי הזוג, סבים, ואורחי כבוד" },
  kids: { label: "Kids Captain", emoji: "👶", description: "מנהל את שולחן הילדים" },
  vendor: { label: "Vendor Captain", emoji: "📞", description: "מתאם בין הספקים השונים" },
};
