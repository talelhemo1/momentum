"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { VendorType } from "@/lib/types";
import { VENDOR_TYPE_LABELS } from "@/lib/types";
import { vendorTypeIcon } from "./typeIcons";

interface CategoryRailProps {
  /** Ordered list of types to display (recommended ones first). */
  types: VendorType[];
  /** Currently-selected type, or "all". */
  active: VendorType | "all";
  onChange: (next: VendorType | "all") => void;
  /** Optional per-type vendor counts; null/undefined hides the count. */
  countByType?: Partial<Record<VendorType, number>>;
}

export function CategoryRail({ types, active, onChange, countByType }: CategoryRailProps) {
  return (
    <nav
      role="tablist"
      aria-label="קטגוריות ספקים"
      className="mt-5 flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 snap-x snap-mandatory"
    >
      <CategoryChip active={active === "all"} onClick={() => onChange("all")} label="הכל" />
      {types.map((t) => (
        <CategoryChip
          key={t}
          active={active === t}
          onClick={() => onChange(t)}
          label={VENDOR_TYPE_LABELS[t]}
          count={countByType?.[t]}
          icon={vendorTypeIcon(t, 16)}
        />
      ))}
    </nav>
  );
}

interface CategoryChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

function CategoryChip({ active, onClick, label, count, icon }: CategoryChipProps) {
  const reducedMotion = useReducedMotion();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative shrink-0 snap-start rounded-full border px-4 py-3 text-sm transition inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] ${
        active
          ? "border-transparent"
          : "hover:bg-[var(--secondary-button-bg)]"
      }`}
      style={
        active
          ? undefined
          : { borderColor: "var(--border)", color: "var(--foreground-soft)", background: "var(--input-bg)" }
      }
    >
      {/* Shared layoutId pill — slides between chips when selection changes. */}
      {active && (
        <motion.span
          layoutId="active-chip"
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 380, damping: 30 }
          }
        />
      )}
      <span className="relative inline-flex items-center gap-2">
        {icon && <span className={active ? "text-[--accent]" : ""}>{icon}</span>}
        <span className="font-medium">{label}</span>
        {count !== undefined && (
          <span className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>({count})</span>
        )}
      </span>
    </button>
  );
}
