"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { VendorReviewStats } from "@/lib/types";
import { StarRating } from "./StarRating";

/**
 * Reads from the `vendor_review_stats` aggregate view.
 *
 * `compact` mode renders an inline pill (used in vendor card headers);
 * full mode renders the gold "summary" card with star distribution +
 * 4 sub-ratings.
 */

/** Coerce DB numerics (which can arrive as null, NaN, or even string) to
 *  a finite number. Returns 0 for anything that fails. */
function safeNum(n: number | string | null | undefined): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const parsed = Number(n);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
export function VendorRatingSummary({
  vendorId,
  compact = false,
}: {
  vendorId: string;
  compact?: boolean;
}) {
  const [stats, setStats] = useState<VendorReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // R11 P1 #11 — wipe stats from the previous vendor before fetching
    // the new one. Without this, opening vendor A then vendor B shows
    // A's average for a frame while B's request is in flight. The lint
    // disable here covers every setState inside the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setStats(null);

    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = (await supabase
        .from("vendor_review_stats")
        .select("*")
        .eq("vendor_id", vendorId)
        .maybeSingle()) as { data: VendorReviewStats | null };
      if (cancelled) return;
      setStats(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading) {
    return (
      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
        טוען...
      </div>
    );
  }

  if (!stats || stats.total_reviews === 0) {
    return (
      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
        עדיין אין דירוגים
      </div>
    );
  }

  // R11 P1 #13 — the Postgres view returns numerics that supabase-js
  // surfaces as `number | null`. Strings can also slip through if the
  // driver string-encodes wide numerics. Coerce every numeric field to a
  // finite number so the UI never renders "NaN" or crashes on .toFixed.
  const avgRating = safeNum(stats.avg_rating);
  const recommendPercent = safeNum(stats.recommend_percent);

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 text-sm">
        <StarRating value={avgRating} size={14} readonly showNumber />
        <span className="ltr-num" style={{ color: "var(--foreground-muted)" }}>
          ({stats.total_reviews})
        </span>
      </div>
    );
  }

  const total = stats.total_reviews;
  const distribution = [
    { stars: 5, count: safeNum(stats.count_5) },
    { stars: 4, count: safeNum(stats.count_4) },
    { stars: 3, count: safeNum(stats.count_3) },
    { stars: 2, count: safeNum(stats.count_2) },
    { stars: 1, count: safeNum(stats.count_1) },
  ];

  return (
    <div className="card-gold p-5">
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="text-center">
          <div className="text-5xl font-extrabold gradient-gold ltr-num">
            {avgRating.toFixed(1)}
          </div>
          <StarRating value={avgRating} size={20} readonly />
          <div
            className="mt-2 text-xs"
            style={{ color: "var(--foreground-soft)" }}
          >
            <span className="ltr-num">{total}</span> דירוגים ·{" "}
            <span className="ltr-num">{recommendPercent}%</span> ממליצים
          </div>
        </div>

        <div className="space-y-1.5">
          {distribution.map((d) => (
            <div key={d.stars} className="flex items-center gap-2 text-xs">
              <span className="w-3 ltr-num">{d.stars}</span>
              <Star size={10} fill="var(--accent)" color="var(--accent)" aria-hidden />
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ background: "var(--input-bg)" }}
              >
                <div
                  className="h-full bg-[--accent]"
                  style={{
                    width: `${total > 0 ? (d.count / total) * 100 : 0}%`,
                  }}
                />
              </div>
              <span
                className="ltr-num w-6 text-end"
                style={{ color: "var(--foreground-muted)" }}
              >
                {d.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-5 pt-5 border-t grid grid-cols-2 sm:grid-cols-4 gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <SubRating label="איכות" value={safeNum(stats.avg_quality)} />
        <SubRating label="יחס מחיר" value={safeNum(stats.avg_value)} />
        <SubRating label="תקשורת" value={safeNum(stats.avg_communication)} />
        <SubRating label="דייקנות" value={safeNum(stats.avg_punctuality)} />
      </div>
    </div>
  );
}

function SubRating({ label, value }: { label: string; value: number }) {
  // `value` can be null in the DB if no reviews rated this sub-axis. The view
  // converts to NaN in that case; guard the display so we never show "NaN".
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <div className="text-center">
      <div
        className="text-lg font-bold ltr-num"
        style={{ color: safe >= 4 ? "rgb(52,211,153)" : "var(--accent)" }}
      >
        {safe.toFixed(1)}
      </div>
      <div
        className="text-[10px] mt-0.5"
        style={{ color: "var(--foreground-muted)" }}
      >
        {label}
      </div>
    </div>
  );
}
