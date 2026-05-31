"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Eye,
  MousePointerClick,
  Inbox,
  Star,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Copy,
  TrendingUp,
  User,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
// ArrowLeft was used by the old sticky header (removed in R142 in
// favor of the vendor hero) but is still imported by some sibling
// pages — kept in the lucide list above only when needed there.
import { getSupabase } from "@/lib/supabase";
// R90 — VendorInboxCard removed (in-app chat retired).
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";
// R144 — vendor pages now use the SAME premium global Header as the
// host dashboard (with VENDOR_HEADER_NAV pills since R142). The old
// VendorNav sidebar + sticky band combo made the vendor area feel
// like a settings panel; the global Header keeps the brand consistent
// across the app.
import { Header } from "@/components/Header";
import { QrCanvas } from "@/components/QrCanvas";
import { tryGetPublicOrigin } from "@/lib/origin";
import { useNow } from "@/lib/useNow";
import { useVendorContext } from "@/lib/useVendorContext";
import { VENDOR_CATEGORIES } from "@/lib/vendorApplication";
import type {
  VendorLandingData,
  VendorLead,
  VendorReview,
} from "@/lib/types";

// R123 — turn the raw category id (e.g. "music-dj") into the Hebrew
// label ("DJ ולהקות"). Falls back to the id if the category was
// renamed/removed from the catalog list.
function categoryLabel(id?: string): string {
  if (!id) return "—";
  return VENDOR_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/**
 * Vendor dashboard — the home page for an authenticated vendor account.
 *
 * Pulls all aggregations client-side via the user's JWT (RLS-friendly,
 * no service role needed). The vendor sees only their own data because
 * every table involved has a "where owner = auth.uid()" policy.
 *
 * Sections (in order):
 *   1. 4 metric cards: views 7d, action clicks 7d, active leads, new reviews 30d.
 *   2. Profile completeness — % filled + checklist of missing fields.
 *   3. 4 big quick-action buttons.
 *   4. Activity feed — last 10 events (new leads + new reviews).
 *
 * If the user is signed in but has no landing yet → EmptyState pointing
 * them at the studio editor. If not signed in → redirect.
 */

interface DashboardMetrics {
  views7d: number;
  clicks7d: number;
  activeLeads: number;
  newReviews30d: number;
}

interface ActivityItem {
  id: string;
  type: "lead" | "review";
  label: string;
  timestamp: string;
}

interface ProfileChecks {
  hero: boolean;
  galleryRich: boolean; // 3+ photos
  aboutLong: boolean; // 100+ chars
  serviceAreas: boolean;
  languages: boolean;
  certifications: boolean;
  video: boolean;
}

function computeCompleteness(landing: VendorLandingData): {
  percent: number;
  checks: ProfileChecks;
  missing: string[];
} {
  const checks: ProfileChecks = {
    hero: !!landing.hero_photo_path,
    galleryRich: (landing.gallery_paths ?? []).length >= 3,
    aboutLong: !!landing.about_long && landing.about_long.length >= 100,
    serviceAreas: (landing.service_areas ?? []).length > 0,
    languages: (landing.languages ?? []).length > 0,
    certifications: (landing.certifications ?? []).length > 0,
    video: !!landing.video_url,
  };
  const total = Object.keys(checks).length;
  const done = Object.values(checks).filter(Boolean).length;
  const labels: Record<keyof ProfileChecks, string> = {
    hero: "תמונת ראשית (Hero)",
    galleryRich: "לפחות 3 תמונות בגלריה",
    aboutLong: "תיאור מפורט (100+ תווים)",
    serviceAreas: "אזורי שירות",
    languages: "שפות",
    certifications: "תעודות / הסמכות",
    video: "סרטון תדמית",
  };
  const missing = (Object.keys(checks) as Array<keyof ProfileChecks>)
    .filter((k) => !checks[k])
    .map((k) => labels[k]);
  return { percent: Math.round((done / total) * 100), checks, missing };
}

export default function VendorDashboardPage() {
  const router = useRouter();
  const {
    isVendor,
    vendorLanding,
    application,
    isLoading: ctxLoading,
  } = useVendorContext();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Differentiate "not signed in" from "signed in but no vendor profile"
  // — the two need different CTAs and the hook doesn't tell us which.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  // R18 §I — "link copied" feedback for the fresh-vendor onboarding card.
  const [linkCopied, setLinkCopied] = useState(false);
  // React 19 purity: Date.now() can't be called during render. Single
  // "now" snapshot via the shared hook (null on first/SSR render).
  const nowMs = useNow(null);

  // React 19 compiler is strict about derived-prop dependencies. Pull
  // the strings we read into stable locals so the dep array matches.
  const vendorSlug = vendorLanding?.slug ?? null;
  const vendorLandingId = vendorLanding?.id ?? null;
  const loadMetrics = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !vendorSlug || !vendorLandingId) return;
    const slug = vendorSlug;
    const landingIdAsText = vendorLandingId;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // page_views / page_actions store vendor_id as the landing UUID
    // (per VendorLandingClient.trackPageView). vendor_reviews +
    // vendor_leads use slug. Query each with the correct identifier.
    const [viewsRes, actionsRes, leadsRes, reviewsRes, recentLeadsRes, recentReviewsRes] =
      await Promise.all([
        supabase
          .from("vendor_page_views")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", landingIdAsText)
          .gte("viewed_at", sevenDaysAgo.toISOString()),
        supabase
          .from("vendor_page_actions")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", landingIdAsText)
          .in("action_type", ["whatsapp", "phone", "website"])
          .gte("action_at", sevenDaysAgo.toISOString()),
        supabase
          .from("vendor_leads")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", slug)
          .eq("status", "pending"),
        supabase
          .from("vendor_reviews")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", slug)
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("vendor_leads")
          .select("id, couple_name, message, status, created_at")
          .eq("vendor_id", slug)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("vendor_reviews")
          .select("id, overall_rating, title, created_at")
          .eq("vendor_id", slug)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const m: DashboardMetrics = {
      views7d: (viewsRes as { count: number | null }).count ?? 0,
      clicks7d: (actionsRes as { count: number | null }).count ?? 0,
      activeLeads: (leadsRes as { count: number | null }).count ?? 0,
      newReviews30d: (reviewsRes as { count: number | null }).count ?? 0,
    };
    setMetrics(m);

    const act: ActivityItem[] = [];
    for (const l of ((recentLeadsRes as { data: VendorLead[] | null }).data ?? [])) {
      act.push({
        id: `lead-${l.id}`,
        type: "lead",
        label: `ליד חדש מ-${l.couple_name ?? "זוג"}${l.message ? ` — "${l.message.slice(0, 40)}"` : ""}`,
        timestamp: l.created_at,
      });
    }
    for (const r of ((recentReviewsRes as { data: VendorReview[] | null }).data ?? [])) {
      act.push({
        id: `review-${r.id}`,
        type: "review",
        label: `ביקורת חדשה — ${r.overall_rating}⭐${r.title ? ` "${r.title.slice(0, 40)}"` : ""}`,
        timestamp: r.created_at,
      });
    }
    act.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setActivity(act.slice(0, 10));
  }, [vendorSlug, vendorLandingId]);

  useEffect(() => {
    if (ctxLoading) return;

    // Not signed in / not a vendor — let the render branch show the
    // EmptyState. Flip loading off immediately so the spinner doesn't
    // sit indefinitely.
    if (!isVendor) {
      // Quick auth probe so the empty state can pick the right CTA.
      // Both setState calls below run synchronously in the effect, hence
      // the inline disable — same documented "load on mount" pattern.
      const supabase = getSupabase();
      if (supabase) {
        void supabase.auth.getUser().then(({ data }) => {
          setIsAuthenticated(!!data.user);
        });
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsAuthenticated(false);
      }
      setLoading(false);
      return;
    }

    // R12 §2J — wrap async work in try/catch/finally so a hung call
    // never leaves a spinner stuck.
    const controller = new AbortController();
    let aborted = false;
    const hardTimeout = window.setTimeout(() => {
      if (aborted) return;
      setError("הטעינה לוקחת יותר מהרגיל. בדוק חיבור לאינטרנט או רענן.");
      setLoading(false);
    }, 12000);

    (async () => {
      try {
        await loadMetrics();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          aborted = true;
          return;
        }
        console.error("[vendors/dashboard]", e);
        setError(e instanceof Error ? e.message : "שגיאה בטעינת הדשבורד");
      } finally {
        window.clearTimeout(hardTimeout);
        if (!aborted) setLoading(false);
      }
    })();

    // R14 §I — realtime subscribe to new leads. Refresh metrics on insert.
    const supabase = getSupabase();
    const channel = supabase
      ?.channel(`vendor_${vendorSlug ?? "none"}_leads`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_leads",
          filter: `vendor_id=eq.${vendorSlug ?? ""}`,
        },
        () => {
          void loadMetrics();
        },
      )
      .subscribe();

    return () => {
      aborted = true;
      window.clearTimeout(hardTimeout);
      controller.abort();
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [ctxLoading, isVendor, vendorSlug, loadMetrics, router]);

  // ─── Render branches ──────────────────────────────────────────────

  if (ctxLoading || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!isVendor) {
    // Not authenticated → ask to sign in.
    if (isAuthenticated === false) {
      return (
        <main className="min-h-screen flex items-center justify-center px-5">
          <div className="card p-8 text-center max-w-md">
            <Sparkles size={32} className="mx-auto text-[--accent]" aria-hidden />
            <h1 className="mt-4 text-xl font-bold">כניסה לדשבורד הספק</h1>
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              התחבר עם החשבון שלך כדי לראות לידים, ביקורות, ואנליטיקס.
              אם עוד אין לך פרופיל — תוכל להקים אותו אחרי ההתחברות.
            </p>
            <Link
              href="/signup?role=vendor&returnTo=/vendors/dashboard"
              className="btn-gold mt-5 inline-flex items-center gap-2"
            >
              <ArrowUpRight size={14} aria-hidden /> התחבר / הירשם
            </Link>
          </div>
        </main>
      );
    }

    // R114 — pending application: the user submitted /vendors/join and
    // is waiting on admin approval. Show a premium "under review"
    // screen instead of the generic "create profile" CTA.
    if (application.status === "pending") {
      return <ApplicationPendingScreen application={application} />;
    }

    // Rejected: tell them why + give a path to reapply.
    if (application.status === "rejected") {
      return <ApplicationRejectedScreen application={application} />;
    }

    // No application at all — surface BOTH paths so the user picks:
    // (1) the formal application (admin-approved, listed in catalog)
    // (2) the vendor-studio quick path (instant landing, paid tier).
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <Sparkles size={32} className="mx-auto text-[--accent]" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">ברוך/ה הבא/ה ל-Momentum לספקים</h1>
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--foreground-soft)" }}
          >
            כדי להתחיל לקבל לידים, מלא את טופס ההרשמה כספק — לוקח 3 דקות.
            לאחר אישור הצוות, הפרופיל שלך יופיע בקטלוג ותוכל לקבל הודעות
            מזוגות.
          </p>
          <Link
            href="/vendors/join"
            className="btn-gold mt-5 inline-flex items-center gap-2"
          >
            <ArrowUpRight size={14} aria-hidden /> מילוי טופס ספק
          </Link>
          <div
            className="mt-4 text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            כבר מילאת? תוודא/י שאתה/את מחובר/ת עם אותו מייל שמילאת בטופס.
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle size={32} className="mx-auto text-amber-400" aria-hidden />
          <p className="mt-4 text-sm" style={{ color: "var(--foreground-soft)" }}>
            {error}
          </p>
        </div>
      </main>
    );
  }

  // R122 — was `return null` (blank page). Now: if the vendor IS approved
  // (vendorLanding loaded) but the metrics fetch is still pending, show a
  // calm "loading dashboard" panel instead of a black screen. If after
  // hydration the landing exists but metrics never returned, surface a
  // retry CTA so the vendor has something actionable.
  if (!vendorLanding) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle size={32} className="mx-auto text-amber-400" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">הדשבורד עוד לא מוכן</h1>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--foreground-soft)" }}
          >
            הבקשה שלך אושרה אבל דף הספק עוד לא נוצר ברקע. זה לרוב נגמר תוך
            רגעים. אם זה ממשיך — צור קשר ונתקן ידנית.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="btn-gold inline-flex items-center justify-center gap-2"
            >
              נסה שוב
            </button>
            <a
              href="mailto:talhemo132@gmail.com?subject=דשבורד%20ספק%20לא%20נטען"
              className="text-xs"
              style={{ color: "var(--accent)" }}
            >
              talhemo132@gmail.com
            </a>
          </div>
        </div>
      </main>
    );
  }
  if (!metrics) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <Loader2
            size={26}
            className="mx-auto animate-spin"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <p
            className="mt-4 text-sm"
            style={{ color: "var(--foreground-soft)" }}
          >
            טוען את הסטטיסטיקות של הדף שלך…
          </p>
        </div>
      </main>
    );
  }

  const completeness = computeCompleteness(vendorLanding);

  // R18 §I — fresh-vendor onboarding state. A brand-new profile with no
  // traffic yet shouldn't look "broken" (all-zero metrics) — explain
  // that views take ~48h and hand them tools to drive their own.
  const profileAgeDays = (() => {
    if (nowMs == null) return 999; // not resolved yet → don't flash banner
    const t = new Date(vendorLanding.created_at).getTime();
    if (Number.isNaN(t)) return 999;
    return (nowMs - t) / 86_400_000;
  })();
  const isFreshVendor =
    metrics.views7d === 0 &&
    metrics.activeLeads === 0 &&
    profileAgeDays < 7;
  const publicUrl = vendorLanding.slug
    ? `${tryGetPublicOrigin()}/vendor/${vendorLanding.slug}`
    : "";
  const copyPublicLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      /* clipboard blocked — the link is visible to copy manually */
    }
  };

  // R142 — vendor hero. Replaces the thin sticky header with a
  // premium "save-the-business-card" identity strip: a gold-bordered
  // hero pulling the vendor's name + category + city + status, plus
  // the most actionable CTAs (view public page, edit landing).
  const categoryLabelStr = categoryLabel(vendorLanding.category ?? undefined);

  return (
    <>
      <Header />
      <main
        className="min-h-screen pb-20"
        style={{ background: "var(--surface-0)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 space-y-6">
        {/* R142 — premium vendor hero. Pre-R142 the page opened with
            a thin grey "Vendor Dashboard" band that gave zero
            identity. The new hero anchors the page with the vendor's
            brand: name in serif, category + city + tier as gold
            chips, and the two most-clicked CTAs (view public page,
            edit landing) right at the top. */}
        <section
          className="relative overflow-hidden rounded-3xl"
          style={{
            background:
              "radial-gradient(120% 70% at 50% -20%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), linear-gradient(180deg, var(--background-2), var(--background))",
            border: "1px solid var(--border-gold)",
            boxShadow:
              "inset 0 1px 0 rgba(244,222,169,0.18), 0 24px 60px -28px var(--accent-glow)",
          }}
        >
          <span
            aria-hidden
            className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-[60%] pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--accent), transparent)",
              opacity: 0.55,
            }}
          />
          <div className="relative z-10 px-6 sm:px-8 py-7 md:py-8 flex flex-wrap items-start gap-5 justify-between">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold"
                style={{
                  background: "rgba(0,0,0,0.32)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }}
              >
                <Sparkles size={11} aria-hidden /> דשבורד ספק
              </span>
              <h1
                className="mt-3 font-extrabold tracking-tight gradient-gold-shimmer leading-tight"
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "clamp(1.75rem, 4.4vw, 2.5rem)",
                }}
              >
                {vendorLanding.name}
              </h1>
              <div
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
                style={{ color: "var(--foreground-soft)" }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  {categoryLabelStr}
                </span>
                {vendorLanding.city && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--accent)", opacity: 0.5 }}
                    />
                    {vendorLanding.city}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {publicUrl ? (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                  title="פותח את הדף בלשונית חדשה — זה מה שמוזמנים רואים"
                >
                  <Eye size={13} aria-hidden /> צפה בדף הציבורי
                </a>
              ) : (
                // R143 — landing has no slug yet (orphan / never-saved
                // record). Show a disabled affordance + tooltip rather
                // than letting the user click a button that takes them
                // to "" (= current URL, looks broken). Pointing them at
                // the editor is the actionable next step.
                <span
                  className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 opacity-50 cursor-not-allowed"
                  title="הדף שלך עוד לא פורסם. עבור ל'ערוך דף נחיתה' כדי להגדיר שם וכתובת."
                  aria-disabled
                >
                  <Eye size={13} aria-hidden /> דף ציבורי לא פורסם
                </span>
              )}
              <Link
                href="/dashboard/vendor-studio"
                className="btn-gold text-xs py-2 px-3 inline-flex items-center gap-1.5"
              >
                <ImageIcon size={13} aria-hidden /> ערוך דף נחיתה
              </Link>
            </div>
          </div>
        </section>

        {/* R43 — vendor chat inbox entry (unread count). */}
        {/* R90 — VendorInboxCard removed (in-app chat retired). */}

        {/* R18 §I — fresh-vendor onboarding banner. */}
        {isFreshVendor && publicUrl && (
          <section
            className="card-gold p-6"
            style={{ border: "1px solid var(--border-gold)" }}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full mb-3" style={{ background: "rgba(212,176,104,0.12)", color: "var(--accent)" }}>
                  <Sparkles size={12} aria-hidden /> הפרופיל שלך חי
                </div>
                <h2 className="text-lg font-bold">
                  צפיות ראשונות מגיעות בדרך כלל תוך 48 שעות
                </h2>
                <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
                  הקטלוג עדיין מאנדקס את הפרופיל. בינתיים — שתף את הקישור
                  הישיר כדי להאיץ את התנועה הראשונה.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyPublicLink}
                    className="btn-gold inline-flex items-center gap-2 text-sm px-4 py-2"
                  >
                    {linkCopied ? (
                      <><CheckCircle2 size={14} aria-hidden /> הקישור הועתק</>
                    ) : (
                      <><Copy size={14} aria-hidden /> העתק קישור</>
                    )}
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {publicUrl}
                  </a>
                </div>
                <p className="mt-3 text-xs" style={{ color: "var(--foreground-muted)" }}>
                  💡 טיפ: שתף את הקישור בסטורי באינסטגרם להאצת התנועה
                </p>
              </div>
              <div className="shrink-0 mx-auto md:mx-0">
                <QrCanvas value={publicUrl} size={148} />
              </div>
            </div>
          </section>
        )}

        {/* 4 metric cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={<Eye size={20} aria-hidden />}
            label="צפיות (7 ימים)"
            value={metrics.views7d}
            color="gold"
          />
          <MetricCard
            icon={<MousePointerClick size={20} aria-hidden />}
            label="לחיצות אקשן (7 ימים)"
            value={metrics.clicks7d}
            color="emerald"
          />
          <MetricCard
            icon={<Inbox size={20} aria-hidden />}
            label="לידים פעילים"
            value={metrics.activeLeads}
            color="amber"
            highlight={metrics.activeLeads > 0}
          />
          <MetricCard
            icon={<Star size={20} aria-hidden />}
            label="ביקורות (30 ימים)"
            value={metrics.newReviews30d}
            color="purple"
          />
        </section>

        {/* Profile completeness */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2">
              <User size={18} className="text-[--accent]" aria-hidden />
              שלמות הפרופיל
            </h2>
            <span className="text-2xl font-extrabold ltr-num gradient-gold">
              {completeness.percent}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden mb-4"
            style={{ background: "var(--input-bg)" }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${completeness.percent}%`,
                background:
                  "linear-gradient(90deg, var(--gold-100), var(--accent), var(--gold-500))",
              }}
            />
          </div>
          {completeness.missing.length > 0 ? (
            <div>
              <div
                className="text-xs uppercase tracking-wider mb-2"
                style={{ color: "var(--foreground-muted)" }}
              >
                חסרים השדות הבאים:
              </div>
              <ul className="space-y-1.5">
                {completeness.missing.map((m) => (
                  <li
                    key={m}
                    className="text-sm flex items-center gap-2"
                    style={{ color: "var(--foreground-soft)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {m}
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/vendor-studio"
                className="btn-gold mt-4 text-xs inline-flex items-center gap-2 px-4 py-2"
              >
                <ArrowUpRight size={12} aria-hidden /> השלם פרופיל
              </Link>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 size={16} aria-hidden /> פרופיל מושלם ✨
            </div>
          )}
        </section>

        {/* R142 — quick actions, expanded from 4 → 6 to surface every
            primary vendor task explicitly: leads, messages, active
            events, edit landing, reviews, upgrade. Three columns on
            desktop so the grid stays readable; two on tablet; one on
            mobile. Each card keeps the same visual rhythm — icon
            chip, big label, small subline. The `highlight` flag adds
            the gold border + accent text when there's something
            actionable (pending leads, free tier with upgrade prompt). */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction
            href="/vendors/dashboard/leads"
            icon={<Inbox size={22} aria-hidden />}
            label="לידים"
            sub={
              metrics.activeLeads > 0
                ? `${metrics.activeLeads} ממתינים לתגובה`
                : "כל הלידים שהזוגות שלחו"
            }
            highlight={metrics.activeLeads > 0}
          />
          <QuickAction
            href="/vendors/dashboard/inbox"
            icon={<Inbox size={22} aria-hidden />}
            label="הודעות"
            sub="שיחות פעילות עם זוגות"
          />
          <QuickAction
            href="/vendors/dashboard/leads?filter=active"
            icon={<Sparkles size={22} aria-hidden />}
            label="אירועים פעילים"
            sub="לידים שאתה כבר עובד עליהם"
          />
          <QuickAction
            href="/dashboard/vendor-studio"
            icon={<ImageIcon size={22} aria-hidden />}
            label="עריכת דף הנחיתה"
            sub="עיצוב, תמונות, תיאור"
          />
          <QuickAction
            href="/vendors/dashboard/analytics#reviews"
            icon={<Star size={22} aria-hidden />}
            label="ביקורות"
            sub="דירוגים מאומתים מזוגות"
          />
        </section>

        {/* Activity feed */}
        <section className="card p-6">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Clock size={18} className="text-[--accent]" aria-hidden />
            פעילות אחרונה
          </h2>
          {activity.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={28} aria-hidden />}
              title="עדיין אין פעילות"
              description="לידים וביקורות חדשים יופיעו כאן ברגע שיגיעו."
            />
          ) : (
            <div className="space-y-2">
              {activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: "var(--input-bg)" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        a.type === "lead" ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                      aria-hidden
                    />
                    <span className="text-sm">{a.label}</span>
                  </div>
                  <div
                    className="text-xs ltr-num shrink-0"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {new Date(a.timestamp).toLocaleString("he-IL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>
      </main>
    </>
  );
}

/**
 * R114 — premium "your application is being reviewed" screen.
 *
 * Shown to a vendor who submitted /vendors/join but doesn't yet have
 * a vendor_landings row (admin hasn't approved). Before this screen
 * existed, these users landed on a generic "no vendor profile" CTA
 * that re-prompted them to create one — confusing because they'd
 * already done the work.
 *
 * Layout: gradient glass card with the application's business name +
 * category + submission time, a clear "what happens next" timeline,
 * a support contact link, and a refresh button for the impatient.
 */
function ApplicationPendingScreen({
  application,
}: {
  application: {
    businessName?: string;
    category?: string;
    submittedAt?: string;
  };
}) {
  const submittedFmt = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-32 -end-32 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(212,176,104,0.22), transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div className="w-full max-w-lg relative z-10">
        <div className="flex justify-center mb-6">
          <Logo size={28} />
        </div>
        <div
          className="card glass-strong p-7 rounded-3xl"
          style={{ border: "1px solid var(--border-gold)" }}
        >
          {/* Icon + headline */}
          <div className="flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-2xl inline-flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(244,222,169,0.18), rgba(168,136,74,0.06))",
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }}
            >
              <Clock size={28} aria-hidden />
            </div>
            <h1 className="mt-5 text-2xl font-extrabold gradient-gold leading-tight">
              הבקשה שלך בבדיקה
            </h1>
            <p
              className="mt-2 text-sm leading-relaxed max-w-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              קיבלנו את ההרשמה שלך כספק ב-Momentum. הצוות שלנו עובר עליה כעת —
              בדרך כלל הבדיקה אורכת <strong>1-3 ימי עסקים</strong>.
            </p>
          </div>

          {/* Application summary */}
          {(application.businessName || application.category || submittedFmt) && (
            <div
              className="mt-6 rounded-2xl p-4"
              style={{
                background:
                  "color-mix(in srgb, var(--gold-100) 5%, var(--input-bg))",
                border: "1px solid var(--border-gold)",
              }}
            >
              <div
                className="text-[10px] uppercase tracking-widest mb-2"
                style={{ color: "var(--foreground-muted)" }}
              >
                פרטי הבקשה
              </div>
              <dl className="space-y-1.5 text-sm">
                {application.businessName && (
                  <div className="flex justify-between gap-3">
                    <dt style={{ color: "var(--foreground-muted)" }}>שם העסק</dt>
                    <dd className="font-semibold truncate">
                      {application.businessName}
                    </dd>
                  </div>
                )}
                {application.category && (
                  <div className="flex justify-between gap-3">
                    <dt style={{ color: "var(--foreground-muted)" }}>קטגוריה</dt>
                    <dd className="font-semibold">
                      {categoryLabel(application.category)}
                    </dd>
                  </div>
                )}
                {submittedFmt && (
                  <div className="flex justify-between gap-3">
                    <dt style={{ color: "var(--foreground-muted)" }}>הוגש</dt>
                    <dd className="font-semibold ltr-num">{submittedFmt}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Timeline */}
          <ol className="mt-6 space-y-3">
            <TimelineStep
              done
              title="הבקשה נשלחה"
              body="קיבלנו את כל הפרטים שלך"
            />
            <TimelineStep
              active
              title="הצוות שלנו בודק"
              body="אנחנו מאמתים את העסק ואת דוגמת העבודה"
            />
            <TimelineStep
              title="מייל אישור והפעלה"
              body="ברגע שיש אישור, נשלח לך מייל והדשבורד יופעל אוטומטית"
            />
          </ol>

          {/* Refresh + support */}
          <div className="mt-7 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="action-btn"
              style={{ minHeight: 48 }}
            >
              <Loader2 size={14} aria-hidden />
              בדיקה מחדש
            </button>
            <a
              href="mailto:support@moomentum.events"
              className="action-btn primary"
              style={{ minHeight: 48 }}
            >
              <Inbox size={14} aria-hidden />
              צור קשר עם הצוות
            </a>
          </div>
        </div>
        <div
          className="mt-5 text-center text-xs"
          style={{ color: "var(--foreground-muted)" }}
        >
          מקבל הודעות מ-noreply@moomentum.events? הוסף לרשימת הלבנה כדי לא
          לפספס את אישור ההפעלה.
        </div>
      </div>
    </main>
  );
}

function ApplicationRejectedScreen({
  application,
}: {
  application: { businessName?: string; rejectionReason?: string };
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-6">
          <Logo size={28} />
        </div>
        <div
          className="card glass-strong p-7 rounded-3xl"
          style={{ border: "1px solid rgba(248,113,113,0.30)" }}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-2xl inline-flex items-center justify-center"
              style={{
                background: "rgba(248,113,113,0.10)",
                border: "1px solid rgba(248,113,113,0.30)",
                color: "rgb(252,165,165)",
              }}
            >
              <AlertCircle size={28} aria-hidden />
            </div>
            <h1 className="mt-5 text-2xl font-bold leading-tight">
              הבקשה נדחתה
            </h1>
            {application.businessName && (
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--foreground-muted)" }}
              >
                {application.businessName}
              </p>
            )}
          </div>

          {application.rejectionReason && (
            <div
              className="mt-5 rounded-2xl p-4 text-sm leading-relaxed"
              style={{
                background: "rgba(248,113,113,0.06)",
                border: "1px solid rgba(248,113,113,0.20)",
                color: "var(--foreground-soft)",
              }}
            >
              <div
                className="text-[10px] uppercase tracking-widest mb-1.5"
                style={{ color: "rgb(252,165,165)" }}
              >
                הסיבה
              </div>
              {application.rejectionReason}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-2">
            <a
              href="mailto:support@moomentum.events"
              className="action-btn"
              style={{ minHeight: 48 }}
            >
              צור קשר
            </a>
            <Link
              href="/vendors/join"
              className="action-btn primary"
              style={{ minHeight: 48 }}
            >
              הגש בקשה חדשה
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function TimelineStep({
  title,
  body,
  done,
  active,
}: {
  title: string;
  body: string;
  done?: boolean;
  active?: boolean;
}) {
  const dot = done ? (
    <CheckCircle2 size={16} className="text-emerald-400" aria-hidden />
  ) : active ? (
    <Loader2
      size={16}
      className="animate-spin text-[--accent]"
      aria-hidden
    />
  ) : (
    <Clock size={16} style={{ color: "var(--foreground-muted)" }} aria-hidden />
  );
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{dot}</div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-semibold leading-snug"
          style={{ color: active || done ? "var(--foreground)" : "var(--foreground-muted)" }}
        >
          {title}
        </div>
        <div
          className="text-xs mt-0.5 leading-relaxed"
          style={{ color: "var(--foreground-muted)" }}
        >
          {body}
        </div>
      </div>
    </li>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: "gold" | "emerald" | "amber" | "purple";
  highlight?: boolean;
}) {
  const colorMap = {
    gold: "gradient-gold",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    purple: "text-purple-400",
  };
  return (
    <div
      className="card p-4"
      style={
        highlight
          ? {
              borderColor: "var(--border-gold)",
              boxShadow: "0 4px 14px -6px rgba(212,176,104,0.35)",
            }
          : undefined
      }
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-[--accent] mb-2"
        style={{
          background:
            "linear-gradient(135deg, rgba(244,222,169,0.15), rgba(168,136,74,0.05))",
        }}
      >
        {icon}
      </div>
      <div className={`text-2xl font-extrabold ltr-num ${colorMap[color]}`}>{value}</div>
      <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  sub,
  highlight,
  externalTab,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  sub: string;
  highlight?: boolean;
  /** R123 — open in a new tab and don't run the Next.js client router.
   *  Used for cross-app destinations (pricing page) so the vendor's
   *  dashboard stays open underneath. */
  externalTab?: boolean;
}) {
  return (
    <Link
      href={href}
      target={externalTab ? "_blank" : undefined}
      rel={externalTab ? "noopener noreferrer" : undefined}
      className="card p-4 flex items-center gap-3 transition hover:translate-y-[-2px]"
      style={
        highlight
          ? {
              borderColor: "var(--border-gold)",
              background:
                "linear-gradient(135deg, rgba(244,222,169,0.08), rgba(168,136,74,0.03))",
            }
          : undefined
      }
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-[--accent] shrink-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(244,222,169,0.20), rgba(168,136,74,0.08))",
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-bold text-sm">{label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: "var(--foreground-muted)" }}>
          {sub}
        </div>
      </div>
    </Link>
  );
}
