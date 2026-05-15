"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, X, Send, CheckCircle2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { trackPageAction, trackPageView } from "@/lib/vendorStudio";
import { showToast } from "@/components/Toast";
import type { VendorLandingData, VendorReview } from "@/lib/types";
import { PhoneInput } from "@/components/inputs/PhoneInput";
import { LuxuriousTemplate } from "./templates/LuxuriousTemplate";
import { ModernTemplate } from "./templates/ModernTemplate";
import { RusticTemplate } from "./templates/RusticTemplate";

/**
 * R20 Phase 9 — client-side wrapper around the chosen template.
 *
 * Pulls reviews + fires page-view analytics on mount. The actual
 * rendering is delegated to one of three templates based on
 * `landing_template`. R14 §G adds a "send interest" modal that posts
 * to /api/vendors/lead and shows up the same way for every template.
 */
export function VendorLandingClient({ vendor }: { vendor: VendorLandingData }) {
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
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
        .eq("vendor_id", vendor.slug ?? vendor.id)
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
  }, [vendor.id, vendor.slug]);

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
    onSendInterest: () => setLeadModalOpen(true),
  };

  const Template =
    vendor.landing_template === "modern"
      ? ModernTemplate
      : vendor.landing_template === "rustic"
        ? RusticTemplate
        : LuxuriousTemplate;

  return (
    <>
      <Template {...sharedProps} />
      {leadModalOpen && (
        <LeadInterestModal
          vendor={vendor}
          onClose={() => setLeadModalOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Lead-interest modal — POSTs to /api/vendors/lead with the couple's
 * message + auto-filled name/email from their auth session. On success
 * shows a thank-you and auto-closes after 3s.
 */
function LeadInterestModal({
  vendor,
  onClose,
}: {
  vendor: VendorLandingData;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [needSignIn, setNeedSignIn] = useState(false);

  // Pre-fill name from the auth user if available. Fires once on mount.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNeedSignIn(true);
        return;
      }
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ?? "";
      if (fullName) setName(fullName);
      else if (user.email) setName(user.email.split("@")[0]);
    })();
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("השירות לא זמין", "error");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNeedSignIn(true);
        return;
      }
      const res = await fetch("/api/vendors/lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          vendor_slug: vendor.slug,
          message: message.trim() || undefined,
          source: "contact_button",
          couple_name: name.trim() || undefined,
          couple_phone: phone.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "השליחה נכשלה", "error");
        return;
      }
      setSuccess(true);
      window.setTimeout(onClose, 3000);
    } catch (e) {
      console.error("[VendorLandingClient] lead submit", e);
      showToast("שגיאה בשליחה", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // The modal sits OUTSIDE the template tree — global fixed overlay.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="lead-modal-title"
    >
      <div
        className="card glass-strong p-6 w-full max-w-md my-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              שליחת התעניינות
            </div>
            <h2 id="lead-modal-title" className="mt-1 text-lg font-bold">
              {vendor.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {success ? (
          <div className="text-center py-6">
            <CheckCircle2
              size={48}
              className="mx-auto text-emerald-400"
              aria-hidden
            />
            <h3 className="mt-3 text-xl font-bold gradient-gold">!נשלח</h3>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              {vendor.name} יקבל הודעה ב-SMS ובמייל. בדרך כלל הם עונים תוך
              24 שעות.
            </p>
          </div>
        ) : needSignIn ? (
          <div className="text-center py-4">
            <p
              className="text-sm mb-4"
              style={{ color: "var(--foreground-soft)" }}
            >
              כדי לשלוח התעניינות, יש להתחבר קודם — ככה הספק יודע לחזור אלייך.
            </p>
            <Link
              href={`/signup?returnTo=/vendor/${vendor.slug}`}
              className="btn-gold inline-flex items-center gap-2"
            >
              התחבר / הירשם
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block">
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  שם
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  טלפון (אופציונלי)
                </span>
                {/* R18 §L — shared PhoneInput (fixed +972 chip). */}
                <PhoneInput value={phone} onChange={setPhone} />
              </label>
              <label className="block">
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  הודעה לספק (אופציונלי)
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="input"
                  maxLength={500}
                  placeholder="מתכננים אירוע ב-30/8, 250 אורחים. נשמח לשמוע מחירים..."
                />
              </label>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl py-3 text-sm"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !name.trim()}
                className="btn-gold py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="animate-spin" size={14} aria-hidden />
                ) : (
                  <>
                    <Send size={14} aria-hidden /> שלח
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
