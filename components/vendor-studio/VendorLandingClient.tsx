"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X, Send, CheckCircle2, Sparkles } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { trackPageAction, trackPageView } from "@/lib/vendorStudio";
import { showToast } from "@/components/Toast";
import type { VendorLandingData, VendorReview } from "@/lib/types";
import { PhoneInput } from "@/components/inputs/PhoneInput";
import { LuxuriousTemplate } from "./templates/LuxuriousTemplate";
// R110 — Modern + Rustic templates removed from the render path.
// They overrode the brand CSS variables with sage/terracotta
// palettes, so any vendor whose `landing_template` was anything
// other than "luxurious" got a page that didn't match the app's
// gold-on-dark identity. Every vendor now renders through
// LuxuriousTemplate so the catalog stays visually coherent.

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

  // R108 — vendor rows synthesized from an application (no real
  // vendor_landings row) carry `owner_user_id = ""` as a signal. The
  // lead-interest modal POSTs to /api/vendors/lead which requires
  // the slug to exist in vendor_landings — for synthesized rows it
  // doesn't, so the POST would 404 with a generic error. Instead we
  // route the primary CTA directly to WhatsApp (the next-best
  // contact channel the application already exposes) so the couple
  // still has a one-click path to reach the vendor.
  const whatsappUrl = buildWhatsappUrl();
  // R135 — "send interest" now always opens the InterestForm wizard,
  // a structured event-brief that builds a polished WhatsApp message
  // tailored to the vendor's category. The old path forked between
  // a Supabase-auth-only lead modal (rejected anonymous visitors)
  // and a one-tap wa.me deep-link (zero context for the vendor).
  // The new wizard works for both audiences: anyone can fill it,
  // the WhatsApp message it generates is rich enough that the
  // vendor can respond intelligently, and the form submission
  // still drops a vendor_leads row + analytics event in the
  // background.
  const onSendInterest = () => setLeadModalOpen(true);

  const sharedProps = {
    vendor,
    reviews,
    onAction: handleAction,
    whatsappUrl,
    telUrl,
    onSendInterest,
  };

  // R110 — `vendor.landing_template` ("luxurious" | "modern" | "rustic")
  // is intentionally ignored. Modern/Rustic re-skinned the page with
  // off-brand sage / terracotta palettes that broke catalog-wide
  // visual consistency. Every vendor now renders through
  // LuxuriousTemplate so the gold-on-dark brand is the only palette
  // a couple ever sees.
  return (
    <>
      <LuxuriousTemplate {...sharedProps} />
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
 * R135 — InterestFormModal. Replaces the previous LeadInterestModal
 * which required Supabase auth and only collected a free-form message
 * — anonymous catalog browsers got bounced to /signup, which is the
 * single highest-friction step you can put between a hot lead and
 * the vendor.
 *
 * The new wizard is one screen of structured questions that takes 30
 * seconds to fill. Each answer maps to a line in a polished Hebrew
 * WhatsApp message; on submit we open wa.me with the message pre-
 * filled so the user just hits send. In the background we also fire
 * a track event so the click + the structured fields land in the
 * vendor's analytics + leads dashboard (the click side-effect comes
 * from R134).
 *
 * Marketing intent: the structured brief makes the WhatsApp first-
 * message look like it came from a buyer who knows what they want.
 * The vendor's reply quality goes up, the booking conversion goes
 * up, and the visitor feels "concierge handled" instead of "form
 * dumped".
 */
const TIMING_OPTIONS = [
  { id: "this-month", label: "החודש", icon: "⚡" },
  { id: "3-months", label: "תוך 3 חודשים", icon: "🗓️" },
  { id: "6-months", label: "תוך 6 חודשים", icon: "📅" },
  { id: "exploring", label: "בודקים עדיין", icon: "🔍" },
] as const;
const GUEST_OPTIONS = [
  { id: "intimate", label: "עד 50", icon: "👤" },
  { id: "medium", label: "50-150", icon: "👥" },
  { id: "large", label: "150-300", icon: "🎉" },
  { id: "huge", label: "300+", icon: "🥳" },
] as const;
const BUDGET_OPTIONS = [
  { id: "skip", label: "מעדיף לשמוע מחיר", icon: "💬" },
  { id: "low", label: "תקציב חסכוני", icon: "💰" },
  { id: "mid", label: "תקציב סטנדרטי", icon: "💎" },
  { id: "high", label: "תקציב פתוח", icon: "✨" },
] as const;
type TimingId = (typeof TIMING_OPTIONS)[number]["id"];
type GuestId = (typeof GUEST_OPTIONS)[number]["id"];
type BudgetId = (typeof BUDGET_OPTIONS)[number]["id"];

function timingToText(id: TimingId | null): string {
  const opt = TIMING_OPTIONS.find((o) => o.id === id);
  return opt?.label ?? "";
}
function guestToText(id: GuestId | null): string {
  const opt = GUEST_OPTIONS.find((o) => o.id === id);
  return opt?.label ? `${opt.label} אורחים` : "";
}
function budgetToText(id: BudgetId | null): string {
  if (!id || id === "skip") return "";
  const opt = BUDGET_OPTIONS.find((o) => o.id === id);
  return opt?.label ?? "";
}

function buildInterestMessage(args: {
  vendorName: string;
  name: string;
  phone: string;
  timing: TimingId | null;
  guests: GuestId | null;
  budget: BudgetId | null;
  note: string;
}): string {
  const lines: string[] = [];
  lines.push(`שלום ${args.vendorName} 👋`);
  lines.push("");
  lines.push("הגעתי דרך Momentum ואני שוקל/ת לפנות אליכם לאירוע שלי.");
  lines.push("");
  if (args.timing) lines.push(`📅 *מתי*: ${timingToText(args.timing)}`);
  if (args.guests) lines.push(`👥 *אורחים*: ${guestToText(args.guests)}`);
  const budgetText = budgetToText(args.budget);
  if (budgetText) lines.push(`💰 *תקציב*: ${budgetText}`);
  if (args.note.trim()) {
    lines.push("");
    lines.push(`📝 *פרטים נוספים*:`);
    lines.push(args.note.trim());
  }
  lines.push("");
  if (args.name.trim() || args.phone.trim()) {
    lines.push(
      `אשמח לשמוע ממכם — ${[args.name.trim(), args.phone.trim()].filter(Boolean).join(" · ")}`,
    );
  } else {
    lines.push("אשמח לשמוע ממכם פרטים על השירות והמחיר 🙏");
  }
  lines.push("");
  lines.push("תודה!");
  return lines.join("\n");
}

function LeadInterestModal({
  vendor,
  onClose,
}: {
  vendor: VendorLandingData;
  onClose: () => void;
}) {
  const [timing, setTiming] = useState<TimingId | null>(null);
  const [guests, setGuests] = useState<GuestId | null>(null);
  const [budget, setBudget] = useState<BudgetId | null>(null);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Best-effort prefill from the auth user (signed-in couples get
  // their name auto-filled). Anonymous visitors just leave it blank.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ?? "";
      if (fullName) setName(fullName);
      else if (user.email) setName(user.email.split("@")[0]);
    })();
  }, []);

  const canSubmit = !!timing && !!guests;

  // R136 — popup blockers REQUIRE window.open to live inside the
  // synchronous call stack of the click handler. Any `await` before
  // it breaks that chain and mobile Safari especially refuses to
  // open the new tab. We do all the prep synchronously, fire
  // window.open, and then let the analytics fetch run in the
  // background.
  const handleSubmit = () => {
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    try {
      const message = buildInterestMessage({
        vendorName: vendor.name,
        name,
        phone,
        timing,
        guests,
        budget,
        note,
      });
      // R136 — Israeli numbers come in many shapes: "+972 53...",
      // "972...", "053-...", "53...". The wa.me URL needs digits
      // only with country code, no leading +. normalizeIsraeliPhone
      // handles the canonical conversion; if the vendor's stored
      // phone won't normalize, fall back to opening WhatsApp with
      // no recipient so the visitor can pick from their contacts —
      // the message text still rides along.
      const normalized = normalizeIsraeliPhone(vendor.phone ?? "");
      const waUrl = normalized.valid
        ? `https://wa.me/${normalized.phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;

      // POPUP FIRST — must run inside the click-handler's sync stack
      // for the new tab to be allowed by mobile browsers.
      window.open(waUrl, "_blank", "noopener,noreferrer");

      // Fire-and-forget analytics + lead drop. R134 piggy-backs a
      // vendor_leads insert onto every actionType=whatsapp event
      // through this route, and R135 resolves the canonical landing
      // UUID + slug so both rows land under the right keys.
      void fetch("/api/vendors/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "action",
          vendorId: vendor.id,
          actionType: "whatsapp",
        }),
        keepalive: true,
      }).catch(() => {
        /* network blip — analytics is best-effort */
      });

      setSuccess(true);
      window.setTimeout(onClose, 2400);
    } catch (e) {
      console.error("[InterestForm] submit failed", e);
      showToast("שגיאה בשליחה — נסה שוב", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // R137 — headless-UI-style centered modal: outer fixed overlay
    // owns the scroll, inner min-h-full flex container centers the
    // card both vertically AND when the card overflows the viewport
    // (which the interest form does on mobile, since it has 3 chip
    // groups + 2 inputs + a hint card). Pre-R137 we had `items-
    // center` + `my-auto` + `overflow-y-auto` all on the SAME outer
    // — that combo pushes tall content below the visible area on
    // mobile so the host only sees the bottom half.
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "rgba(8,6,4,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="interest-modal-title"
    >
      {/* R138 — top-anchor with a generous top padding instead of
          full vertical-center. items-center on tall content puts the
          MIDDLE of the modal in the middle of the viewport, which on
          mobile hides the header above the fold — the user opens the
          modal and sees "chip buttons but no title". items-start +
          pt-6 (mobile) / pt-12 (desktop) keeps the title visible
          first; if content overflows, the inside scrolls. */}
      <div className="flex min-h-full items-start justify-center p-4 pt-6 md:pt-12">
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--accent) 10%, var(--surface-1)), var(--surface-1))",
          border: "1px solid var(--border-gold)",
          boxShadow:
            "0 40px 90px -20px rgba(0,0,0,0.7), 0 0 0 1px var(--accent-glow), 0 0 120px -30px var(--accent-glow)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-6 pb-4 flex items-start justify-between gap-3"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent)",
          }}
        >
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.22em] font-bold inline-flex items-center gap-1.5"
              style={{ color: "var(--accent)" }}
            >
              <Sparkles size={11} aria-hidden /> פתיחת שיחה
            </div>
            <h2
              id="interest-modal-title"
              className="mt-1.5 text-xl font-extrabold gradient-gold-shimmer"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              שלח התעניינות ל-{vendor.name}
            </h2>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--foreground-soft)" }}
            >
              30 שניות, הודעת WhatsApp מסודרת — תקבלו תשובה מהירה יותר.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="p-2 rounded-full hover:bg-white/5 shrink-0"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="px-6 pb-6 pt-2">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle2
                size={48}
                className="mx-auto"
                style={{ color: "var(--accent)" }}
                aria-hidden
              />
              <h3 className="mt-3 text-xl font-bold gradient-gold">
                ההודעה נפתחה ב-WhatsApp
              </h3>
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--foreground-soft)" }}
              >
                לחצו &quot;שלח&quot; ב-WhatsApp כדי להעביר את ההודעה לספק.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <ChipGroup
                label="מתי האירוע?"
                required
                options={TIMING_OPTIONS}
                value={timing}
                onChange={setTiming}
              />
              <ChipGroup
                label="כמה אורחים?"
                required
                options={GUEST_OPTIONS}
                value={guests}
                onChange={setGuests}
              />
              <ChipGroup
                label="תקציב?"
                options={BUDGET_OPTIONS}
                value={budget}
                onChange={setBudget}
              />

              <div>
                <label
                  className="block text-xs font-bold mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  הערה לספק (אופציונלי)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="לדוגמה: חתונה בנושא טבע · כשר · יש קונספט מיוחד..."
                  className="input"
                  style={{ resize: "none" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="block text-xs font-bold mb-1.5"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    שם (אופציונלי)
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                    maxLength={80}
                    placeholder="דנה ויואב"
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-bold mb-1.5"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    טלפון (אופציונלי)
                  </label>
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
              </div>

              <div
                className="rounded-xl p-3 text-[11px] leading-relaxed flex items-start gap-2"
                style={{
                  background:
                    "color-mix(in srgb, var(--accent) 6%, transparent)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--foreground-soft)",
                }}
              >
                <Sparkles
                  size={12}
                  aria-hidden
                  className="shrink-0 mt-0.5"
                  style={{ color: "var(--accent)" }}
                />
                <div>
                  אנחנו פותחים לכם את WhatsApp עם הודעה מובנית — תוכלו
                  לערוך לפני השליחה. הספק יקבל את הפרטים בצורה ברורה
                  ויחזור אליכם מהר.
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="btn-gold py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={14} aria-hidden />
                  ) : (
                    <>
                      <Send size={14} aria-hidden /> פתח WhatsApp עם ההודעה
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl px-5 text-sm"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground-soft)",
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * R135 — premium chip-group for picking one option. Used by the
 * interest form for "מתי / כמה / תקציב". Active chip gets the
 * gold-on-dark luxury treatment; inactive stays calm.
 */
function ChipGroup<T extends string>({
  label,
  required,
  options,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  options: ReadonlyArray<{ id: T; label: string; icon: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label
        className="block text-xs font-bold mb-2"
        style={{ color: "var(--foreground-soft)" }}
      >
        {label}{" "}
        {required && (
          <span style={{ color: "var(--accent)" }} aria-hidden>
            *
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className="rounded-xl px-3 py-2.5 text-xs font-bold transition flex flex-col items-center gap-1 hover:scale-[1.03]"
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--surface-2)), color-mix(in srgb, var(--accent) 10%, var(--surface-2)))",
                      border: "1px solid var(--border-gold)",
                      boxShadow:
                        "0 8px 20px -10px var(--accent-glow), inset 0 1px 0 color-mix(in srgb, var(--accent) 24%, transparent)",
                      color: "var(--accent)",
                    }
                  : {
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground-soft)",
                    }
              }
            >
              <span className="text-base leading-none" aria-hidden>
                {opt.icon}
              </span>
              <span className="leading-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
