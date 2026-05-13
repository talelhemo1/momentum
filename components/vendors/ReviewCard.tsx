"use client";

import { useState } from "react";
import { ThumbsUp, ShieldCheck, Calendar } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import {
  RECOMMEND_TAGS,
  type VendorReview,
  type VendorReviewResponse,
} from "@/lib/types";
import { StarRating } from "./StarRating";

/**
 * Single review card. Reads from public `vendor-reviews` bucket for photos
 * — paths are stored as `<user_uuid>/<vendor_id>/<file>` so the public URL
 * is just `${siteUrl}/storage/v1/object/public/vendor-reviews/${path}`.
 *
 * Vendor responses are optional — passed from the parent that may have
 * loaded them in bulk. We render the response below the review body as a
 * quoted bar.
 */
export function ReviewCard({
  review,
  vendorResponse,
}: {
  review: VendorReview;
  vendorResponse?: VendorReviewResponse;
}) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful_count);
  const [marked, setMarked] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const photoUrls = review.photo_paths.map(
    (p) => `${supabaseUrl}/storage/v1/object/public/vendor-reviews/${p}`,
  );

  const handleMarkHelpful = async () => {
    if (marked) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("צריך להתחבר כדי לסמן מועיל", "info");
      return;
    }
    const { error } = (await supabase
      .from("vendor_review_helpful")
      .insert({
        review_id: review.id,
        user_id: user.id,
      } as unknown as never)) as { error: { message?: string; code?: string } | null };
    // Unique-violation = already marked → treat as no-op.
    if (error && error.code !== "23505") {
      console.error("[ReviewCard] mark helpful failed", error);
      return;
    }
    setMarked(true);
    setHelpfulCount((prev) => prev + 1);
  };

  return (
    <article className="card p-5">
      <header className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <StarRating value={review.overall_rating} size={16} readonly />
            {review.is_verified && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                <ShieldCheck size={10} aria-hidden /> אומת
              </span>
            )}
          </div>
          {review.title && <h3 className="mt-2 font-bold">{review.title}</h3>}
        </div>
        {review.event_date && (
          <div
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--foreground-muted)" }}
          >
            <Calendar size={11} aria-hidden />
            {new Date(review.event_date).toLocaleDateString("he-IL", {
              month: "short",
              year: "numeric",
            })}
          </div>
        )}
      </header>

      {review.review_text && (
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--foreground-soft)" }}
        >
          {review.review_text}
        </p>
      )}

      {review.highlights.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.highlights.map((h) => (
            <span
              key={h}
              className="text-[11px] px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-400"
            >
              ✓ {h}
            </span>
          ))}
        </div>
      )}

      {review.concerns.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {review.concerns.map((c) => (
            <span
              key={c}
              className="text-[11px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-400"
            >
              ⚠ {c}
            </span>
          ))}
        </div>
      )}

      {review.recommend_tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.recommend_tags.map((tag) => {
            const t = RECOMMEND_TAGS.find((x) => x.id === tag);
            return t ? (
              <span
                key={tag}
                className="text-[11px] px-2 py-1 rounded-full"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border-gold)",
                }}
              >
                {t.emoji} {t.label}
              </span>
            ) : null;
          })}
        </div>
      )}

      {photoUrls.length > 0 && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {photoUrls.map((url, i) => (
            // Public Supabase Storage URLs — next/image needs a remote-pattern
            // config and we don't transform these; <img> is the right tool.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={`תמונה ${i + 1} מהאירוע`}
              className="w-full aspect-square object-cover rounded-lg"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {(review.agreed_price || review.initial_quote) && (
        <div
          className="mt-3 p-3 rounded-xl flex items-center justify-between text-sm"
          style={{ background: "var(--input-bg)" }}
        >
          {review.initial_quote && (
            <div>
              <span style={{ color: "var(--foreground-muted)" }}>
                הצעה ראשונה:{" "}
              </span>
              <span className="font-bold ltr-num">
                ₪{(review.initial_quote / 100).toLocaleString("he-IL")}
              </span>
            </div>
          )}
          {review.agreed_price && (
            <div>
              <span style={{ color: "var(--foreground-muted)" }}>סגרתי על: </span>
              <span className="font-bold ltr-num gradient-gold">
                ₪{(review.agreed_price / 100).toLocaleString("he-IL")}
              </span>
            </div>
          )}
        </div>
      )}

      {vendorResponse && (
        <div
          className="mt-4 pe-4 border-e-2"
          style={{ borderColor: "var(--border-gold)" }}
        >
          <div
            className="text-[11px] font-bold mb-1"
            style={{ color: "var(--accent)" }}
          >
            תגובת הספק:
          </div>
          <p className="text-xs" style={{ color: "var(--foreground-soft)" }}>
            {vendorResponse.response_text}
          </p>
        </div>
      )}

      <footer
        className="mt-4 pt-3 border-t flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={() => void handleMarkHelpful()}
          disabled={marked}
          className={`inline-flex items-center gap-1.5 text-xs ${
            marked ? "text-emerald-400" : "hover:text-[--accent]"
          }`}
        >
          <ThumbsUp size={12} aria-hidden />
          מועיל{" "}
          {helpfulCount > 0 && (
            <span className="ltr-num">({helpfulCount})</span>
          )}
        </button>
        <span
          className="text-[10px]"
          style={{ color: "var(--foreground-muted)" }}
        >
          {new Date(review.created_at).toLocaleDateString("he-IL")}
        </span>
      </footer>
    </article>
  );
}
