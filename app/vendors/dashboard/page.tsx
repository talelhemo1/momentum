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
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  CreditCard,
  TrendingUp,
  User,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";
import { VendorNav } from "@/components/vendors/VendorNav";
import { useVendorContext } from "@/lib/useVendorContext";
import type {
  VendorLandingData,
  VendorLead,
  VendorReview,
} from "@/lib/types";

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
  const { isVendor, vendorLanding, hasPaidTier, isLoading: ctxLoading } =
    useVendorContext();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Differentiate "not signed in" from "signed in but no vendor profile"
  // — the two need different CTAs and the hook doesn't tell us which.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <Sparkles size={32} className="mx-auto text-[--accent]" aria-hidden />
          {isAuthenticated === false ? (
            <>
              <h1 className="mt-4 text-xl font-bold">כניסה לדשבורד הספק</h1>
              <p
                className="mt-3 text-sm"
                style={{ color: "var(--foreground-soft)" }}
              >
                התחבר עם החשבון שלך כדי לראות לידים, ביקורות, ואנליטיקס.
                אם עוד אין לך פרופיל — תוכל להקים אותו אחרי ההתחברות.
              </p>
              <Link
                href="/signup?returnTo=/vendors/dashboard"
                className="btn-gold mt-5 inline-flex items-center gap-2"
              >
                <ArrowUpRight size={14} aria-hidden /> התחבר / הירשם
              </Link>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-xl font-bold">עוד לא יצרת פרופיל ספק</h1>
              <p
                className="mt-3 text-sm"
                style={{ color: "var(--foreground-soft)" }}
              >
                כדי לראות לידים, ביקורות, ואנליטיקס — ראשית עלייך להקים דף
                נחיתה ב-Vendor Studio.
              </p>
              <Link
                href="/dashboard/vendor-studio"
                className="btn-gold mt-5 inline-flex items-center gap-2"
              >
                <ArrowUpRight size={14} aria-hidden /> צור פרופיל
              </Link>
            </>
          )}
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

  if (!vendorLanding || !metrics) return null;

  const completeness = computeCompleteness(vendorLanding);

  return (
    <main
      className="min-h-screen pb-24 md:pb-20 md:pe-64"
      style={{ background: "var(--surface-0)" }}
    >
      <VendorNav publicSlug={vendorLanding.slug} />

      <header
        className="sticky top-0 z-30 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                Vendor Dashboard
              </div>
              <div className="font-bold text-sm">{vendorLanding.name}</div>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="text-xs inline-flex items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{ color: "var(--foreground-soft)" }}
          >
            <ArrowLeft size={12} aria-hidden /> אזור הלקוחות
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 pt-6 space-y-6">
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

        {/* Quick actions — 4 big buttons */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            href="/dashboard/vendor-studio"
            icon={<ImageIcon size={22} aria-hidden />}
            label="ערוך פרופיל"
            sub="עיצוב, תמונות, תיאור"
          />
          <QuickAction
            href="/vendors/dashboard/leads"
            icon={<Inbox size={22} aria-hidden />}
            label="נהל לידים"
            sub={`${metrics.activeLeads} ממתינים`}
            highlight={metrics.activeLeads > 0}
          />
          {/* R14 bugfix — /vendors/dashboard/reviews and /…/billing don't
              exist yet. Route the cards at real destinations: the public
              landing-page reviews section (where the vendor can see their
              own ratings) and the global /pricing page. */}
          <QuickAction
            href={`/vendor/${vendorLanding.slug}#reviews`}
            icon={<Star size={22} aria-hidden />}
            label="ביקורות"
            sub="צפה בדף הציבורי"
          />
          <QuickAction
            href="/pricing"
            icon={<CreditCard size={22} aria-hidden />}
            label={hasPaidTier ? "מסלול פרימיום" : "שדרג מסלול"}
            sub={hasPaidTier ? "פעיל" : "פתוח פיצ׳רים מתקדמים"}
            highlight={!hasPaidTier}
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
}: {
  href: string;
  icon: ReactNode;
  label: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
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
