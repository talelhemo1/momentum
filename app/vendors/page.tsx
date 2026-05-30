"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Heart, Plus, ShieldCheck, Sparkles, Lightbulb } from "lucide-react";
import { Header } from "@/components/Header";
// R90 — in-app chat retired. Couples reach vendors over WhatsApp /
// phone only. VendorChatModal import + chatVendor state + handleChat
// callback all removed below. VendorQuickLook still accepts an
// `onChat` prop (kept for API stability); we pass a no-op.
import { useAppState } from "@/lib/store";
import { VENDORS } from "@/lib/vendors";
// R105 — getSupabase no longer needed here. Catalog data is loaded
// via the /api/vendors/catalog server route.
import {
  mapApprovedRows,
  type ApprovedVendorRow,
} from "@/lib/approvedVendors";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import {
  REGION_LABELS,
  VENDOR_TYPE_LABELS,
  type Region,
  type Vendor,
  type VendorType,
} from "@/lib/types";
import {
  EMPTY_FILTERS,
  filterVendors,
  type SortMode,
  sortVendors,
  type VendorFilters as VendorFiltersShape,
} from "@/lib/vendorRanking";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { VendorCard } from "@/components/vendors/VendorCard";
import { VendorFilters } from "@/components/vendors/VendorFilters";
import { CategoryRail } from "@/components/vendors/CategoryRail";
import { SelectedBar } from "@/components/vendors/CompareBar";
// R148 — hide the host-only "המשך לתקציב" floating bar from vendors
// who browse the public catalog. Budget is a host feature; the bar
// shouldn't appear for a signed-in vendor account.
import { useVendorContext } from "@/lib/useVendorContext";
import { ActiveFilterPills } from "@/components/vendors/ActiveFilterPills";
import { VendorQuickLook } from "@/components/vendors/VendorQuickLook";

/** Persisted filter state — restored on next visit so users don't lose context. */
const FILTER_STORAGE_KEY = "momentum.vendors_filter.v1";
const PAGE_SIZE = 24;

/** Adjacent regions used by the smart-empty-state suggestion. Mirrors the map
 *  in lib/vendorRanking but exposed here too so we can suggest a widening. */
const ADJACENT_REGIONS: Record<Region, Region[]> = {
  "tel-aviv": ["sharon", "shfela"],
  sharon: ["tel-aviv", "haifa"],
  shfela: ["tel-aviv", "jerusalem"],
  jerusalem: ["shfela"],
  haifa: ["sharon", "north"],
  north: ["haifa"],
  south: ["negev"],
  negev: ["south"],
};

export default function VendorsPage() {
  // R15 §3G — component-level isolation. A throw inside VendorsInner
  // (e.g. a bad vendor record, a stale event type that slipped past the
  // §1 guards) is caught here instead of blanking the whole route.
  return (
    <ErrorBoundary section="vendors">
      <Suspense fallback={null}>
        <VendorsInner />
      </Suspense>
    </ErrorBoundary>
  );
}

function VendorsInner() {
  const { state, hydrated } = useAppState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();
  // R148 — used below to hide the "המשך לתקציב" floating bar from
  // vendor accounts browsing their own catalog. Hosts still see it.
  const { isVendor } = useVendorContext();

  // ─── State (filters, sort, modal targets) ───
  // We seed each piece in turn from URL → sessionStorage → defaults. The seed
  // runs ONCE per mount (prefilled flag) so subsequent user changes win.
  const [filters, setFilters] = useState<VendorFiltersShape>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortMode>("recommended");
  // R90 — chatVendor state retired (was used to open VendorChatModal).
  const [quickVendor, setQuickVendor] = useState<Vendor | null>(null);
  const [page, setPage] = useState(1);

  // R38 — approved vendor applications, loaded from the public-safe
  // `list_approved_vendors` RPC and merged into the catalog. The moment
  // the admin approves an application in /admin/vendors it shows here.
  // Fail-soft: any error → empty, the static seed still renders.
  const [approved, setApproved] = useState<Vendor[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // R105 — single fetch to `/api/vendors/catalog`. The server
        // route does the full merge with service-role (apps +
        // landings joined by email), so the client doesn't have to
        // care about RLS gates, migration drift, or schema column
        // availability. Images, service_areas, tagline — everything
        // arrives in one already-resolved payload.
        const res = await fetch("/api/vendors/catalog", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          console.warn("[vendors-catalog] /api/vendors/catalog status:", res.status);
          return;
        }
        const payload = (await res.json()) as { vendors?: ApprovedVendorRow[] };
        const rows = payload.vendors ?? [];
        const mapped = mapApprovedRows(rows);
        if (process.env.NODE_ENV !== "production") {
          console.info(
            `[vendors-catalog] approved vendors from API: ${mapped.length}`,
          );
        }
        // R126 — always commit the response (even empty) so vendor
        // deletions propagate without a full reload.
        setApproved(mapped);
      } catch (e) {
        console.warn("[vendors-catalog] fetch threw:", e);
        /* keep [] — static catalog still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Static seed first, then approved DB vendors.
  const allVendors = useMemo(
    () => (approved.length ? [...VENDORS, ...approved] : VENDORS),
    [approved],
  );

  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!hydrated) return; // wait for store so event.region is available
    prefilledRef.current = true;

    // Start from EMPTY_FILTERS, layer sessionStorage, then URL (URL wins).
    const next: VendorFiltersShape = { ...EMPTY_FILTERS };
    let nextSort: SortMode = "recommended";

    // R82 — `?refresh=1` (or `?from=admin`) is a "show me everything fresh"
    // signal. Used by the admin approve flow to navigate straight to the
    // catalog without persisted region/type filters silently hiding the
    // just-approved vendor. Also wipes the sessionStorage cache so the
    // next normal visit doesn't re-apply the stale filters.
    const forceReset =
      searchParams.get("refresh") === "1" ||
      searchParams.get("from") === "admin";
    if (forceReset) {
      try {
        window.sessionStorage.removeItem(FILTER_STORAGE_KEY);
      } catch {
        /* ignore — fall through to defaults */
      }
    }

    try {
      const raw = forceReset
        ? null
        : window.sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VendorFiltersShape & { sort: SortMode }>;
        if (parsed.region && (parsed.region === "all" || parsed.region in REGION_LABELS)) {
          next.region = parsed.region;
        }
        if (parsed.type && (parsed.type === "all" || parsed.type in VENDOR_TYPE_LABELS)) {
          next.type = parsed.type;
        }
        if (typeof parsed.search === "string") next.search = parsed.search;
        // R132 — maxPrice + cheapest/expensive sort removed. Old
        // storage entries are ignored silently.
        if (typeof parsed.catalogOnly === "boolean") next.catalogOnly = parsed.catalogOnly;
        if (parsed.sort === "recommended" || parsed.sort === "closest") {
          nextSort = parsed.sort;
        }
      }
    } catch {
      // Corrupt storage — ignore, fall through to URL/defaults.
    }

    // URL params override storage so a shared link "wins".
    const urlRegion = searchParams.get("region") as Region | null;
    if (urlRegion && urlRegion in REGION_LABELS) next.region = urlRegion;
    const urlType = searchParams.get("type") as VendorType | null;
    if (urlType && urlType in VENDOR_TYPE_LABELS) next.type = urlType;
    const urlQ = searchParams.get("q");
    if (urlQ) next.search = urlQ;
    // R132 — ?max= and ?sort=cheapest/expensive no longer honored;
    // price filtering was removed. Stale links degrade to defaults.
    const urlSort = searchParams.get("sort");
    if (urlSort === "recommended" || urlSort === "closest") {
      nextSort = urlSort;
    }

    // First-time seed: default region from the host's event when nothing
    // else was provided. Does not run on subsequent visits because storage
    // would override.
    // R82 — also skip the auto-prefill when `forceReset` is on so an
    // admin visiting from the approve flow sees ALL regions, not just
    // their own wedding's region.
    if (!forceReset && next.region === "all" && state.event?.region) {
      next.region = state.event.region;
    }

    // The lint rule prefers `useState` initializers, but our seed depends on
    // BOTH the hydrated store AND the URL params — values that arrive on a
    // later tick. Mirroring them via setState behind a `prefilled` ref guard
    // is the documented React 19 escape hatch for this exact case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(next);
    setSort(nextSort);
  }, [hydrated, searchParams, state.event?.region]);

  // ?vendor=<id> opens Quick Look. Runs every params change so it survives
  // back-button navigation. The lint rule's "calling setState in an effect"
  // warning is suppressed because the alternative (deriving from URL during
  // render) would re-run the modal mount-animation on unrelated parent
  // re-renders — strictly worse UX.
  useEffect(() => {
    const id = searchParams.get("vendor");
    const next = id ? allVendors.find((v) => v.id === id) ?? null : null;
    // Guard against the loop: this effect reads searchParams → may setState
    // → another effect writes searchParams → this effect fires again. If
    // the result is identical, bail before triggering a re-render.
    if (next?.id === quickVendor?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuickVendor(next);
  }, [searchParams, quickVendor, allVendors]);

  // Persist filter+sort to sessionStorage AFTER the prefill seed has landed.
  useEffect(() => {
    if (!prefilledRef.current) return;
    try {
      window.sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ ...filters, sort }),
      );
    } catch {
      // Quota / privacy mode — ignore; the only consequence is the user
      // re-applies filters next visit.
    }
  }, [filters, sort]);

  // Bidirectional URL sync — write the human-meaningful subset back so the
  // user can share their view. router.replace + scroll:false to avoid history
  // spam and jump-to-top on each filter tweak.
  //
  // Debounced 100ms: rapid-fire state changes (filter chip + Quick Look open
  // landing in the same render tick) used to schedule two router.replace
  // calls in a row. On slow mobile devices the second one occasionally
  // raced the first and ended up writing an empty query string.
  useEffect(() => {
    if (!prefilledRef.current) return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (filters.region !== "all") params.set("region", filters.region);
      if (filters.type !== "all") params.set("type", filters.type);
      if (filters.search.trim()) params.set("q", filters.search.trim());
      // R132 — ?max= no longer written; price filtering removed.
      if (sort !== "recommended") params.set("sort", sort);
      // Quick Look open state stays in the URL too.
      if (quickVendor) params.set("vendor", quickVendor.id);
      const qs = params.toString();
      router.replace(qs ? `/vendors?${qs}` : "/vendors", { scroll: false });
    }, 100);
    return () => window.clearTimeout(handle);
  }, [filters, sort, quickVendor, router]);

  // Reset pagination on every filter/sort change so the user doesn't see an
  // unrelated 50th card after switching categories.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [filters, sort]);

  // ─── Derived values ───
  const allTypes = useMemo(() => Object.keys(VENDOR_TYPE_LABELS) as VendorType[], []);
  const featuredTypes = useMemo<VendorType[]>(() => {
    if (!state.event) return allTypes;
    // R15 §1A — defensive lookup. `state.event.type` can be a stale /
    // unknown string (old localStorage, removed event type) which makes
    // the direct index return undefined and crashes on .recommendedVendors.
    const cfg = EVENT_CONFIG[state.event.type] ?? EVENT_CONFIG.wedding;
    const recommended = cfg.recommendedVendors;
    return [...recommended, ...allTypes.filter((t) => !recommended.includes(t))];
  }, [state.event, allTypes]);

  const filtered = useMemo(() => {
    const f = filterVendors(allVendors, filters);
    return sortVendors(f, sort, state.event?.region);
  }, [allVendors, filters, sort, state.event?.region]);

  const visible = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  // R20 — O(1) membership instead of Array.includes() per card per render.
  // With a long catalog this was O(n·m) on every render of the grid.
  const selectedIds = useMemo(() => new Set(state.selectedVendors), [state.selectedVendors]);
  const compareIds = useMemo(() => new Set(state.compareVendors), [state.compareVendors]);

  const countByType = useMemo(() => {
    const m: Partial<Record<VendorType, number>> = {};
    for (const v of allVendors) {
      if (filters.region !== "all" && v.region !== filters.region) continue;
      m[v.type] = (m[v.type] ?? 0) + 1;
    }
    return m;
  }, [allVendors, filters.region]);

  // ─── Handlers ───
  const setFilterField = useCallback(<K extends keyof VendorFiltersShape>(key: K, value: VendorFiltersShape[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);
  const clearOne = useCallback((key: "region" | "type" | "search" | "catalogOnly") => {
    setFilters((f) => ({ ...f, [key]: EMPTY_FILTERS[key] }));
  }, []);
  const clearAll = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSort("recommended");
  }, []);

  // Quick Look: open by setting state; URL effect above syncs the param.
  const openQuickLook = useCallback((v: Vendor) => setQuickVendor(v), []);
  // R19 P2#10: scrub `?vendor=...` from the URL when closing so a refresh
  // doesn't re-open the same modal — and to prevent the open-effect upstream
  // (which mirrors the URL param into setQuickVendor) from re-firing as soon
  // as the user closes. Other query params (region/type/sort/q/max) are
  // preserved exactly.
  const closeQuickLook = useCallback(() => {
    setQuickVendor(null);
    if (searchParams.get("vendor")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("vendor");
      const qs = params.toString();
      router.replace(`/vendors${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [searchParams, router]);
  // R90 — handleChat retired; the catalog card no longer has a chat
  // button. VendorQuickLook still receives a (no-op) onChat for now.
  const handleChat = useCallback((v: Vendor) => {
    /* R90 no-op; param kept to satisfy QuickLook prop signature */
    void v;
  }, []);

  // Smart empty-state suggestions — list 0-3 actions the user can take with
  // ONE click that would each likely surface results.
  const emptyStateActions = useMemo(() => {
    const out: Array<{ label: string; action: () => void }> = [];
    // R132 — maxPrice empty-state CTA removed alongside the filter.
    if (filters.region !== "all") {
      const adjacents = ADJACENT_REGIONS[filters.region as Region] ?? [];
      if (adjacents.length > 0) {
        const label = `הרחב את האזור ל${REGION_LABELS[filters.region as Region]} + סמוכים`;
        // "all" is the easiest expansion that works for every region.
        out.push({ label, action: () => clearOne("region") });
      }
    }
    if (filters.catalogOnly) {
      out.push({ label: "הסר \"בקטלוג בלבד\"", action: () => clearOne("catalogOnly") });
    }
    if (filters.type !== "all") {
      out.push({ label: `הצג את כל הקטגוריות`, action: () => clearOne("type") });
    }
    return out.slice(0, 3);
  }, [filters, clearOne]);

  return (
    <>
      <Header />
      <main className="flex-1 pb-24 relative">
        {/* R93 — softer twin gold orbs flanking the hero (was a single
            harsh orb pinned to one corner). Creates a balanced halo
            behind the title without competing with the cards. */}
        <div aria-hidden className="glow-orb glow-orb-gold w-[520px] h-[520px] -top-40 right-1/4 opacity-25" />
        <div aria-hidden className="glow-orb glow-orb-gold w-[420px] h-[420px] -top-20 left-1/4 opacity-15" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link
            href={state.event ? "/dashboard" : "/"}
            className="text-sm text-white/50 hover:text-white inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] rounded-full px-1"
          >
            <ArrowRight size={14} aria-hidden /> חזרה
          </Link>

          {/* R93 — premium hero block. Centered, serif title in
              Frank Ruhl Libre (matches R138 IntimateHero), eyebrow
              + tagline + a stats strip with quick proof. The
              "saved vendors" pill + "join as vendor" CTA were
              moved into a tidy single-line row UNDER the title so
              the hero stays uncluttered. */}
          <section className="mt-8 text-center">
            <span className="eyebrow inline-flex">
              <Sparkles size={11} aria-hidden /> קטלוג הספקים
            </span>
            <h1
              className="mt-4 font-extrabold tracking-tight gradient-gold-shimmer leading-[1.05]"
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
              }}
            >
              הספקים הכי טובים באזור שלך
            </h1>
            <p
              className="mt-4 text-base md:text-lg mx-auto max-w-xl"
              style={{ color: "var(--foreground-soft)" }}
            >
              {state.event
                ? `${allVendors.length} ספקים מאומתים ב${REGION_LABELS[state.event.region]} ובסביבה — כולם עם דף נחיתה משלהם.`
                : `${allVendors.length} ספקים מאומתים בכל הקטגוריות — בחר תחום ומיקום מהפילטרים.`}
            </p>

            {/* R93 — ornamental divider, same family as R138's
                rule + floret. Reinforces the "save-the-date /
                editorial" feel across the whole vendor experience. */}
            <div className="hero-luxury-rule mt-6" aria-hidden>
              <span className="line" />
              <span className="floret" />
              <span className="line" />
            </div>

            {/* Compact action row — saved-count + join CTA on a
                single horizontal line. */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {state.selectedVendors.length > 0 && (
                <span className="pill pill-gold">
                  <Heart size={12} fill="currentColor" aria-hidden />
                  {state.selectedVendors.length} שמורים אצלך
                </span>
              )}
              <Link
                href="/vendors/join"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition hover:scale-[1.02]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(244,222,169,0.16), rgba(168,136,74,0.06))",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                }}
              >
                <Sparkles size={11} aria-hidden /> ספק? הצטרף לקטלוג
              </Link>
            </div>
          </section>

          {/* R93 — info notes consolidated into a single soft card
              with two tightly-spaced rows + a divider. Saves vertical
              real-estate so the catalog grid starts higher on the
              page (visible above the fold on most desktops). */}
          <div
            className="mt-8 rounded-2xl overflow-hidden"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--foreground-soft)",
            }}
            role="note"
          >
            <div className="px-4 py-3 text-sm flex items-start gap-2.5">
              <ShieldCheck
                size={15}
                className="text-[--accent] mt-0.5 shrink-0"
                aria-hidden
              />
              <p className="leading-relaxed">
                המידע למידע בלבד. כל עסקה היא בינך לבין הספק.{" "}
                <strong className="font-semibold">Momentum איננה צד לעסקה</strong>{" "}
                ואינה אחראית לאיכות שירותי הספק.
              </p>
            </div>
            <div
              className="px-4 py-3 text-sm flex items-start gap-2.5"
              style={{
                borderTop: "1px solid var(--border)",
                background: "rgba(251, 191, 36, 0.04)",
              }}
            >
              <Lightbulb
                size={15}
                className="text-amber-400 mt-0.5 shrink-0"
                aria-hidden
              />
              <p className="leading-relaxed">
                <strong className="font-semibold text-amber-300">טיפ:</strong>{" "}
                המחירים נקודת מוצא בלבד. בקיץ ובחגים — תוספת של 15-30%. בחורף ובאמצע השבוע — הספקים גמישים יותר.
                תמיד בקשו הצעה ספציפית לתאריך.
              </p>
            </div>
          </div>

          <CategoryRail
            types={featuredTypes}
            active={filters.type}
            onChange={(t) => setFilterField("type", t)}
            countByType={countByType}
          />

          <VendorFilters
            search={filters.search}
            onSearch={(s) => setFilterField("search", s)}
            region={filters.region}
            onRegion={(r) => setFilterField("region", r)}
            sort={sort}
            onSort={setSort}
            catalogOnly={filters.catalogOnly}
            onCatalogOnly={(v) => setFilterField("catalogOnly", v)}
          />

          <ActiveFilterPills
            filters={filters}
            sort={sort}
            onClear={clearOne}
            onClearAll={clearAll}
          />

          {/* R93 — friendlier result count: gold accent on the
              number + "מציג {visible}/{filtered}" when paginated, so
              the host understands they're seeing a subset of a
              larger filter result. */}
          <div
            className="mt-5 flex items-baseline gap-2 text-sm"
            aria-live="polite"
            style={{ color: "var(--foreground-muted)" }}
          >
            <span className="text-xs uppercase tracking-[0.18em] font-semibold" style={{ color: "var(--accent)" }}>
              תוצאות
            </span>
            <span
              className="font-bold ltr-num"
              style={{ color: "var(--foreground)" }}
            >
              {filtered.length}
            </span>
            <span>{filtered.length === 1 ? "ספק נמצא" : "ספקים נמצאו"}</span>
          </div>

          {/* The Suspense fallback covers SSR. On the client the page hydrates
              immediately; if the user hits a sluggish network the static HTML
              already contains the catalog, so skipping the skeleton overlay
              here is the right tradeoff — the alternative was a hydration
              quirk where `hydrated` stayed false on /vendors specifically and
              cards never replaced skeletons. (The Skeleton component is kept
              for future use — list virtualization or paginated streams.) */}
          {filtered.length === 0 ? (
            // R87 (R69-2) — distinguish a genuinely empty catalog
            // (no vendors approved yet) from a filtered-empty view
            // ("filters hide everything"). Different copy + CTAs.
            allVendors.length === 0 ? (
              <EmptyCatalog />
            ) : (
              <SmartEmptyState actions={emptyStateActions} onClearAll={clearAll} />
            )
          ) : (
            <>
              <motion.div
                layout={!reducedMotion}
                // R84-1 — `grid-auto-rows: 1fr` makes every row the
                // same height regardless of which card is the tallest
                // in that row. Combined with min-h + line-clamp on
                // the card body, every tile is EXACTLY the same size.
                style={{ gridAutoRows: "1fr" }}
                className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {visible.map((vendor, i) => (
                    <motion.div
                      key={vendor.id}
                      layout={!reducedMotion}
                      initial={reducedMotion || i >= 12 ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
                      transition={{
                        duration: 0.36,
                        ease: [0.22, 1, 0.36, 1],
                        delay: reducedMotion ? 0 : i < 12 ? i * 0.04 : 0,
                      }}
                    >
                      <VendorCard
                        vendor={vendor}
                        meshIndex={i}
                        selected={selectedIds.has(vendor.id)}
                        inCompare={compareIds.has(vendor.id)}
                        compareDisabled={
                          !compareIds.has(vendor.id) && compareIds.size >= 3
                        }
                        onOpenQuickLook={openQuickLook}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>

              {visible.length < filtered.length && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="btn-secondary text-sm py-2 px-5 inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
                    aria-label={`טען עוד ${Math.min(PAGE_SIZE, filtered.length - visible.length)} ספקים`}
                  >
                    <Plus size={14} aria-hidden />
                    טען עוד {Math.min(PAGE_SIZE, filtered.length - visible.length)}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Spacer so the sticky bar doesn't cover content */}
          {(state.selectedVendors.length > 0 || state.compareVendors.length > 0) && <div className="h-24" />}
        </div>

        {/* Sticky bottom bars — slide-up via framer-motion. */}
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-5 pt-3 pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto flex flex-col gap-2">
            {/* R71 (R60-6) — `/compare` page removed; CompareBar that
                linked to it is no longer rendered. The store still has
                `compareVendors` for the heart-toggle on cards (cheap),
                but the floating bar is gone. */}
            <AnimatePresence>
              {/* R148 — hide the "המשך לתקציב" bar for vendors. The
                  budget tool is host-only; surfacing it for a vendor
                  browsing the catalog leads them into a part of the
                  app that has no meaning for their account. */}
              {!isVendor && state.selectedVendors.length > 0 && (
                <SelectedBar count={state.selectedVendors.length} />
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {quickVendor && (
            <VendorQuickLook
              key={quickVendor.id}
              vendor={quickVendor}
              onClose={closeQuickLook}
              onChat={handleChat}
              onPick={(v) => setQuickVendor(v)}
            />
          )}
        </AnimatePresence>

        {/* R90 — VendorChatModal mount removed (chat retired). */}
      </main>
    </>
  );
}

function SmartEmptyState({
  actions,
  onClearAll,
}: {
  actions: Array<{ label: string; action: () => void }>;
  onClearAll: () => void;
}) {
  return (
    <div
      className="mt-6 card p-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex w-12 h-12 rounded-full items-center justify-center mb-3" style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}>
        <Sparkles size={20} aria-hidden />
      </div>
      <h2 className="text-lg font-bold">לא נמצאו ספקים מתאימים</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
        ננסה להרחיב — כל פעולה כאן מעדכנת את הסינון בלחיצה אחת.
      </p>
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.action}
              className="rounded-full px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
              style={{
                background: "rgba(212,176,104,0.1)",
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="mt-3 text-xs"
        style={{ color: "var(--foreground-muted)" }}
      >
        נקה את כל הסינונים
      </button>

      {/* R37 — launch-honest invitation. We're building the catalog with
          the first vendors in Israel; turn an empty result into a
          recruiting moment instead of a dead end. */}
      <div
        className="mt-7 pt-6"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <p
          className="text-sm"
          style={{ color: "var(--foreground-soft)" }}
        >
          אנחנו בונים את הקטלוג יחד עם הספקים הראשונים בישראל.
        </p>
        <Link
          href="/vendors/join"
          className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition hover:translate-y-[-1px]"
          style={{
            background:
              "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
            color: "var(--gold-button-text)",
          }}
        >
          🎯 אתה ספק? הצטרף אלינו עכשיו
        </Link>
      </div>
    </div>
  );
}

/**
 * R87 (R69-2) — full-catalog empty state. Different from
 * SmartEmptyState (which assumes the catalog has rows but filters
 * are hiding them all). Used when there are literally zero approved
 * vendors in the system — the message is recruitment-first.
 */
function EmptyCatalog() {
  return (
    <div
      className="mt-6 card-gold p-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div
        className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
        style={{
          background:
            "linear-gradient(135deg, rgba(244,222,169,0.2), rgba(168,136,74,0.08))",
          border: "1px solid var(--border-gold)",
        }}
        aria-hidden
      >
        <span style={{ fontSize: 28 }}>🏪</span>
      </div>
      <h2 className="text-xl font-bold gradient-gold-shimmer">
        הקטלוג בהקמה
      </h2>
      <p
        className="mt-3 text-sm leading-relaxed max-w-md mx-auto"
        style={{ color: "var(--foreground-soft)" }}
      >
        אנחנו אוספים את הספקים הראשונים בישראל. אם אתם ספקי אירועים —
        הצטרפו עכשיו וקבלו דף נחיתה חינם בקטלוג.
      </p>
      <Link
        href="/vendors/join"
        className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition hover:translate-y-[-1px]"
        style={{
          background:
            "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
          color: "var(--gold-button-text)",
        }}
      >
        🎯 הצטרפו כספק
      </Link>
    </div>
  );
}
