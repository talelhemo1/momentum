"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { CompareSkeleton } from "@/components/skeletons/PageSkeletons";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import { VENDORS } from "@/lib/vendors";
import { vendorImageFor } from "@/lib/images";
import { REGION_LABELS, VENDOR_TYPE_LABELS, type Vendor } from "@/lib/types";
import {
  ArrowRight,
  Star,
  ShieldCheck,
  Phone,
  X,
  Sparkles,
  Heart,
  Trophy,
} from "lucide-react";

export default function ComparePage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();

  useEffect(() => {
    if (userHydrated && !user) router.replace("/signup");
  }, [userHydrated, user, router]);

  const vendors = useMemo(() => {
    return state.compareVendors
      .map((id) => VENDORS.find((v) => v.id === id))
      .filter(Boolean) as Vendor[];
  }, [state.compareVendors]);

  // Compute "winner" per metric
  const bestRating = vendors.length > 0 ? Math.max(...vendors.map((v) => v.rating)) : 0;
  const bestPrice = vendors.length > 0 ? Math.min(...vendors.map((v) => v.priceFrom)) : 0;
  const mostReviews = vendors.length > 0 ? Math.max(...vendors.map((v) => v.reviews)) : 0;

  if (!hydrated) {
    return (
      <>
        <Header />
        <CompareSkeleton />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 pb-28 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 right-0 opacity-25" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/vendors" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה לספקים
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">השוואה</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
                השוואת ספקים
              </h1>
              <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
                עד 3 ספקים זה לצד זה — דירוג, מחיר, תכונות. החלטה חכמה תוך דקה.
              </p>
            </div>
            {vendors.length > 0 && (
              <button onClick={() => actions.clearCompare()} className="text-xs rounded-full px-3 py-1.5 inline-flex items-center gap-1.5" style={{ border: "1px solid var(--border)", color: "var(--foreground-muted)" }}>
                <X size={12} /> נקה הכל
              </button>
            )}
          </div>

          {vendors.length === 0 ? (
            <div className="card p-12 mt-10 text-center">
              <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4" style={{ background: "var(--surface-2)", border: "1px dashed var(--border-strong)", color: "var(--accent)" }}>
                <Sparkles size={28} />
              </div>
              <h3 className="text-xl font-bold">בחר ספקים להשוואה</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
                בעמוד הספקים — לחץ על אייקון <Trophy size={14} className="inline text-[--accent]" /> בכל ספק (עד 3) — וחזור לכאן.
              </p>
              <Link href="/vendors" className="btn-gold mt-5 inline-flex items-center gap-2">
                לעמוד הספקים
              </Link>
            </div>
          ) : (
            <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: `repeat(${vendors.length}, minmax(0, 1fr))` }}>
              {vendors.map((vendor, i) => (
                <CompareCard
                  key={vendor.id}
                  vendor={vendor}
                  meshIndex={i}
                  bestRating={bestRating}
                  bestPrice={bestPrice}
                  mostReviews={mostReviews}
                />
              ))}
            </div>
          )}

          {vendors.length > 0 && vendors.length < 3 && (
            <div className="mt-6 text-center">
              <Link href="/vendors" className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2">
                <Sparkles size={14} /> הוסף עוד ספק להשוואה ({3 - vendors.length} זמין)
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function CompareCard({
  vendor,
  meshIndex,
  bestRating,
  bestPrice,
  mostReviews,
}: {
  vendor: Vendor;
  meshIndex: number;
  bestRating: number;
  bestPrice: number;
  mostReviews: number;
}) {
  const isBestRating = vendor.rating === bestRating;
  const isCheapest = vendor.priceFrom === bestPrice;
  const isMostReviewed = vendor.reviews === mostReviews;
  const imageUrl = vendorImageFor(vendor.type, meshIndex);

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="aspect-[5/3] relative">
        <img src={imageUrl} alt={vendor.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        {vendor.inCatalog && (
          <span className="absolute top-3 start-3 pill pill-gold">
            <ShieldCheck size={11} /> בקטלוג
          </span>
        )}
        <button
          onClick={() => actions.toggleCompareVendor(vendor.id)}
          className="absolute top-3 end-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/15 hover:bg-black/70 flex items-center justify-center"
          aria-label="הסר מההשוואה"
        >
          <X size={14} className="text-white/85" />
        </button>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-bold text-lg leading-tight">{vendor.name}</h3>
        <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
          {VENDOR_TYPE_LABELS[vendor.type]} · {REGION_LABELS[vendor.region]}
        </div>

        <p className="text-sm mt-3 leading-relaxed line-clamp-2" style={{ color: "var(--foreground-soft)" }}>{vendor.description}</p>

        <div className="mt-4 space-y-3">
          <Row
            label="דירוג"
            value={
              <span className="inline-flex items-center gap-1 ltr-num font-bold">
                <Star size={13} className="text-[--accent]" fill="currentColor" />
                {vendor.rating}
              </span>
            }
            best={isBestRating}
          />
          <Row
            label="ביקורות"
            value={<span className="ltr-num font-bold">{vendor.reviews.toLocaleString("he-IL")}</span>}
            best={isMostReviewed}
          />
          <Row
            label="מחיר התחלתי"
            value={<span className="ltr-num font-bold gradient-gold">₪{vendor.priceFrom.toLocaleString("he-IL")}</span>}
            best={isCheapest}
          />
          <Row label="אזור" value={<span>{REGION_LABELS[vendor.region]}</span>} />
          <Row label="בקטלוג" value={<span>{vendor.inCatalog ? "✓" : "—"}</span>} />
        </div>

        <div className="mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs mb-2" style={{ color: "var(--foreground-muted)" }}>תגיות</div>
          <div className="flex flex-wrap gap-1.5">
            {vendor.tags.map((t) => (
              <span key={t} className="text-[11px] rounded-full px-2 py-0.5" style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--foreground-soft)" }}>{t}</span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => actions.toggleVendor(vendor.id)}
            className="btn-gold flex-1 text-sm py-2 inline-flex items-center justify-center gap-1.5"
          >
            <Heart size={14} /> בחר את זה
          </button>
          <a href={`tel:${vendor.phone}`} className="rounded-full p-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <Phone size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, best }: { label: string; value: React.ReactNode; best?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--foreground-muted)" }}>{label}</span>
      <span className="inline-flex items-center gap-1.5">
        {value}
        {best && (
          <span className="pill pill-gold !py-0.5 !px-1.5 text-[10px]">
            <Trophy size={9} /> הטוב ביותר
          </span>
        )}
      </span>
    </div>
  );
}
