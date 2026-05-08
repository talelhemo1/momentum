"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { VendorChatModal } from "@/components/VendorChatModal";
import { useAppState, actions } from "@/lib/store";
import { VENDORS } from "@/lib/vendors";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import { vendorImageFor } from "@/lib/images";
import { safeHttpUrl } from "@/lib/safeUrl";
import {
  REGION_LABELS,
  VENDOR_TYPE_LABELS,
  type Region,
  type VendorType,
  type Vendor,
} from "@/lib/types";
import {
  Star,
  ShieldCheck,
  Phone,
  Heart,
  ArrowRight,
  Search,
  Building2,
  Camera,
  Music,
  Video,
  GlassWater,
  Utensils,
  Flower2,
  Sparkles,
  Mic2,
  Brush,
  Shirt,
  BookOpen,
  MessageCircle,
  PartyPopper,
  Car,
  Cake,
  Zap,
  MapPin,
  TrendingUp,
  TrendingDown,
  Trophy,
  Globe,
} from "lucide-react";

function InstagramGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

const TYPE_ICONS: Record<VendorType, React.ReactNode> = {
  venue: <Building2 size={20} />,
  photography: <Camera size={20} />,
  videography: <Video size={20} />,
  dj: <Music size={20} />,
  band: <Mic2 size={20} />,
  social: <Video size={20} />,
  alcohol: <GlassWater size={20} />,
  catering: <Utensils size={20} />,
  florist: <Flower2 size={20} />,
  designer: <Sparkles size={20} />,
  rabbi: <BookOpen size={20} />,
  makeup: <Brush size={20} />,
  dress: <Shirt size={20} />,
  entertainment: <PartyPopper size={20} />,
  transportation: <Car size={20} />,
  sweets: <Cake size={20} />,
  fx: <Zap size={20} />,
};

type SortMode = "recommended" | "closest" | "cheapest" | "expensive";
const SORT_LABELS: Record<SortMode, string> = {
  recommended: "מומלצים",
  closest: "הכי קרובים",
  cheapest: "הזולים ביותר",
  expensive: "היקרים ביותר",
};

export default function VendorsPage() {
  return (
    <Suspense fallback={null}>
      <VendorsInner />
    </Suspense>
  );
}

function VendorsInner() {
  const { state, hydrated } = useAppState();
  const search_params = useSearchParams();
  const [region, setRegion] = useState<Region | "all">("all");
  const [type, setType] = useState<VendorType | "all">("all");
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [catalogOnly, setCatalogOnly] = useState(false);
  const [chatVendor, setChatVendor] = useState<Vendor | null>(null);
  const [sort, setSort] = useState<SortMode>("recommended");

  // One-time seed: default the region filter to the user's event region.
  // We don't keep these in sync afterwards — once seeded, the user owns the
  // value. The setState-in-effect lint warning is intentional here because
  // there is no other way to mirror late-arriving external state into a
  // controlled input that the user can subsequently override.
  useEffect(() => {
    if (hydrated && state.event) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegion(state.event.region);
    }
    // Run only on first hydration of the event, not on every event change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Honor ?type= query param when arriving from a journey deep link.
  useEffect(() => {
    const t = search_params.get("type") as VendorType | null;
    if (t && VENDOR_TYPE_LABELS[t]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setType(t);
    }
  }, [search_params]);

  // Show ALL categories — recommended ones first if we know the event type.
  const allTypes = Object.keys(VENDOR_TYPE_LABELS) as VendorType[];
  const featuredTypes: VendorType[] = state.event
    ? [
        ...EVENT_CONFIG[state.event.type].recommendedVendors,
        ...allTypes.filter((t) => !EVENT_CONFIG[state.event!.type].recommendedVendors.includes(t)),
      ]
    : allTypes;

  // Adjacent regions for "closeness" calculation — bumps vendors that aren't
  // exactly in the user's region but are still nearby up the list.
  const ADJACENT: Record<Region, Region[]> = {
    "tel-aviv": ["sharon", "shfela"],
    sharon: ["tel-aviv", "haifa"],
    shfela: ["tel-aviv", "jerusalem"],
    jerusalem: ["shfela"],
    haifa: ["sharon", "north"],
    north: ["haifa"],
    south: ["negev"],
    negev: ["south"],
  };
  const userRegion = state.event?.region;

  const proximityScore = (v: Vendor): number => {
    if (!userRegion) return 1;
    if (v.region === userRegion) return 3;
    if (ADJACENT[userRegion]?.includes(v.region)) return 2;
    return 1;
  };

  const filtered = useMemo(() => {
    const list = VENDORS.filter((v) => {
      if (region !== "all" && v.region !== region) return false;
      if (type !== "all" && v.type !== type) return false;
      if (maxPrice && v.priceFrom > maxPrice) return false;
      if (catalogOnly && !v.inCatalog) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (
          !v.name.toLowerCase().includes(s) &&
          !v.description.toLowerCase().includes(s) &&
          !v.tags.some((t) => t.toLowerCase().includes(s))
        )
          return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sort) {
        case "closest": {
          const score = proximityScore(b) - proximityScore(a);
          return score !== 0 ? score : b.rating - a.rating;
        }
        case "cheapest":
          return a.priceFrom - b.priceFrom;
        case "expensive":
          return b.priceFrom - a.priceFrom;
        case "recommended":
        default: {
          // In-catalog vendors first, then by rating × log(reviews+1) to prioritize battle-tested.
          const va = (a.inCatalog ? 1 : 0) + a.rating + Math.log(a.reviews + 1) * 0.5;
          const vb = (b.inCatalog ? 1 : 0) + b.rating + Math.log(b.reviews + 1) * 0.5;
          return vb - va;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, type, maxPrice, catalogOnly, search, sort, userRegion]);

  const countByType = useMemo(() => {
    const m: Partial<Record<VendorType, number>> = {};
    for (const v of VENDORS) {
      if (region !== "all" && v.region !== region) continue;
      m[v.type] = (m[v.type] ?? 0) + 1;
    }
    return m;
  }, [region]);

  return (
    <>
      <Header />
      <main className="flex-1 pb-24 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 right-0 opacity-30" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link
            href={state.event ? "/dashboard" : "/"}
            className="text-sm text-white/50 hover:text-white inline-flex items-center gap-1.5"
          >
            <ArrowRight size={14} /> חזרה
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">ספקים</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                <span className="gradient-text">הספקים הכי טובים</span>
                <br />
                <span className="gradient-gold">באזור שלך.</span>
              </h1>
              <p className="mt-3 text-white/55">
                {state.event
                  ? `מציג ספקים ב${REGION_LABELS[state.event.region]}`
                  : "צלמים, אולמות, תקליטנים, סושיאל, ברים — מסונן לפי המיקום שלך"}
              </p>
            </div>
            {state.selectedVendors.length > 0 && (
              <div className="pill pill-gold">
                <Heart size={12} fill="currentColor" />
                {state.selectedVendors.length} ספקים שמורים
              </div>
            )}
          </div>

          {/* Legal disclaimer — must stay visible above the catalog so users see it
              before contacting any vendor. Phrasing reviewed for compliance: makes
              clear we're a directory, not a party to any transaction. */}
          <div
            className="mt-6 rounded-2xl px-4 py-3 text-sm flex items-start gap-2.5"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--foreground-soft)",
            }}
            role="note"
          >
            <ShieldCheck size={16} className="text-[--accent] mt-0.5 shrink-0" />
            <p>
              המידע למידע בלבד. כל עסקה היא בינך לבין הספק.{" "}
              <strong className="font-semibold">Momentum איננה צד לעסקה</strong>{" "}
              ואינה אחראית לאיכות שירותי הספק.
            </p>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 stagger">
            <CategoryChip
              active={type === "all"}
              onClick={() => setType("all")}
              label="הכל"
            />
            {featuredTypes.map((t) => (
              <CategoryChip
                key={t}
                active={type === t}
                onClick={() => setType(t)}
                label={VENDOR_TYPE_LABELS[t]}
                count={countByType[t]}
                icon={TYPE_ICONS[t]}
              />
            ))}
          </div>

          <div className="card p-4 md:p-5 mt-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 relative">
                <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  className="input pe-10"
                  placeholder="חפש ספק, תיאור או תג..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="input"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region | "all")}
              >
                <option value="all" className="bg-[#131318]">כל האזורים</option>
                {(Object.entries(REGION_LABELS) as [Region, string][]).map(([k, l]) => (
                  <option key={k} value={k} className="bg-[#131318]">
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {/* Sort options */}
              <SortPill icon={<Sparkles size={12} />} label={SORT_LABELS.recommended} active={sort === "recommended"} onClick={() => setSort("recommended")} />
              <SortPill icon={<MapPin size={12} />} label={SORT_LABELS.closest} active={sort === "closest"} onClick={() => setSort("closest")} />
              <SortPill icon={<TrendingDown size={12} />} label={SORT_LABELS.cheapest} active={sort === "cheapest"} onClick={() => setSort("cheapest")} />
              <SortPill icon={<TrendingUp size={12} />} label={SORT_LABELS.expensive} active={sort === "expensive"} onClick={() => setSort("expensive")} />

              <span className="ms-2 text-white/50">·</span>

              <span className="text-white/50">מחיר:</span>
              {[null, 5000, 10000, 50000].map((p) => (
                <button
                  key={String(p)}
                  onClick={() => setMaxPrice(p)}
                  className={`rounded-full px-3 py-1.5 border transition ${
                    maxPrice === p
                      ? "bg-white/10 border-white/20 text-white"
                      : "border-white/10 text-white/60 hover:bg-white/5"
                  }`}
                >
                  {p === null ? "ללא מגבלה" : (
                    <span className="ltr-num">עד ₪{p.toLocaleString("he-IL")}</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setCatalogOnly((v) => !v)}
                className={`rounded-full px-3 py-1.5 border transition inline-flex items-center gap-1.5 ms-auto ${
                  catalogOnly
                    ? "border-[var(--border-gold)] bg-[rgba(212,176,104,0.1)] text-[--accent]"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                <ShieldCheck size={13} />
                בקטלוג בלבד
              </button>
            </div>
          </div>

          <div className="mt-4 text-sm text-white/55">
            <span className="ltr-num">{filtered.length}</span> ספקים נמצאו
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3 stagger">
            {filtered.length === 0 && (
              <div className="md:col-span-2 lg:col-span-3 card p-12 text-center text-white/50">
                לא נמצאו ספקים מתאימים. נסה לשנות פילטרים.
              </div>
            )}
            {filtered.map((vendor, i) => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                meshIndex={i}
                selected={state.selectedVendors.includes(vendor.id)}
                onChat={() => setChatVendor(vendor)}
              />
            ))}
          </div>

          {/* Spacer so the sticky bar doesn't cover content */}
          {state.selectedVendors.length > 0 && <div className="h-24" />}
        </div>

        {(state.selectedVendors.length > 0 || state.compareVendors.length > 0) && (
          <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-5 pt-3 pointer-events-none">
            <div className="max-w-3xl mx-auto pointer-events-auto flex flex-col gap-2">
              {state.compareVendors.length > 0 && (
                <div className="glass-strong rounded-full flex items-center justify-between px-3 py-2 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7)]" style={{ border: "1px solid var(--border-gold)" }}>
                  <div className="flex items-center gap-3 px-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ltr-num" style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border-gold)" }}>
                      {state.compareVendors.length}
                    </div>
                    <div className="text-sm">
                      <div className="font-semibold">ספקים בהשוואה</div>
                      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>בחר עד 3 לראות זה לצד זה</div>
                    </div>
                  </div>
                  <Link href="/compare" className="rounded-full text-sm py-2 px-5 inline-flex items-center gap-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border-gold)", color: "var(--accent)" }}>
                    פתח השוואה
                    <Trophy size={14} />
                  </Link>
                </div>
              )}
              {state.selectedVendors.length > 0 && (
                <div className="glass-strong rounded-full flex items-center justify-between px-3 py-2 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7)] border border-white/15">
                  <div className="flex items-center gap-3 px-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black flex items-center justify-center font-bold text-sm ltr-num">
                      {state.selectedVendors.length}
                    </div>
                    <div className="text-sm">
                      <div className="font-semibold">ספקים נבחרו</div>
                      <div className="text-xs text-white/55">המשך לתקציב כדי לבדוק את העלות</div>
                    </div>
                  </div>
                  <Link href="/budget" className="btn-gold text-sm py-2 px-5 inline-flex items-center gap-2">
                    המשך לתקציב
                    <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {chatVendor && <VendorChatModal vendor={chatVendor} onClose={() => setChatVendor(null)} />}
      </main>
    </>
  );
}

function CompareToggle({ vendorId }: { vendorId: string }) {
  const { state } = useAppState();
  const inCompare = state.compareVendors.includes(vendorId);
  const full = !inCompare && state.compareVendors.length >= 3;
  return (
    <button
      onClick={() => actions.toggleCompareVendor(vendorId)}
      disabled={full}
      title={full ? "מקסימום 3 ספקים בהשוואה" : inCompare ? "הסר מהשוואה" : "הוסף להשוואה"}
      className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition disabled:opacity-30 ${
        inCompare
          ? "bg-[--accent] border-[--accent] text-black"
          : "bg-black/40 border-white/15 text-white/85 hover:bg-black/60"
      }`}
      aria-label="השוואה"
    >
      <Trophy size={14} fill={inCompare ? "currentColor" : "none"} />
    </button>
  );
}

function SortPill({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 border transition inline-flex items-center gap-1.5"
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

function CategoryChip({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2.5 text-sm transition inline-flex items-center gap-2 ${
        active
          ? "bg-gradient-to-b from-white/[0.12] to-white/[0.04] border-white/20 text-white"
          : "border-white/10 bg-white/[0.02] text-white/65 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {icon && <span className={active ? "text-[--accent]" : ""}>{icon}</span>}
      <span className="font-medium">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-white/40 ltr-num">({count})</span>
      )}
    </button>
  );
}

function VendorCard({
  vendor,
  selected,
  meshIndex,
  onChat,
}: {
  vendor: Vendor;
  selected: boolean;
  meshIndex: number;
  onChat: () => void;
}) {
  const meshClass = `mesh-${(meshIndex % 6) + 1}`;
  const imageUrl = vendorImageFor(vendor.type, meshIndex);
  return (
    <div className={`card overflow-hidden flex flex-col card-hover ${selected ? "card-selected" : ""}`}>
      <div className={`aspect-[16/10] relative ${meshClass} overflow-hidden`}>
        <img
          src={imageUrl}
          alt={vendor.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="absolute top-3 start-3 flex items-center gap-2">
          {vendor.inCatalog && (
            <span className="pill pill-gold">
              <ShieldCheck size={11} /> בקטלוג
            </span>
          )}
        </div>

        <div className="absolute top-3 end-3 flex items-center gap-1.5">
          <CompareToggle vendorId={vendor.id} />
          <button
            onClick={() => actions.toggleVendor(vendor.id)}
            className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition ${
              selected
                ? "bg-[--accent] border-[--accent] text-black"
                : "bg-black/40 border-white/15 text-white/85 hover:bg-black/60"
            }`}
            aria-label={selected ? "הסר מהמועדפים" : "הוסף למועדפים"}
          >
            <Heart size={16} fill={selected ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="absolute bottom-3 start-3 inline-flex items-center gap-1 text-xs bg-black/50 backdrop-blur-md rounded-full px-2.5 py-1 border border-white/10">
          <Star size={11} className="text-[--accent]" fill="currentColor" />
          <span className="font-bold ltr-num">{vendor.rating}</span>
          <span className="text-white/50 ltr-num">({vendor.reviews})</span>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-lg leading-tight">{vendor.name}</h3>
        <div className="text-xs text-white/50 mt-1">
          {VENDOR_TYPE_LABELS[vendor.type]} · {REGION_LABELS[vendor.region]}
        </div>

        <p className="text-sm text-white/65 mt-3 leading-relaxed line-clamp-2">{vendor.description}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {vendor.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[11px] rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-white/55"
            >
              {tag}
            </span>
          ))}
        </div>

        {(() => {
          // Build URL strings safely. Today VENDORS is a static list so this is
          // belt-and-suspenders; the moment we open self-service vendor signup
          // it's the only thing standing between us and a `javascript:` href.
          const igHandle = vendor.instagram?.replace(/^@/, "");
          const igUrl = igHandle ? safeHttpUrl(`https://instagram.com/${encodeURIComponent(igHandle)}`) : undefined;
          const fbUrl = vendor.facebook
            ? vendor.facebook.startsWith("http")
              ? safeHttpUrl(vendor.facebook)
              : safeHttpUrl(`https://facebook.com/${encodeURIComponent(vendor.facebook)}`)
            : undefined;
          const webUrl = safeHttpUrl(vendor.website);

          if (!igUrl && !fbUrl && !webUrl) return null;
          return (
            <div className="mt-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {igUrl && (
                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-[var(--secondary-button-bg-hover)] hover:border-[var(--border-gold)] flex items-center justify-center transition"
                  aria-label={`${vendor.name} באינסטגרם`}
                  title="Instagram"
                >
                  <span className="text-white/70"><InstagramGlyph /></span>
                </a>
              )}
              {fbUrl && (
                <a
                  href={fbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-[var(--secondary-button-bg-hover)] hover:border-[var(--border-gold)] flex items-center justify-center transition"
                  aria-label={`${vendor.name} בפייסבוק`}
                  title="Facebook"
                >
                  <span className="text-white/70"><FacebookGlyph /></span>
                </a>
              )}
              {webUrl && (
                <a
                  href={webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-[var(--secondary-button-bg-hover)] hover:border-[var(--border-gold)] flex items-center justify-center transition"
                  aria-label={`אתר של ${vendor.name}`}
                  title="Website"
                >
                  <Globe size={12} className="text-white/70" />
                </a>
              )}
            </div>
          );
        })()}

        <div className="mt-auto pt-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-white/45">החל מ-</div>
            <div className="font-bold gradient-gold text-lg ltr-num">
              ₪{vendor.priceFrom.toLocaleString("he-IL")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onChat}
              className="rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] hover:border-[var(--border-gold)] px-3.5 py-2 text-sm inline-flex items-center gap-2 transition"
              aria-label={`שלח הודעה ל${vendor.name}`}
            >
              <MessageCircle size={14} />
              צ׳אט
            </button>
            <a
              href={`tel:${vendor.phone}`}
              className="rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] p-2 transition"
              aria-label={`התקשר ל${vendor.name}`}
            >
              <Phone size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
