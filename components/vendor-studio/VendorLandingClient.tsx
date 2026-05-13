"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { trackPageAction, trackPageView } from "@/lib/vendorStudio";
import type { VendorLandingData, VendorReview } from "@/lib/types";
import { LuxuriousTemplate } from "./templates/LuxuriousTemplate";
import { ModernTemplate } from "./templates/ModernTemplate";
import { RusticTemplate } from "./templates/RusticTemplate";

/**
 * R20 Phase 9 — client-side wrapper around the chosen template.
 *
 * Pulls reviews + fires page-view analytics on mount. The actual rendering
 * is delegated to one of three templates based on `landing_template`.
 */
export function VendorLandingClient({ vendor }: { vendor: VendorLandingData }) {
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  // R11 P0 #5 — React 19 strict mode in dev runs every effect twice. The
  // ref guarantees the page-view insert fires exactly once per vendor
  // navigation, so the analytics view doesn't double-count visitors.
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (trackedRef.current !== vendor.id) {
      trackedRef.current = vendor.id;
      void trackPageView(vendor.id);
    }
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = (await supabase
        .from("vendor_reviews")
        .select("*")
        .eq("vendor_id", vendor.id)
        .eq("is_published", true)
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6)) as { data: VendorReview[] | null };
      if (cancelled) return;
      setReviews(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendor.id]);

  const handleAction = (action: string) => {
    void trackPageAction(vendor.id, action);
  };

  // R12 §3U — normalize phone once, share the result with both wa.me and
  // tel: builders so the three templates can't disagree on what they
  // dial. `normalizeIsraeliPhone` strips dashes/spaces and prefixes 972.
  const normalized = vendor.phone
    ? normalizeIsraeliPhone(vendor.phone)
    : { phone: "", valid: false };

  const buildWhatsappUrl = () => {
    if (!normalized.valid) return "";
    const message = `שלום ${vendor.name}! 👋\n\nראיתי את הפרופיל שלך ב-Momentum ואשמח לקבל פרטים נוספים על השירות שלך.\n\nתודה!`;
    return `https://wa.me/${normalized.phone}?text=${encodeURIComponent(message)}`;
  };

  // `tel:` accepts the leading +. We keep the original input when phone
  // didn't normalize so the user can still tap-to-call a non-standard
  // number (international guest hotline, etc.).
  const telUrl = normalized.valid
    ? `tel:+${normalized.phone}`
    : vendor.phone
      ? `tel:${vendor.phone}`
      : "";

  const sharedProps = {
    vendor,
    reviews,
    onAction: handleAction,
    whatsappUrl: buildWhatsappUrl(),
    telUrl,
  };

  if (vendor.landing_template === "modern") return <ModernTemplate {...sharedProps} />;
  if (vendor.landing_template === "rustic") return <RusticTemplate {...sharedProps} />;
  return <LuxuriousTemplate {...sharedProps} />;
}
