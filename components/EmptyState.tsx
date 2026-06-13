"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface CTA {
  label: string;
  href: string;
}
interface SecondaryAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: CTA;
  secondary?: SecondaryAction;
  /** When true the card uses card-gold styling; default uses regular card. */
  emphasis?: boolean;
}

/**
 * Single source of truth for "nothing here yet" panels. Replaces the dozen
 * ad-hoc text-only empty states scattered across the app.
 *
 * Always centered, always RTL, always Hebrew. The icon slot accepts any
 * ReactNode — most callers pass a Lucide icon (size 28).
 */
export function EmptyState({
  icon,
  title,
  description,
  cta,
  secondary,
  emphasis = false,
}: EmptyStateProps) {
  return (
    <div
      className={`mt-6 ${emphasis ? "card-gold" : "card"} p-10 text-center`}
      role="status"
    >
      <div
        aria-hidden
        className="inline-flex w-16 h-16 items-center justify-center mb-4"
        style={{
          background:
            "radial-gradient(circle at 50% 35%, var(--accent-soft), var(--surface-2))",
          color: "var(--accent)",
          border: "1px solid var(--border-gold)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-gold)",
        }}
      >
        {icon}
      </div>
      <h3 className="text-h3 gradient-gold">{title}</h3>
      <p
        className="text-body-sm mt-2 max-w-md mx-auto"
        style={{ color: "var(--foreground-soft)" }}
      >
        {description}
      </p>

      {(cta || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {cta && (
            <Link
              href={cta.href}
              className="btn-gold inline-flex items-center gap-2"
            >
              {cta.label}
              <ArrowLeft size={16} aria-hidden />
            </Link>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="btn-secondary"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
