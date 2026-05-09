"use client";

import {
  Search,
  Sparkles,
  MapPin,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import type { Region } from "@/lib/types";
import { REGION_LABELS } from "@/lib/types";
import { type SortMode, SORT_LABELS } from "@/lib/vendorRanking";

const PRICE_BUCKETS: Array<{ label: string; value: number | null }> = [
  { label: "ללא מגבלה", value: null },
  { label: "עד ₪5,000", value: 5000 },
  { label: "עד ₪10,000", value: 10000 },
  { label: "עד ₪50,000", value: 50000 },
];

interface VendorFiltersProps {
  search: string;
  onSearch: (s: string) => void;
  region: Region | "all";
  onRegion: (r: Region | "all") => void;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  maxPrice: number | null;
  onMaxPrice: (p: number | null) => void;
  catalogOnly: boolean;
  onCatalogOnly: (v: boolean) => void;
}

export function VendorFilters(props: VendorFiltersProps) {
  return (
    <div className="card p-4 md:p-5 mt-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40" aria-hidden />
          <label htmlFor="vendor-search" className="sr-only">חיפוש ספק</label>
          <input
            id="vendor-search"
            className="input pe-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
            placeholder="חפש ספק, תיאור או תג..."
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            type="search"
            inputMode="search"
          />
        </div>
        <div>
          <label htmlFor="vendor-region" className="sr-only">סינון לפי אזור</label>
          <select
            id="vendor-region"
            className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
            value={props.region}
            onChange={(e) => props.onRegion(e.target.value as Region | "all")}
          >
            <option value="all" className="bg-[#131318]">כל האזורים</option>
            {(Object.entries(REGION_LABELS) as [Region, string][]).map(([k, l]) => (
              <option key={k} value={k} className="bg-[#131318]">
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <SortPill icon={<Sparkles size={12} />} label={SORT_LABELS.recommended} active={props.sort === "recommended"} onClick={() => props.onSort("recommended")} />
        <SortPill icon={<MapPin size={12} />} label={SORT_LABELS.closest} active={props.sort === "closest"} onClick={() => props.onSort("closest")} />
        <SortPill icon={<TrendingDown size={12} />} label={SORT_LABELS.cheapest} active={props.sort === "cheapest"} onClick={() => props.onSort("cheapest")} />
        <SortPill icon={<TrendingUp size={12} />} label={SORT_LABELS.expensive} active={props.sort === "expensive"} onClick={() => props.onSort("expensive")} />

        <span className="ms-2 text-white/50" aria-hidden>·</span>

        <span className="text-white/50">מחיר:</span>
        {PRICE_BUCKETS.map((p) => {
          const active = props.maxPrice === p.value;
          return (
            <button
              key={String(p.value)}
              type="button"
              onClick={() => props.onMaxPrice(p.value)}
              aria-pressed={active}
              className={`rounded-full px-3 py-2.5 border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] ${
                active
                  ? "bg-white/10 border-white/20 text-white"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              {p.value === null ? p.label : <span className="ltr-num">{p.label}</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => props.onCatalogOnly(!props.catalogOnly)}
          aria-pressed={props.catalogOnly}
          className={`rounded-full px-3 py-2.5 border transition inline-flex items-center gap-1.5 ms-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] ${
            props.catalogOnly
              ? "border-[var(--border-gold)] bg-[rgba(212,176,104,0.1)] text-[--accent]"
              : "border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          <ShieldCheck size={13} />
          בקטלוג בלבד
        </button>
      </div>
    </div>
  );
}

function SortPill({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full px-3 py-2.5 border transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
      style={{
        background: active ? "rgba(212,176,104,0.1)" : "transparent",
        borderColor: active ? "var(--border-gold)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--foreground-soft)",
      }}
    >
      {icon} {label}
    </button>
  );
}
