"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone,
  MessageCircle,
  Globe,
  MapPin,
  Award,
  Sparkles,
  Languages,
  Star,
} from "lucide-react";
import { getVendorPhotoUrl } from "@/lib/vendorStudio";
import { safeHttpUrl } from "@/lib/safeUrl";
import { Logo } from "@/components/Logo";
import { VendorRatingSummary } from "@/components/vendors/VendorRatingSummary";
import { ReviewCard } from "@/components/vendors/ReviewCard";
import {
  InstagramGlyph,
  FacebookGlyph,
} from "@/components/vendors/typeIcons";
import type { VendorLandingData, VendorReview } from "@/lib/types";

/**
 * R20 Phase 9 — Luxurious template.
 *
 * Black background, gold gradient text, full-bleed hero. The other two
 * templates (Modern, Rustic) currently delegate to this one as MVP
 * placeholders — they'll get distinct designs in Phase 10.
 */
export interface TemplateProps {
  vendor: VendorLandingData;
  reviews: VendorReview[];
  onAction: (a: string) => void;
  whatsappUrl: string;
  // R12 §3U — pre-built `tel:` URL with normalized E.164 digits.
  // Computed once in VendorLandingClient so all three templates share the
  // exact same normalization (was `tel:${vendor.phone}` raw which broke on
  // numbers stored as "050-1234567" or "+972 50-123-4567").
  telUrl: string;
}

export function LuxuriousTemplate({
  vendor,
  reviews,
  onAction,
  whatsappUrl,
  telUrl,
}: TemplateProps) {
  const [activePhoto, setActivePhoto] = useState(0);
  const heroImg = vendor.hero_photo_path
    ? getVendorPhotoUrl(vendor.hero_photo_path)
    : null;
  const galleryUrls = vendor.gallery_paths
    .map(getVendorPhotoUrl)
    .filter((u): u is string => Boolean(u));

  return (
    <main className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      {/* === HERO === */}
      <section className="relative min-h-[80vh] flex items-end overflow-hidden">
        {heroImg && (
          <div className="absolute inset-0">
            {/* Public Supabase Storage URL — next/image needs an allow-list
                for remote patterns we don't manage. <img> is intentional. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImg}
              alt={vendor.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          </div>
        )}

        <div className="relative max-w-5xl mx-auto px-5 pb-16 pt-32 w-full">
          <div className="absolute top-6 end-5 flex items-center gap-2">
            <Logo size={18} />
            <span
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--foreground-muted)" }}
            >
              powered by Momentum
            </span>
          </div>

          <div className="max-w-2xl">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4"
              style={{
                background: "linear-gradient(135deg, #F4DEA9, #A8884A)",
                color: "#1A1310",
              }}
            >
              <Sparkles size={11} aria-hidden /> {vendor.category ?? "ספק"}
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight gradient-gold leading-[1.05]">
              {vendor.name}
            </h1>
            {vendor.tagline && (
              <p
                className="mt-4 text-xl md:text-2xl font-light"
                style={{ color: "var(--foreground-soft)" }}
              >
                {vendor.tagline}
              </p>
            )}

            <div
              className="mt-6 flex items-center gap-5 flex-wrap text-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              {vendor.city && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden /> {vendor.city}
                </span>
              )}
              {vendor.years_experience && (
                <span className="inline-flex items-center gap-1.5 ltr-num">
                  <Award size={14} aria-hidden /> {vendor.years_experience} שנים בתחום
                </span>
              )}
              <VendorRatingSummary vendorId={vendor.id} compact />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onAction("whatsapp")}
                  className="btn-gold inline-flex items-center gap-2 px-7 py-4 text-base"
                >
                  <MessageCircle size={18} aria-hidden /> שלח הודעה ב-WhatsApp
                </a>
              )}
              {telUrl && (
                <a
                  href={telUrl}
                  onClick={() => onAction("phone")}
                  className="rounded-2xl px-7 py-4 text-base inline-flex items-center gap-2 backdrop-blur-md"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  <Phone size={18} aria-hidden /> התקשר
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === ABOUT === */}
      {vendor.about_long && (
        <section className="max-w-3xl mx-auto px-5 py-16">
          <h2 className="text-3xl font-extrabold mb-6 gradient-gold">קצת עליי</h2>
          <p
            className="text-lg leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--foreground-soft)" }}
          >
            {vendor.about_long}
          </p>

          {(vendor.service_areas.length > 0 || vendor.languages.length > 0) && (
            <div className="mt-8 grid sm:grid-cols-2 gap-6">
              {vendor.service_areas.length > 0 && (
                <div>
                  <h3
                    className="text-xs uppercase tracking-wider mb-2"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    איזורי שירות
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {vendor.service_areas.map((area) => (
                      <span
                        key={area}
                        className="text-sm px-3 py-1.5 rounded-full"
                        style={{
                          background: "var(--input-bg)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {vendor.languages.length > 0 && (
                <div>
                  <h3
                    className="text-xs uppercase tracking-wider mb-2 inline-flex items-center gap-1"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    <Languages size={11} aria-hidden /> שפות
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {vendor.languages.map((lang) => (
                      <span
                        key={lang}
                        className="text-sm px-3 py-1.5 rounded-full"
                        style={{
                          background: "var(--input-bg)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* === GALLERY === */}
      {galleryUrls.length > 0 && (
        <section className="py-16" style={{ background: "var(--surface-1)" }}>
          <div className="max-w-6xl mx-auto px-5">
            <h2 className="text-3xl font-extrabold mb-2 gradient-gold">תיק עבודות</h2>
            <p
              className="text-sm mb-8"
              style={{ color: "var(--foreground-soft)" }}
            >
              רגעים אמיתיים מאירועים שצילמנו / עיצבנו / השתתפנו בהם
            </p>

            <button
              type="button"
              className="block w-full mb-4 rounded-3xl overflow-hidden"
              onClick={() => onAction("gallery_open")}
              aria-label="פתח גלריה"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={galleryUrls[activePhoto]}
                alt=""
                className="w-full max-h-[600px] object-cover"
              />
            </button>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {galleryUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  className={`aspect-square rounded-xl overflow-hidden transition ${
                    i === activePhoto
                      ? "ring-2 ring-[--accent]"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  aria-label={`תמונה ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* === REVIEWS === */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-5">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-extrabold gradient-gold">דירוגים מלקוחות</h2>
            <Star size={28} className="text-[--accent]" aria-hidden />
          </div>

          <VendorRatingSummary vendorId={vendor.id} />

          {reviews.length > 0 && (
            <div className="mt-8 space-y-4">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* === CONTACT FOOTER === */}
      <section className="py-16" style={{ background: "var(--surface-1)" }}>
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-4xl font-extrabold gradient-gold mb-4">בואו נדבר</h2>
          <p
            className="text-base mb-8"
            style={{ color: "var(--foreground-soft)" }}
          >
            מעוניינים בשירות שלי? יצירת קשר זה התחלה של חתונה מושלמת.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onAction("whatsapp")}
                className="btn-gold inline-flex items-center gap-2 px-8 py-4"
              >
                <MessageCircle size={18} aria-hidden /> שלח WhatsApp
              </a>
            )}
            {(() => {
              // R11 P1 #8 — sanitize every URL before it lands in href.
              // `safeHttpUrl` drops javascript:/data:/file: schemes; the
              // instagram/facebook handles get encoded + the leading "@"
              // is stripped so "@studio" → "studio" → encoded.
              const safeWebsite = safeHttpUrl(vendor.website);
              const igHandle = vendor.instagram?.replace(/^@/, "").trim();
              const fbHandle = vendor.facebook?.trim();
              return (
                <>
                  {safeWebsite && (
                    <a
                      href={safeWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onAction("website")}
                      className="rounded-2xl px-6 py-4 inline-flex items-center gap-2"
                      style={{
                        background: "var(--input-bg)",
                        border: "1px solid var(--border-strong)",
                      }}
                    >
                      <Globe size={18} aria-hidden /> אתר
                    </a>
                  )}
                  {igHandle && (
                    <a
                      href={`https://instagram.com/${encodeURIComponent(igHandle)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onAction("instagram")}
                      className="rounded-2xl px-6 py-4 inline-flex items-center gap-2"
                      style={{
                        background: "var(--input-bg)",
                        border: "1px solid var(--border-strong)",
                      }}
                    >
                      <InstagramGlyph size={18} /> Instagram
                    </a>
                  )}
                  {fbHandle && (
                    <a
                      href={`https://facebook.com/${encodeURIComponent(fbHandle)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onAction("facebook")}
                      className="rounded-2xl px-6 py-4 inline-flex items-center gap-2"
                      style={{
                        background: "var(--input-bg)",
                        border: "1px solid var(--border-strong)",
                      }}
                    >
                      <FacebookGlyph size={18} /> Facebook
                    </a>
                  )}
                </>
              );
            })()}
          </div>

          <div
            className="mt-12 pt-8 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              <Logo size={16} />
              דף נוצר על ידי Momentum — פלטפורמת תכנון אירועים בישראל
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
