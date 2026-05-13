"use client";

import { useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { sanitizeFilename } from "@/lib/vendorStudio";
import { showToast } from "@/components/Toast";
import {
  RECOMMEND_TAGS,
  REVIEW_HIGHLIGHTS,
  REVIEW_CONCERNS,
} from "@/lib/types";
import { StarRating } from "./StarRating";

interface ReviewFormProps {
  vendorId: string;
  vendorName: string;
  eventId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

type Step = "ratings" | "details" | "media";

/**
 * 3-step "publish a review" modal. The host walks through:
 *   1. Star ratings (overall required, 4 sub-axes optional)
 *   2. Title + freeform text + highlights/concerns chips + price disclosure
 *   3. Photos + would-recommend + tags
 *
 * Photos upload to the public `vendor-reviews` bucket first (so they get a
 * real path); the row is inserted last with the resulting paths.
 */
export function ReviewForm({
  vendorId,
  vendorName,
  eventId,
  onClose,
  onSubmitted,
}: ReviewFormProps) {
  const [step, setStep] = useState<Step>("ratings");
  const [overall, setOverall] = useState(0);
  const [quality, setQuality] = useState(0);
  const [value, setValue] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [highlights, setHighlights] = useState<string[]>([]);
  const [concerns, setConcerns] = useState<string[]>([]);
  const [agreedPrice, setAgreedPrice] = useState("");
  const [initialQuote, setInitialQuote] = useState("");
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [recommendTags, setRecommendTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (arr: string[], val: string, setter: (a: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const stepIndex = step === "ratings" ? 1 : step === "details" ? 2 : 3;

  const handleSubmit = async () => {
    // R11 P0 #4 — bail on a second click while the first is in flight.
    // Without this, double-tapping "פרסם" creates two rows that the DB
    // unique constraint then rejects with a confusing message.
    if (submitting) return;
    if (overall === 0) {
      showToast("חובה לתת דירוג כללי", "error");
      return;
    }
    setSubmitting(true);

    const supabase = getSupabase();
    if (!supabase) {
      showToast("השירות לא זמין", "error");
      setSubmitting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("צריך להתחבר", "error");
      setSubmitting(false);
      return;
    }

    // Upload photos first — storage path is keyed by user id so the RLS
    // policy on storage.objects (first folder must equal auth.uid()) lets
    // the upload through.
    const photoPaths: string[] = [];
    for (const photo of photos) {
      const stamp = Date.now();
      // Sanitize the filename so Hebrew / spaces don't produce broken URLs.
      const path = `${user.id}/${vendorId}/${stamp}-${sanitizeFilename(photo.name)}`;
      const { error: uploadErr } = await supabase.storage
        .from("vendor-reviews")
        .upload(path, photo);
      if (uploadErr) {
        console.error("[ReviewForm] photo upload failed", uploadErr);
        continue;
      }
      photoPaths.push(path);
    }

    const { error } = (await supabase
      .from("vendor_reviews")
      .insert({
        vendor_id: vendorId,
        vendor_name: vendorName,
        user_id: user.id,
        event_id: eventId,
        overall_rating: overall,
        quality_rating: quality || null,
        value_rating: value || null,
        communication_rating: communication || null,
        punctuality_rating: punctuality || null,
        title: title.trim() || null,
        review_text: text.trim() || null,
        highlights,
        concerns,
        // R12 §3Q — strip commas/whitespace before parseFloat. Israelis
        // commonly type "12,500" or "12 500"; parseFloat would clip those
        // to 12 silently.
        agreed_price: (() => {
          const cleaned = agreedPrice.replace(/[,\s]/g, "");
          if (!cleaned) return null;
          const n = parseFloat(cleaned);
          if (!Number.isFinite(n) || n < 0) return null;
          return Math.round(n * 100);
        })(),
        initial_quote: (() => {
          const cleaned = initialQuote.replace(/[,\s]/g, "");
          if (!cleaned) return null;
          const n = parseFloat(cleaned);
          if (!Number.isFinite(n) || n < 0) return null;
          return Math.round(n * 100);
        })(),
        would_recommend: recommend,
        recommend_tags: recommendTags,
        photo_paths: photoPaths,
      } as unknown as never)) as { error: { message: string } | null };

    if (error) {
      // R11 P0 #4 — clean up the uploaded photos so we don't leak orphan
      // files in Storage. Best-effort; we already lost the row and the
      // user will see the error toast either way.
      if (photoPaths.length > 0) {
        const { error: cleanupErr } = await supabase.storage
          .from("vendor-reviews")
          .remove(photoPaths);
        if (cleanupErr) {
          console.error("[ReviewForm] orphan-photo cleanup failed", cleanupErr);
        }
      }
      // Hint at the most likely failure mode (RPC / migration not run) so
      // the host doesn't get stuck on a generic Postgres message.
      const raw = error.message ?? "";
      let userError = raw;
      if (/does not exist|relation .* does not exist/i.test(raw)) {
        userError =
          "טבלת הביקורות לא קיימת. הרץ את 2026-05-12-vendor-reviews.sql ב-Supabase.";
      } else if (/permission|policy|rls/i.test(raw)) {
        userError = "אין הרשאה לפרסם ביקורת. וודא שהתחברת.";
      } else if (/duplicate|unique/i.test(raw)) {
        userError = "כבר פרסמת ביקורת עבור הספק הזה באירוע הזה.";
      }
      showToast(userError, "error");
      setSubmitting(false);
      return;
    }

    showToast("הדירוג שלך נשמר. תודה שתרמת!", "success");
    onSubmitted();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="review-form-title"
    >
      <div
        className="w-full max-w-lg rounded-3xl my-8 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div
                className="text-xs uppercase tracking-wide"
                style={{ color: "var(--accent)" }}
              >
                דירוג ספק
              </div>
              <h2 id="review-form-title" className="mt-1 text-xl font-bold">
                {vendorName}
              </h2>
              <div
                className="mt-1 text-xs ltr-num"
                style={{ color: "var(--foreground-muted)" }}
              >
                שלב {stepIndex} מתוך 3
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              className="p-2 rounded-lg hover:bg-white/5"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {step === "ratings" && (
            <div className="space-y-5">
              <div>
                <div className="font-semibold mb-2">דירוג כללי *</div>
                <StarRating value={overall} onChange={setOverall} size={32} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <RatingField label="איכות" value={quality} onChange={setQuality} />
                <RatingField label="יחס מחיר" value={value} onChange={setValue} />
                <RatingField
                  label="תקשורת"
                  value={communication}
                  onChange={setCommunication}
                />
                <RatingField
                  label="דייקנות"
                  value={punctuality}
                  onChange={setPunctuality}
                />
              </div>
              <button
                type="button"
                onClick={() => setStep("details")}
                disabled={overall === 0}
                className="btn-gold w-full py-3 disabled:opacity-50"
              >
                המשך
              </button>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <label className="block">
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  כותרת קצרה (אופציונלי)
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                  maxLength={80}
                />
              </label>

              <label className="block">
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  הביקורת המלאה
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  className="input"
                  maxLength={1500}
                  placeholder="ספר לנו איך היה — מה אהבת, מה היה פחות..."
                />
              </label>

              <div>
                <div
                  className="text-xs mb-2"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  נקודות חזקות
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {REVIEW_HIGHLIGHTS.map((h) => {
                    const active = highlights.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => toggle(highlights, h, setHighlights)}
                        className={`text-xs px-3 py-1.5 rounded-full transition border ${
                          active
                            ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/40"
                            : "text-[--foreground-soft]"
                        }`}
                        style={
                          active
                            ? undefined
                            : {
                                background: "var(--input-bg)",
                                borderColor: "var(--border)",
                              }
                        }
                      >
                        {active && "✓ "}
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div
                  className="text-xs mb-2"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  נקודות לשיפור (אופציונלי)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {REVIEW_CONCERNS.map((c) => {
                    const active = concerns.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggle(concerns, c, setConcerns)}
                        className={`text-xs px-3 py-1.5 rounded-full transition border ${
                          active
                            ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                            : "text-[--foreground-soft]"
                        }`}
                        style={
                          active
                            ? undefined
                            : {
                                background: "var(--input-bg)",
                                borderColor: "var(--border)",
                              }
                        }
                      >
                        {active && "✓ "}
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span
                    className="text-xs block mb-1.5"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    מחיר ראשוני (₪)
                  </span>
                  <input
                    type="number"
                    value={initialQuote}
                    onChange={(e) => setInitialQuote(e.target.value)}
                    className="input ltr-num"
                  />
                </label>
                <label className="block">
                  <span
                    className="text-xs block mb-1.5"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    מחיר שסגרת (₪)
                  </span>
                  <input
                    type="number"
                    value={agreedPrice}
                    onChange={(e) => setAgreedPrice(e.target.value)}
                    className="input ltr-num"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStep("ratings")}
                  className="rounded-2xl py-3 text-sm"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  חזרה
                </button>
                <button
                  type="button"
                  onClick={() => setStep("media")}
                  className="btn-gold py-3 text-sm"
                >
                  המשך
                </button>
              </div>
            </div>
          )}

          {step === "media" && (
            <div className="space-y-5">
              <div>
                <div className="font-semibold mb-2">תמליץ עליו לחברים?</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecommend(true)}
                    className={`rounded-2xl py-4 text-sm font-bold transition ${
                      recommend === true
                        ? "bg-emerald-500 text-black"
                        : "border"
                    }`}
                    style={
                      recommend === true
                        ? undefined
                        : {
                            background: "var(--input-bg)",
                            borderColor: "var(--border)",
                          }
                    }
                  >
                    ✓ בהחלט!
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecommend(false)}
                    className={`rounded-2xl py-4 text-sm font-bold transition ${
                      recommend === false
                        ? "bg-red-500/30 text-red-300 border border-red-500/40"
                        : "border"
                    }`}
                    style={
                      recommend === false
                        ? undefined
                        : {
                            background: "var(--input-bg)",
                            borderColor: "var(--border)",
                          }
                    }
                  >
                    לא ממליץ
                  </button>
                </div>
              </div>

              {recommend && (
                <div>
                  <div
                    className="text-xs mb-2"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    למי הוא מתאים?
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RECOMMEND_TAGS.map((t) => {
                      const active = recommendTags.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggle(recommendTags, t.id, setRecommendTags)}
                          className={`text-xs px-3 py-1.5 rounded-full transition border ${
                            active ? "text-[--accent]" : "text-[--foreground-soft]"
                          }`}
                          style={
                            active
                              ? {
                                  background: "rgba(212,176,104,0.18)",
                                  borderColor: "var(--border-gold)",
                                }
                              : {
                                  background: "var(--input-bg)",
                                  borderColor: "var(--border)",
                                }
                          }
                        >
                          {t.emoji} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block">
                  <span
                    className="text-xs block mb-2"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    תמונות מהאירוע (אופציונלי, עד 5)
                  </span>
                  <span
                    className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed cursor-pointer hover:bg-white/5 transition"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Camera size={20} className="text-[--accent]" aria-hidden />
                    <span className="text-sm">צרף עד 5 תמונות</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        // R11 P1 #7 — validate each file: cap 5MB, only
                        // real raster formats (no SVG, no HTML pretending
                        // to be an image).
                        const allFiles = Array.from(e.target.files ?? []);
                        const valid: File[] = [];
                        for (const f of allFiles.slice(0, 5)) {
                          if (!/^image\/(jpeg|jpg|png|webp)$/.test(f.type)) {
                            showToast(`${f.name} לא תמונה תקנית`, "error");
                            continue;
                          }
                          if (f.size > 5 * 1024 * 1024) {
                            showToast(`${f.name} גדול מ-5MB`, "error");
                            continue;
                          }
                          valid.push(f);
                        }
                        setPhotos(valid);
                      }}
                    />
                  </span>
                  {photos.length > 0 && (
                    <div
                      className="mt-2 text-xs ltr-num"
                      style={{ color: "var(--accent)" }}
                    >
                      {photos.length} תמונות נבחרו
                    </div>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="rounded-2xl py-3 text-sm"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  חזרה
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                  className="btn-gold py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={16} aria-hidden />
                  ) : (
                    <>
                      <Check size={16} aria-hidden /> פרסם דירוג
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RatingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="text-xs mb-1.5" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </div>
      <StarRating value={value} onChange={onChange} size={22} />
    </div>
  );
}
