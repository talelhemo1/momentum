"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  Save,
  Eye,
  Image as ImageIcon,
  Sparkles,
  ArrowRight,
  Camera,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import {
  TEMPLATE_LABELS,
  type LandingTemplate,
  type VendorLandingData,
} from "@/lib/types";
import { getVendorPhotoUrl, sanitizeFilename } from "@/lib/vendorStudio";

/**
 * R20 Phase 9 — Vendor Studio editor.
 *
 * Auth: any signed-in user can have ONE landing row (owner_user_id =
 * auth.uid()). The editor finds it via that constraint, or creates an
 * empty one on first save. The static catalog in lib/vendors.ts is
 * intentionally untouched — vendors entering the studio bring their own
 * data.
 */
export default function VendorStudioEditor() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<VendorLandingData | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tagline, setTagline] = useState("");
  const [aboutLong, setAboutLong] = useState("");
  const [template, setTemplate] = useState<LandingTemplate>("luxurious");
  const [serviceAreas, setServiceAreas] = useState("");
  const [languages, setLanguages] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [heroPhotoPath, setHeroPhotoPath] = useState<string | null>(null);
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);
  const [published, setPublished] = useState(false);
  // True when the Supabase env vars aren't set. Surfaced as a banner so
  // vendors stop wondering why "load" succeeded with empty fields.
  const [supabaseMissing, setSupabaseMissing] = useState(false);

  const loadVendor = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setSupabaseMissing(true);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/signup?returnTo=/dashboard/vendor-studio");
      return;
    }
    const { data } = (await supabase
      .from("vendor_landings")
      .select("*")
      .eq("owner_user_id", user.id)
      .maybeSingle()) as { data: VendorLandingData | null };

    if (data) {
      setVendor(data);
      setName(data.name ?? "");
      setCategory(data.category ?? "");
      setCity(data.city ?? "");
      setPhone(data.phone ?? "");
      setEmail(data.email ?? "");
      setWebsite(data.website ?? "");
      setInstagram(data.instagram ?? "");
      setFacebook(data.facebook ?? "");
      setTagline(data.tagline ?? "");
      setAboutLong(data.about_long ?? "");
      setTemplate(data.landing_template);
      setServiceAreas((data.service_areas ?? []).join(", "));
      setLanguages((data.languages ?? []).join(", "));
      setYearsExperience(data.years_experience?.toString() ?? "");
      setHeroPhotoPath(data.hero_photo_path);
      setGalleryPaths(data.gallery_paths ?? []);
      setPublished(data.landing_published);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // Documented "load on mount" pattern — same as the dashboard / report
    // / diagnose pages elsewhere in this project.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVendor();
  }, [loadVendor]);

  const handlePhotoUpload = async (file: File, isHero: boolean) => {
    // R11 P1 #6 — hard cap at 5MB and reject anything not a real raster
    // image. SVG can carry inline scripts; HTML pretending to be an image
    // never wins. The MIME check happens BEFORE the size check so the
    // error message is more specific.
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.type)) {
      showToast("רק קבצי JPG, PNG, WEBP, או GIF", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("התמונה גדולה מ-5MB. צמצם ונסה שוב.", "error");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      showToast("Supabase לא מוגדר", "error");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const stamp = Date.now();
    // Hebrew filenames + spaces would otherwise produce broken public URLs
    // (the read URL doesn't always percent-encode, and Supabase rejects
    // some non-ASCII paths outright).
    const path = `${user.id}/${stamp}-${sanitizeFilename(file.name)}`;
    const { error } = await supabase.storage
      .from("vendor-studio")
      .upload(path, file);
    if (error) {
      const raw = error.message ?? "";
      let userError = raw;
      if (/duplicate|already exists/i.test(raw)) {
        userError = "כבר קיים קובץ בשם הזה. נסה שוב.";
      } else if (/payload too large|413/i.test(raw)) {
        userError = "הקובץ גדול מדי.";
      } else if (/permission|policy|rls/i.test(raw)) {
        userError = "אין הרשאה להעלאה. וודא שאתה מחובר.";
      }
      showToast(userError, "error");
      return;
    }

    if (isHero) {
      setHeroPhotoPath(path);
    } else {
      setGalleryPaths((prev) => [...prev, path]);
    }
    showToast("תמונה הועלתה", "success");
  };

  const handleSave = async () => {
    // R11 P0 #3 — guard against rapid double-clicks. `saving` flips off
    // only in the error branches and at the end of the happy path, so the
    // window for a second INSERT (when vendor is still null) closes here.
    // The DB-level unique constraint (2026-05-13-vendor-fixes.sql) is the
    // belt; this is the suspenders.
    if (saving) return;
    if (!name.trim()) {
      showToast("חסר שם עסק", "error");
      return;
    }
    setSaving(true);

    const supabase = getSupabase();
    if (!supabase) {
      showToast("Supabase לא מוגדר", "error");
      setSaving(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("נדרשת התחברות", "error");
      setSaving(false);
      return;
    }

    const trimmed = {
      name: name.trim(),
      category: category.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      instagram: instagram.trim() || null,
      facebook: facebook.trim() || null,
      tagline: tagline.trim() || null,
      about_long: aboutLong.trim() || null,
      landing_template: template,
      service_areas: serviceAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      languages: languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      // R12 §3Q — parseInt returns NaN for "abc" which Postgres rejects
       // with a confusing error. Clamp to 0–80 (anyone claiming "150 years
       // in the industry" is either lying or made a typo).
      years_experience: (() => {
        if (!yearsExperience.trim()) return null;
        const n = parseInt(yearsExperience, 10);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.min(80, n));
      })(),
      hero_photo_path: heroPhotoPath,
      gallery_paths: galleryPaths,
      landing_published: published,
      landing_updated_at: new Date().toISOString(),
    };

    let slug = vendor?.slug ?? null;
    if (!slug) {
      const { data: slugData, error: slugErr } = (await supabase.rpc(
        "generate_vendor_slug",
        { p_name: trimmed.name, p_landing_id: vendor?.id ?? null },
      )) as { data: string | null; error: { message: string } | null };
      if (slugErr || !slugData) {
        // RPC missing / migration not run. Fall back to a client-generated
        // slug so the page stays reachable. The DB-side `slug unique`
        // constraint will still catch the rare collision and the user gets
        // a clear error toast below.
        if (slugErr) {
          console.error("[vendor-studio] slug rpc failed", slugErr);
        }
        const base = trimmed.name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9א-ת]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50);
        // R12 §3T — random suffix instead of Date.now (which is predictable
        // and lets an attacker guess upcoming slugs to squat on them).
        slug = `${base || "vendor"}-${crypto.randomUUID().slice(0, 6)}`;
      } else {
        slug = slugData;
      }
    }

    // Single helper so the friendly mapping is identical for both branches.
    const mapSaveError = (raw: string): string => {
      if (/duplicate|unique/i.test(raw)) {
        return "כבר קיים דף עם פרטים זהים. רענן וערוך מחדש.";
      }
      if (/does not exist|relation .* does not exist/i.test(raw)) {
        return "טבלת דפי הספקים לא קיימת. הרץ את 2026-05-12-vendor-studio.sql ב-Supabase.";
      }
      if (/permission|policy|rls/i.test(raw)) {
        return "אין הרשאה לשמירה. וודא שאתה מחובר.";
      }
      if (/network|fetch|failed to/i.test(raw)) {
        return "אין חיבור לאינטרנט. נסה שוב.";
      }
      return raw || "השמירה נכשלה";
    };

    if (vendor) {
      const { error } = await supabase
        .from("vendor_landings")
        .update({ ...trimmed, slug } as unknown as never)
        .eq("id", vendor.id);
      if (error) {
        showToast(mapSaveError(error.message ?? ""), "error");
        setSaving(false);
        return;
      }
      setVendor({ ...vendor, ...trimmed, slug } as VendorLandingData);
    } else {
      const { data: inserted, error } = (await supabase
        .from("vendor_landings")
        .insert({
          ...trimmed,
          slug,
          owner_user_id: user.id,
        } as unknown as never)
        .select("*")
        .single()) as {
        data: VendorLandingData | null;
        error: { message: string } | null;
      };
      if (error || !inserted) {
        showToast(mapSaveError(error?.message ?? ""), "error");
        setSaving(false);
        return;
      }
      setVendor(inserted);
    }

    showToast("השינויים נשמרו בהצלחה!", "success");
    setSaving(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  const previewUrl = vendor?.slug ? `/vendor/${vendor.slug}` : null;

  return (
    <main className="min-h-screen pb-20 px-5">
      <div className="max-w-3xl mx-auto pt-6">
        <Link
          href="/"
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--foreground-soft)" }}
        >
          <ArrowRight size={14} aria-hidden /> חזרה
        </Link>

        <div className="mt-6 text-center">
          <Sparkles size={32} className="mx-auto text-[--accent]" aria-hidden />
          <h1 className="mt-4 text-3xl font-extrabold gradient-gold">
            Vendor Studio
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            עיצוב דף הנחיתה המקצועי שלך — נראה ב-Google תוך 24 שעות
          </p>
        </div>

        {supabaseMissing && (
          <div
            className="mt-6 card p-4 flex items-start gap-3"
            style={{
              background: "rgba(248,113,113,0.08)",
              borderColor: "rgba(248,113,113,0.35)",
            }}
          >
            <AlertCircle
              size={18}
              className="shrink-0 mt-0.5 text-red-400"
              aria-hidden
            />
            <div className="text-sm">
              <div className="font-bold text-red-300">Supabase לא מוגדר</div>
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--foreground-soft)" }}
              >
                הוסף את <code>NEXT_PUBLIC_SUPABASE_URL</code> ו-
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ב-
                <code>.env.local</code> ואז הפעל מחדש את ה-dev server.
                בלעדיהם הטופס לא יישמר.
              </div>
            </div>
          </div>
        )}

        {previewUrl && vendor && (
          <div className="mt-6 card p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                הדף שלך
              </div>
              <div className="font-mono text-sm ltr-num truncate">{previewUrl}</div>
              {!vendor.landing_published && (
                <div
                  className="text-[10px] mt-1 inline-flex items-center gap-1"
                  style={{ color: "rgb(251,191,36)" }}
                >
                  ⚠ עדיין לא פורסם — תצוגה מקדימה זמינה רק לך
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {/* Owner-preview route works on unpublished drafts. The public
                  URL only resolves once landing_published is true. */}
              <a
                href={`/vendor/${vendor.slug}/preview`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl px-4 py-2 text-sm inline-flex items-center gap-2"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border-strong)",
                }}
              >
                <Eye size={14} aria-hidden /> תצוגה מקדימה
              </a>
              {vendor.landing_published && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold text-sm inline-flex items-center gap-2 px-4 py-2"
                >
                  פתח את הדף הציבורי
                </a>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-6">
          {/* Identity */}
          <section className="card p-5 grid gap-4">
            <h2 className="font-bold">פרטי העסק</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  שם העסק *
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  maxLength={80}
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  קטגוריה
                </span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input"
                  placeholder="צילום, DJ, קייטרינג..."
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  עיר
                </span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="input"
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  טלפון
                </span>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input text-start ltr-num"
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  מייל
                </span>
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input text-start"
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  אתר
                </span>
                <input
                  dir="ltr"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="input text-start"
                  placeholder="https://..."
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  Instagram (handle)
                </span>
                <input
                  dir="ltr"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="input text-start"
                  placeholder="yourstudio"
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  Facebook (page slug)
                </span>
                <input
                  dir="ltr"
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                  className="input text-start"
                />
              </label>
            </div>
          </section>

          {/* Template */}
          <section className="card p-5">
            <h2 className="font-bold mb-3">בחר עיצוב</h2>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TEMPLATE_LABELS) as LandingTemplate[]).map((t) => {
                const active = template === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTemplate(t)}
                    className="rounded-2xl p-3 transition text-center border"
                    style={
                      active
                        ? {
                            background: "rgba(212,176,104,0.15)",
                            borderColor: "var(--border-gold)",
                            borderWidth: 2,
                          }
                        : {
                            background: "var(--input-bg)",
                            borderColor: "var(--border)",
                          }
                    }
                  >
                    <div className="font-bold text-sm">{TEMPLATE_LABELS[t].label}</div>
                    <div
                      className="text-[10px] mt-1"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {TEMPLATE_LABELS[t].description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Hero */}
          <section className="card p-5">
            <h2 className="font-bold mb-3">תמונת ראשית (Hero)</h2>
            {heroPhotoPath && (
              <div className="relative rounded-2xl overflow-hidden mb-3 aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getVendorPhotoUrl(heroPhotoPath)}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setHeroPhotoPath(null)}
                  className="absolute top-2 end-2 p-2 rounded-full bg-black/60 text-white"
                  aria-label="הסר תמונה"
                >
                  ×
                </button>
              </div>
            )}
            <label
              className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed cursor-pointer hover:bg-white/5"
              style={{ borderColor: "var(--border)" }}
            >
              <Camera size={20} className="text-[--accent]" aria-hidden />
              <span className="text-sm">העלה תמונה ראשית</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePhotoUpload(f, true);
                  e.target.value = "";
                }}
              />
            </label>
          </section>

          {/* Text */}
          <section className="card p-5 grid gap-4">
            <label>
              <span
                className="text-xs block mb-1.5"
                style={{ color: "var(--foreground-soft)" }}
              >
                Tagline (משפט קצר)
              </span>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={120}
                className="input"
                placeholder="למשל: יוצרים את הרגעים שאתם תזכרו לכל החיים"
              />
            </label>
            <label>
              <span
                className="text-xs block mb-1.5"
                style={{ color: "var(--foreground-soft)" }}
              >
                אודות מפורט
              </span>
              <textarea
                value={aboutLong}
                onChange={(e) => setAboutLong(e.target.value)}
                rows={6}
                maxLength={2000}
                className="input"
                placeholder="ספר על העסק שלך, הניסיון, הסגנון, איך אתה עובד..."
              />
              <div
                className="text-[10px] text-end mt-1 ltr-num"
                style={{ color: "var(--foreground-muted)" }}
              >
                {aboutLong.length}/2000
              </div>
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  איזורי שירות (מופרד בפסיקים)
                </span>
                <input
                  value={serviceAreas}
                  onChange={(e) => setServiceAreas(e.target.value)}
                  className="input"
                  placeholder="תל אביב, מרכז, השרון"
                />
              </label>
              <label>
                <span
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  שפות
                </span>
                <input
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  className="input"
                  placeholder="עברית, אנגלית, רוסית"
                />
              </label>
            </div>
            <label>
              <span
                className="text-xs block mb-1.5"
                style={{ color: "var(--foreground-soft)" }}
              >
                שנות ניסיון
              </span>
              <input
                type="number"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                className="input ltr-num"
              />
            </label>
          </section>

          {/* Gallery */}
          <section className="card p-5">
            <h2 className="font-bold mb-3">
              גלריה (<span className="ltr-num">{galleryPaths.length}</span> תמונות)
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
              {galleryPaths.map((p, i) => (
                <div key={p} className="relative aspect-square rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getVendorPhotoUrl(p)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryPaths(galleryPaths.filter((_, j) => j !== i))
                    }
                    className="absolute top-1 end-1 p-1.5 rounded-full bg-black/60 text-white text-xs"
                    aria-label="הסר תמונה"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label
              className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed cursor-pointer hover:bg-white/5"
              style={{ borderColor: "var(--border)" }}
            >
              <ImageIcon size={20} className="text-[--accent]" aria-hidden />
              <span className="text-sm">הוסף תמונה לגלריה</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePhotoUpload(f, false);
                  e.target.value = "";
                }}
              />
            </label>
          </section>

          {/* Publish + Save */}
          <section className="card-gold p-5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-bold">פרסום הדף</div>
                <div
                  className="text-xs mt-1"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  הדף יופיע ב-Google ובחיפוש האפליקציה
                </div>
              </div>
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="w-5 h-5"
                style={{ accentColor: "var(--accent)" }}
              />
            </label>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-gold w-full mt-5 inline-flex items-center justify-center gap-2 py-4 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} aria-hidden />
              ) : (
                <>
                  <Save size={18} aria-hidden /> שמור שינויים
                </>
              )}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
