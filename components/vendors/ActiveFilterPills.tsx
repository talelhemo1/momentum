"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { REGION_LABELS, VENDOR_TYPE_LABELS, type Region, type VendorType } from "@/lib/types";
import { type SortMode, SORT_LABELS, type VendorFilters } from "@/lib/vendorRanking";

interface ActiveFilterPillsProps {
  filters: VendorFilters;
  sort: SortMode;
  onClear: (key: "region" | "type" | "search" | "maxPrice" | "catalogOnly") => void;
  onClearAll: () => void;
}

export function ActiveFilterPills({ filters, sort, onClear, onClearAll }: ActiveFilterPillsProps) {
  const reducedMotion = useReducedMotion();
  const pills: Array<{ key: ActiveFilterPillsProps["onClear"] extends (k: infer K) => void ? K : never; label: string }> = [];
  if (filters.region !== "all") pills.push({ key: "region", label: `אזור: ${REGION_LABELS[filters.region as Region]}` });
  if (filters.type !== "all") pills.push({ key: "type", label: `קטגוריה: ${VENDOR_TYPE_LABELS[filters.type as VendorType]}` });
  if (filters.search.trim()) pills.push({ key: "search", label: `חיפוש: "${filters.search.trim()}"` });
  if (filters.maxPrice !== null) pills.push({ key: "maxPrice", label: `עד ₪${filters.maxPrice.toLocaleString("he-IL")}` });
  if (filters.catalogOnly) pills.push({ key: "catalogOnly", label: "בקטלוג בלבד" });

  if (pills.length === 0) return null;

  return (
    <div
      className="sticky top-16 z-30 -mx-5 px-5 sm:mx-0 sm:px-0 mt-4 py-2"
      style={{ backdropFilter: "blur(12px)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs me-1" style={{ color: "var(--foreground-muted)" }}>
          סינון פעיל ({pills.length}):
        </span>
        <AnimatePresence initial={false}>
          {pills.map((p) => (
            <motion.button
              key={p.key}
              type="button"
              layout
              initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              onClick={() => onClear(p.key)}
              className="rounded-full px-3 py-2 text-xs inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
              style={{
                background: "rgba(212,176,104,0.1)",
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }}
              aria-label={`נקה סינון ${p.label}`}
            >
              <span>{p.label}</span>
              <X size={11} aria-hidden />
            </motion.button>
          ))}
        </AnimatePresence>
        {sort !== "recommended" && (
          <span className="text-xs me-1 ms-auto" style={{ color: "var(--foreground-muted)" }}>
            מיון: {SORT_LABELS[sort]}
          </span>
        )}
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-full px-3 py-2 text-xs ms-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
          style={{ border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
          aria-label="נקה את כל הסינונים"
        >
          נקה הכל
        </button>
      </div>
    </div>
  );
}
