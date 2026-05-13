/**
 * Types + presets for the vendor onboarding flow (Phase 0).
 *
 * Why a separate category list from `lib/types.ts`?
 *   `VendorType` in lib/types.ts is the catalog's internal taxonomy (used
 *   by the static catalog in lib/vendors.ts). This list is host-facing,
 *   collapses some adjacent items (DJ + band → "music-dj"), and adds
 *   emoji + Hebrew labels that we want decoupled from the data model.
 *   When an application is approved, the admin route maps `category` →
 *   the matching VendorType (see lib/vendorCategoryMap.ts in a future
 *   round; today the mapping lives inline in the admin/decide route).
 */

export const VENDOR_CATEGORIES = [
  { id: "venue", label: "אולמות וגני אירועים", emoji: "🏛️" },
  { id: "catering", label: "קייטרינג", emoji: "🍽️" },
  { id: "photography", label: "צילום סטילס", emoji: "📸" },
  { id: "videography", label: "וידאו וסרטי חתונה", emoji: "🎥" },
  { id: "music-dj", label: "DJ ולהקות", emoji: "🎵" },
  { id: "rabbi", label: "רבנים ומסדרי קידושין", emoji: "📜" },
  { id: "makeup-hair", label: "איפור ושיער", emoji: "💄" },
  { id: "bridal", label: "שמלות כלה", emoji: "👰" },
  { id: "groomswear", label: "חליפות חתן", emoji: "🤵" },
  { id: "florist", label: "פרחים ועיצוב", emoji: "🌸" },
  { id: "invitations", label: "הזמנות וגרפיקה", emoji: "💌" },
  { id: "printing", label: "בתי דפוס", emoji: "🖨️" },
  { id: "chuppah", label: "חופה ועיצוב טקס", emoji: "⛺" },
  { id: "transport", label: "הסעות ורכבים", emoji: "🚗" },
  { id: "other", label: "אחר", emoji: "✨" },
] as const;

export type VendorCategory = typeof VENDOR_CATEGORIES[number]["id"];

export interface VendorApplicationInput {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city?: string;
  category: VendorCategory;
  about?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  sample_work_url: string;
  business_id: string;
  years_in_field: number;
}

export interface VendorApplicationRecord extends VendorApplicationInput {
  id: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewed_at: string | null;
  approved_vendor_id: string | null;
  phone_verified: boolean;
  created_at: string;
}
