"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Check,
  Copy,
  Lightbulb,
  MessageCircle,
  Phone,
  Send,
  Star,
  Trophy,
  X,
  ShieldCheck,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { actions, useAppState } from "@/lib/store";
import { vendorImageFor } from "@/lib/images";
import { safeHttpUrl } from "@/lib/safeUrl";
import { getSupabase } from "@/lib/supabase";
import {
  REGION_LABELS,
  VENDOR_TYPE_LABELS,
  type Vendor,
  type VendorReview,
} from "@/lib/types";
import { VendorRatingSummary } from "./VendorRatingSummary";
import { ReviewCard } from "./ReviewCard";
import { ReviewForm } from "./ReviewForm";
import { similarVendors } from "@/lib/vendorRanking";
import { VENDORS } from "@/lib/vendors";
import {
  buildVendorContactMessage,
  buildVendorWhatsappUrl,
} from "@/lib/vendorContactMessage";
import { getTipsForType } from "@/lib/vendorTips";
import { showToast } from "@/components/Toast";
import { FacebookGlyph, InstagramGlyph } from "./typeIcons";

interface VendorQuickLookProps {
  vendor: Vendor;
  onClose: () => void;
  onChat: (vendor: Vendor) => void;
  onPick: (vendor: Vendor) => void;
}

const GALLERY_INDICES = [0, 1, 2];

export function VendorQuickLook({ vendor, onClose, onChat, onPick }: VendorQuickLookProps) {
  const reducedMotion = useReducedMotion();
  const { state } = useAppState();
  const [imgIdx, setImgIdx] = useState(0);
  // R10: free-form text the user can append to the WhatsApp pre-fill. Stays
  // local — we don't persist drafts because each vendor reach-out is
  // single-shot and the boilerplate already mentions Momentum + event facts.
  const [customNote, setCustomNote] = useState("");
  // R20 Phase 8 — vendor reviews. The "הוסף דירוג" button only appears for
  // hosts that actually closed a deal with this vendor (savedVendors row
  // with status="paid"). reviews are sorted by helpful then recency.
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const hadEventWithVendor =
    state.savedVendors?.some(
      (v) => v.vendorId === vendor.id && v.status === "paid",
    ) ?? false;
  const loadReviews = useCallback(() => {
    // R11 P1 #12 — wipe the previous vendor's reviews before fetching.
    // Without this, jumping from vendor A's modal to B briefly shows A's
    // reviews while B's network request is in flight.
    setReviews([]);
    const supabase = getSupabase();
    if (!supabase) return;
    (async () => {
      const { data } = (await supabase
        .from("vendor_reviews")
        .select("*")
        .eq("vendor_id", vendor.id)
        .eq("is_published", true)
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10)) as { data: VendorReview[] | null };
      setReviews(data ?? []);
    })();
  }, [vendor.id]);
  useEffect(() => {
    // Load on mount + whenever the vendor changes. The R11 P1 #12 fix
    // added a synchronous `setReviews([])` reset inside loadReviews, so
    // the strict-mode rule now (correctly) flags this — disable matches
    // the documented "load on mount" pattern used elsewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReviews();
  }, [loadReviews]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close + focus trap. Body scroll lock so the page underneath doesn't
  // move when scrolling the modal content.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the close button after the dialog mounts so screen readers anchor here.
    window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const galleryImages = useMemo(
    () => GALLERY_INDICES.map((i) => vendorImageFor(vendor.type, i)),
    [vendor.type],
  );

  const similar = useMemo(() => similarVendors(VENDORS, vendor, 3), [vendor]);

  const selected = state.selectedVendors.includes(vendor.id);
  const inCompare = state.compareVendors.includes(vendor.id);
  const compareDisabled = !inCompare && state.compareVendors.length >= 3;

  // R10 — WhatsApp pre-fill helpers. Memoized on (vendor, event, guests, note)
  // so we don't rebuild the message string on every render.
  const confirmedGuests = useMemo(
    () =>
      state.guests
        .filter((g) => g.status === "confirmed")
        .reduce((sum, g) => sum + (g.attendingCount || 1), 0),
    [state.guests],
  );
  const contactMessage = useMemo(
    () =>
      buildVendorContactMessage({
        vendorName: vendor.name,
        event: state.event,
        confirmedGuests,
        customNote,
      }),
    [vendor.name, state.event, confirmedGuests, customNote],
  );
  const tips = useMemo(() => getTipsForType(vendor.type), [vendor.type]);

  const handleSendWhatsapp = () => {
    const { url, valid } = buildVendorWhatsappUrl(vendor.phone, contactMessage);
    if (!valid) {
      // Phone failed normalization — wa.me opens without recipient and the
      // user pastes/picks. We tell them so the empty contact field doesn't
      // look like a bug.
      showToast("מספר הטלפון לא תקין — מעבר ל-WhatsApp ידני", "info");
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyMessage = async () => {
    // navigator.clipboard requires a secure context (HTTPS or localhost) and
    // permissions can be revoked. Fall back to a toast on failure rather
    // than silently dropping the user's intent.
    try {
      await navigator.clipboard.writeText(contactMessage);
      showToast("ההודעה הועתקה", "success");
    } catch {
      showToast("לא הצלחנו להעתיק", "error");
    }
  };

  const igHandle = vendor.instagram?.replace(/^@/, "");
  const igUrl = igHandle ? safeHttpUrl(`https://instagram.com/${encodeURIComponent(igHandle)}`) : undefined;
  const fbUrl = vendor.facebook
    ? vendor.facebook.startsWith("http")
      ? safeHttpUrl(vendor.facebook)
      : safeHttpUrl(`https://facebook.com/${encodeURIComponent(vendor.facebook)}`)
    : undefined;
  const webUrl = safeHttpUrl(vendor.website);

  const prevImg = () => setImgIdx((i) => (i - 1 + galleryImages.length) % galleryImages.length);
  const nextImg = () => setImgIdx((i) => (i + 1) % galleryImages.length);

  // R19 P2#9: memoize the swipe-handler object so the gallery `<div>` doesn't
  // remount touch listeners on every render. The previous inline-call to
  // `swipeProps(prevImg, nextImg)` created a fresh object spread each render,
  // which is fine functionally but generates GC churn during the open
  // animation.
  //
  // useRef for startX/active instead of closure-let — React 19's stricter
  // hooks rule (`react-hooks/immutability`) forbids reassigning closed-over
  // variables after render, and refs are the documented escape hatch for
  // mutable values that don't drive renders.
  const swipeStartXRef = useRef(0);
  const swipeActiveRef = useRef(false);
  const swipeHandlers = useMemo(
    () => ({
      onTouchStart: (e: React.TouchEvent) => {
        swipeStartXRef.current = e.touches[0].clientX;
        swipeActiveRef.current = true;
      },
      onTouchEnd: (e: React.TouchEvent) => {
        if (!swipeActiveRef.current) return;
        swipeActiveRef.current = false;
        const dx = e.changedTouches[0].clientX - swipeStartXRef.current;
        const THRESHOLD = 32;
        // RTL: drag finger left-to-right (dx > 0) = previous; right-to-left = next.
        if (dx > THRESHOLD) prevImg();
        else if (dx < -THRESHOLD) nextImg();
      },
    }),
    // Empty deps — handlers reference prevImg/nextImg via the closure each
    // render. Those functions themselves only read setImgIdx (stable) +
    // galleryImages.length, which is constant per vendor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div
      // R13 — center the modal on every screen size. Previously the
      // mobile breakpoint (<640px) used `items-end` (bottom-sheet style)
      // which combined with R12's body padding-bottom looked "stuck" at
      // the bottom of the screen and never opened in the middle as users
      // expected. The R12 body padding also pushed the bottom edge of
      // the sheet up off the screen on iOS Safari.
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ql-title"
        initial={reducedMotion ? false : { y: 20, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={reducedMotion ? undefined : { y: 20, opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
        // max-h capped so the modal always fits the visible viewport
        // (uses `dvh` — dynamic vh, which honors the iOS toolbar).
        // `my-auto` centers it when content is short.
        className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl my-auto"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gallery */}
        <div className="relative aspect-[16/9] overflow-hidden" {...swipeHandlers}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={imgIdx}
            src={galleryImages[imgIdx]}
            alt={`${vendor.name} — תמונה ${imgIdx + 1}`}
            loading="eager"
            decoding="async"
            width={1200}
            height={675}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="סגור תצוגה מהירה"
            className="absolute top-3 end-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 text-white inline-flex items-center justify-center hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
          >
            <X size={16} aria-hidden />
          </button>

          {galleryImages.length > 1 && (
            <>
              {/* R14 BUG#1: in RTL the right-pointing arrow means "go back"
                  (toward earlier content) and the left-pointing arrow means
                  "go forward". The handlers were swapped — fixed now. The
                  icon stays where it is (start-3 = right side in RTL renders
                  ArrowRight); only the wired action moved. */}
              <button
                type="button"
                onClick={prevImg}
                aria-label="התמונה הקודמת"
                className="absolute start-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 text-white inline-flex items-center justify-center hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
              >
                <ArrowRight size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={nextImg}
                aria-label="התמונה הבאה"
                className="absolute end-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 text-white inline-flex items-center justify-center hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
              >
                <ArrowLeft size={16} aria-hidden />
              </button>
              <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5" aria-hidden>
                {galleryImages.map((_, i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full transition"
                    style={{ background: i === imgIdx ? "var(--accent)" : "rgba(255,255,255,0.4)" }}
                  />
                ))}
              </div>
            </>
          )}

          <div className="absolute top-3 start-3 flex items-center gap-2">
            {vendor.inCatalog && (
              <span className="pill pill-gold">
                <ShieldCheck size={11} /> בקטלוג
              </span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ql-title" className="text-2xl md:text-3xl font-extrabold tracking-tight">
                {vendor.name}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--foreground-muted)" }}>
                {VENDOR_TYPE_LABELS[vendor.type]} · {REGION_LABELS[vendor.region]}
              </p>
            </div>
            <div className="text-end">
              <div className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>החל מ-</div>
              <div className="text-2xl font-extrabold gradient-gold ltr-num">
                ₪{vendor.priceFrom.toLocaleString("he-IL")}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 flex-wrap text-sm" style={{ color: "var(--foreground-soft)" }}>
            <div className="inline-flex items-center gap-1">
              <Star size={14} className="text-[--accent]" fill="currentColor" aria-hidden />
              <span className="font-bold ltr-num">{vendor.rating}</span>
              <span className="ltr-num" style={{ color: "var(--foreground-muted)" }}>({vendor.reviews} ביקורות)</span>
            </div>
            {/* R20 Phase 8 — real-user rating summary (compact pill). Sits
                next to the catalog rating so the user can compare. */}
            <VendorRatingSummary vendorId={vendor.id} compact />
          </div>

          <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
            {vendor.description}
          </p>

          {/* All tags (no slice). */}
          {vendor.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5" aria-label="תגיות">
              {vendor.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-white/60"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Action grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* R7: replaces the heart "save to favorites" with the new
                "add to my list" semantic. The visual is wider so the full
                Hebrew label fits inside the modal action grid. */}
            <button
              type="button"
              onClick={() => {
                actions.toggleVendor(vendor.id);
                onPick(vendor);
              }}
              className={`rounded-2xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] ${
                selected ? "btn-gold" : "btn-secondary"
              }`}
              aria-pressed={selected}
              aria-label={selected ? "הסר מהרשימה שלך" : "הוסף לרשימה שלך"}
            >
              {selected ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
              {selected ? "ברשימה שלי" : "הוסף לרשימה שלי"}
            </button>
            <button
              type="button"
              onClick={() => actions.toggleCompareVendor(vendor.id)}
              disabled={compareDisabled}
              className="rounded-2xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
              style={{
                background: inCompare ? "var(--accent)" : "var(--input-bg)",
                color: inCompare ? "#000" : "var(--foreground)",
                border: `1px solid ${inCompare ? "var(--accent)" : "var(--border)"}`,
              }}
              aria-pressed={inCompare}
              aria-label={inCompare ? "הסר מהשוואה" : "הוסף להשוואה"}
            >
              <Trophy size={14} aria-hidden />
              {inCompare ? "בהשוואה" : "השוואה"}
            </button>
            <button
              type="button"
              onClick={() => onChat(vendor)}
              className="btn-secondary rounded-2xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
              aria-label={`שלח הודעה ל${vendor.name}`}
            >
              <MessageCircle size={14} aria-hidden />
              צ׳אט
            </button>
            {/* R14 BUG#2: hide the call button entirely when the phone is
                missing or whitespace. The Vendor type has phone as required
                but seed/placeholder rows have shipped with empty strings —
                rendering tel: with an empty value would dial nothing. */}
            {vendor.phone && vendor.phone.trim() ? (
              <a
                href={`tel:${vendor.phone}`}
                className="btn-secondary rounded-2xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                aria-label={`התקשר ל${vendor.name}`}
              >
                <Phone size={14} aria-hidden />
                התקשר
              </a>
            ) : (
              <span
                className="btn-secondary rounded-2xl py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
                aria-disabled="true"
                title="אין מספר טלפון לעסק הזה"
              >
                <Phone size={14} aria-hidden />
                אין טלפון
              </span>
            )}
          </div>

          {/* External links */}
          {(igUrl || fbUrl || webUrl) && (
            <div className="mt-4 flex items-center gap-2">
              {igUrl && (
                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-3 py-2 text-xs inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                  aria-label={`${vendor.name} באינסטגרם`}
                >
                  <span className="text-white/70"><InstagramGlyph /></span>
                  Instagram
                </a>
              )}
              {fbUrl && (
                <a
                  href={fbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-3 py-2 text-xs inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                  aria-label={`${vendor.name} בפייסבוק`}
                >
                  <span className="text-white/70"><FacebookGlyph /></span>
                  Facebook
                </a>
              )}
              {webUrl && (
                <a
                  href={webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-3 py-2 text-xs inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                  aria-label={`אתר של ${vendor.name}`}
                >
                  <Globe size={12} className="text-white/70" aria-hidden />
                  אתר
                </a>
              )}
            </div>
          )}

          {/* R10 — WhatsApp pre-fill section. Sits below the action grid +
              social links so the modal scans top-down: identity → quick
              actions → "send a real inquiry" → tips. The message body is
              auto-built from buildVendorContactMessage and the user can
              append a custom note before sending. */}
          <section
            className="mt-6 rounded-2xl p-5"
            style={{ background: "rgba(212,176,104,0.07)", border: "1px solid var(--border-gold)" }}
          >
            <h3 className="font-bold text-base inline-flex items-center gap-2">
              <MessageCircle size={18} className="text-[--accent]" aria-hidden />
              שלח הצעת מחיר ב-WhatsApp
            </h3>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
              ההודעה תכלול אוטומטית את שם האפליקציה, פרטי האירוע שלך, ובקשה להצעת מחיר.
            </p>

            <div className="mt-4">
              <label
                htmlFor="ql-custom-note"
                className="text-xs block mb-1.5"
                style={{ color: "var(--foreground-soft)" }}
              >
                הוסף הודעה אישית (אופציונלי)
              </label>
              <textarea
                id="ql-custom-note"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="לדוגמה: 'נשמח לדבר על אופציות תפריט צמחוני'"
                className="input"
                style={{ resize: "none" }}
              />
              <div
                className="text-[10px] text-end mt-1 ltr-num"
                style={{ color: "var(--foreground-muted)" }}
              >
                {customNote.length}/300
              </div>
            </div>

            {/* Read-only preview of the final message — gives the user a
                visual confirmation of what'll actually be sent before they
                tap "Send". Pre-wrapped to honor the line breaks from the builder. */}
            <details className="mt-2 group">
              <summary
                className="cursor-pointer list-none text-xs inline-flex items-center gap-1.5 font-semibold"
                style={{ color: "var(--accent)" }}
              >
                <span className="group-open:rotate-90 transition inline-block">▸</span>
                תצוגה מקדימה של ההודעה
              </summary>
              <pre
                className="mt-2 text-[12px] leading-relaxed whitespace-pre-wrap rounded-xl p-3 font-sans"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground-soft)",
                  direction: "rtl",
                }}
              >
                {contactMessage}
              </pre>
            </details>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}
                aria-label="העתק את ההודעה ללוח"
              >
                <Copy size={14} aria-hidden /> העתק הודעה
              </button>
              <button
                type="button"
                onClick={handleSendWhatsapp}
                className="inline-flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                style={{ background: "rgb(34 197 94)", color: "#000" }}
                aria-label={`שלח הודעת WhatsApp ל${vendor.name}`}
              >
                <Send size={14} aria-hidden /> שלח ב-WhatsApp
              </button>
            </div>
          </section>

          {/* R10 — Tips for this vendor type. Pulled from VENDOR_TIPS keyed
              on the real VendorType enum; types without a dedicated set
              (kids/security/...) get the generic "always demand a contract"
              advice via getTipsForType's fallback. */}
          {tips.length > 0 && (
            <section className="mt-7">
              <h3 className="font-bold text-base inline-flex items-center gap-2">
                <Lightbulb size={18} className="text-amber-400" aria-hidden />
                טיפים לבחירת {VENDOR_TYPE_LABELS[vendor.type]}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {tips.map((tip, i) => (
                  <li key={i} className="flex gap-2.5 items-start text-sm">
                    <span className="text-lg shrink-0 leading-none mt-0.5" aria-hidden>
                      {tip.icon}
                    </span>
                    <span style={{ color: "var(--foreground-soft)" }}>{tip.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Similar vendors */}
          {similar.length > 0 && (
            <div className="mt-7 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold text-sm">ספקים דומים</h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {similar.map((s, i) => (
                  <Link
                    key={s.id}
                    href={`/vendors?vendor=${encodeURIComponent(s.id)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onPick(s);
                    }}
                    className="rounded-2xl p-3 text-start hover:bg-white/[0.04] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                    style={{ border: "1px solid var(--border)", background: "var(--input-bg)" }}
                  >
                    <div className="aspect-[16/10] rounded-xl overflow-hidden mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={vendorImageFor(s.type, i + 4)}
                        alt={s.name}
                        loading="lazy"
                        decoding="async"
                        width={400}
                        height={250}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-[11px] mt-0.5 inline-flex items-center gap-1" style={{ color: "var(--foreground-muted)" }}>
                      <Star size={10} className="text-[--accent]" fill="currentColor" aria-hidden />
                      <span className="ltr-num">{s.rating}</span> ·{" "}
                      <span className="ltr-num">₪{s.priceFrom.toLocaleString("he-IL")}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* R20 Phase 8 — vendor reviews. Always renders the summary card
              (handles its own empty state). "הוסף דירוג" only appears for
              hosts that closed a deal with this vendor — keeps the system
              gated to verified customers. */}
          <section className="mt-7">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Star size={20} className="text-[--accent]" aria-hidden /> דירוגים מלקוחות
              </h3>
              {hadEventWithVendor && (
                <button
                  type="button"
                  onClick={() => setShowReviewForm(true)}
                  className="btn-gold text-xs px-4 py-2"
                >
                  הוסף דירוג
                </button>
              )}
            </div>
            <VendorRatingSummary vendorId={vendor.id} />
            {reviews.length > 0 && (
              <div className="mt-4 space-y-3">
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.div>
      {showReviewForm && state.event && (
        <ReviewForm
          vendorId={vendor.id}
          vendorName={vendor.name}
          eventId={state.event.id}
          onClose={() => setShowReviewForm(false)}
          onSubmitted={() => {
            setShowReviewForm(false);
            loadReviews();
          }}
        />
      )}
    </div>
  );
}

// R19 P2#9 — the standalone `swipeProps()` helper was inlined into the
// `swipeHandlers` useMemo above (RTL math + threshold copied verbatim).
// Removed to avoid dead code drift between the two copies.
