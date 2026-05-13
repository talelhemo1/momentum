"use client";

import { Star } from "lucide-react";

/**
 * Interactive star rating — supports decimal values for read-only display
 * (a 4.3 average shows 4 filled stars). Click-to-rate when `onChange` is
 * provided; otherwise renders as static visual.
 */
interface StarRatingProps {
  /** 0-5, supports decimals. */
  value: number;
  onChange?: (n: number) => void;
  size?: number;
  readonly?: boolean;
  showNumber?: boolean;
}

export function StarRating({
  value,
  onChange,
  size = 20,
  readonly = false,
  showNumber = false,
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  const isInteractive = !readonly && !!onChange;

  return (
    <div className="inline-flex items-center gap-0.5">
      {stars.map((n) => {
        const filled = n <= Math.floor(value);
        const partial = !filled && n - 0.5 <= value;
        const showAsFilled = filled || partial;
        return (
          <button
            key={n}
            type="button"
            disabled={!isInteractive}
            onClick={isInteractive ? () => onChange(n) : undefined}
            aria-label={`${n} כוכבים`}
            className={`p-0.5 transition ${
              isInteractive
                ? "cursor-pointer hover:scale-110"
                : "cursor-default"
            }`}
          >
            <Star
              size={size}
              fill={showAsFilled ? "var(--accent)" : "transparent"}
              color={showAsFilled ? "var(--accent)" : "var(--foreground-muted)"}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
        );
      })}
      {showNumber && (
        <span
          className="ms-2 text-sm font-bold ltr-num"
          style={{ color: "var(--accent)" }}
        >
          {value.toFixed(1)}
        </span>
      )}
    </div>
  );
}
