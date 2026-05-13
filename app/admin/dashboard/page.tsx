"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Users,
  Calendar,
  Briefcase,
  Star,
  ScanLine,
  Receipt,
  MessageCircle,
  TrendingUp,
  ShieldCheck,
  Clock,
  ArrowUpRight,
  ArrowLeft,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";

/**
 * Admin dashboard.
 *
 * Auth-gated to whoever's email is in `admin_emails` (Supabase table from
 * the vendor-applications migration). The route handler at
 * /api/admin/stats does the real aggregate work via service role; this
 * page is a pure presentation layer.
 */

interface AdminStats {
  users: {
    total: number;
    new_today: number;
    new_this_week: number;
    new_this_month: number;
    active_last_24h: number;
  };
  events: { total: number; active: number; new_this_week: number };
  vendors: {
    total_applications: number;
    pending: number;
    approved: number;
    rejected: number;
    paid_tier: number;
    landings_published: number;
  };
  reviews: { total: number; avg_rating: number; new_this_week: number };
  managers: {
    total_invited: number;
    total_accepted: number;
    arrivals_logged: number;
  };
  receipts: { total: number; total_amount_agorot: number };
  assistant: {
    total_messages: number;
    messages_today: number;
    total_cost_cents: number;
  };
  recent_activity: Array<{ id: string; type: string; label: string; timestamp: string }>;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // R12 §2J — every exit path lives inside try/catch/finally so a
    // single throw can't leave the page spinning forever. AbortController
    // cancels the in-flight fetch if the user navigates away mid-load.
    const controller = new AbortController();
    let aborted = false;

    void (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          router.replace("/signup?returnTo=/admin/dashboard");
          return;
        }

        const { data: adminRow } = (await supabase
          .from("admin_emails")
          .select("email")
          .eq("email", user.email)
          .maybeSingle()) as { data: { email: string } | null };

        if (!adminRow) return;

        setAuthorized(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        const data = (await res.json()) as AdminStats | { error: string };
        if (!res.ok) {
          const errMsg = "error" in data ? data.error : "שגיאה בטעינת נתונים";
          setError(errMsg);
          return;
        }
        setStats(data as AdminStats);
      } catch (e) {
        // Aborted fetches show up here as DOMException; they're not real
        // errors so we suppress them.
        if (e instanceof DOMException && e.name === "AbortError") {
          aborted = true;
          return;
        }
        console.error("[admin/dashboard]", e);
        setError(e instanceof Error ? e.message : "שגיאה בטעינת הדשבורד");
      } finally {
        // Always flip loading off — even on early returns — so the spinner
        // can never hang. authChecked also always flips so the "אין הרשאה"
        // empty state can render when applicable.
        if (!aborted) {
          setLoading(false);
          setAuthChecked(true);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [router]);

  // Projected revenue (theoretical ceiling — every couple + vendor paid).
  const projectedRevenue = stats
    ? {
        couples_potential: stats.events.total * 399,
        vendors_potential: stats.vendors.approved * 199,
        total_potential: stats.events.total * 399 + stats.vendors.approved * 199,
      }
    : null;

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <ShieldCheck
            size={32}
            className="mx-auto"
            style={{ color: "var(--foreground-muted)" }}
            aria-hidden
          />
          <h1 className="mt-4 text-xl font-bold">הדף הזה למנהלי המערכת בלבד</h1>
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--foreground-soft)" }}
          >
            אם אתה אמור להיות מנהל, וודא שהמייל שלך נמצא בטבלת{" "}
            <code>admin_emails</code> ב-Supabase.
          </p>
          <Link
            href="/"
            className="text-xs underline mt-4 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
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

  if (!stats) return null;

  return (
    <main className="min-h-screen pb-20" style={{ background: "var(--surface-0)" }}>
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                Admin Dashboard
              </div>
              <div className="font-bold text-sm">לוח הבקרה של תל</div>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="text-sm inline-flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ color: "var(--foreground-soft)" }}
          >
            <ArrowLeft size={14} aria-hidden /> חזרה לאפליקציה
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 pt-6">
        {projectedRevenue && (
          <section className="card-gold p-7 mb-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div
                  className="text-xs uppercase tracking-wider"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  הכנסה פוטנציאלית מקסימלית (אם כל המשתמשים שדרגו)
                </div>
                <div className="mt-2 text-5xl font-extrabold gradient-gold ltr-num">
                  ₪{projectedRevenue.total_potential.toLocaleString("he-IL")}
                </div>
                <div
                  className="mt-2 text-sm"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  זוגות: ₪{projectedRevenue.couples_potential.toLocaleString("he-IL")} · ספקים: ₪{projectedRevenue.vendors_potential.toLocaleString("he-IL")}
                </div>
              </div>
              <div className="text-end">
                <div
                  className="text-xs"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  * תאורטי, לא בפועל
                </div>
                <div
                  className="mt-1 text-xs"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  צריך Stripe לתשלומים אמיתיים
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={<Users size={20} aria-hidden />}
            label="משתמשים"
            value={stats.users.total}
            sub={`+${stats.users.new_this_week} השבוע`}
            color="emerald"
          />
          <MetricCard
            icon={<Calendar size={20} aria-hidden />}
            label="אירועים"
            value={stats.events.total}
            sub={`${stats.events.active} פעילים`}
            color="gold"
          />
          <MetricCard
            icon={<Briefcase size={20} aria-hidden />}
            label="ספקים"
            value={stats.vendors.total_applications}
            sub={`${stats.vendors.pending} ממתינים, ${stats.vendors.approved} מאושרים`}
            color="amber"
          />
          <MetricCard
            icon={<Star size={20} aria-hidden />}
            label="דירוגים"
            value={stats.reviews.total}
            sub={`ממוצע: ${stats.reviews.avg_rating || "—"}⭐`}
            color="purple"
          />
        </section>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <section className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Briefcase size={20} className="text-[--accent]" aria-hidden />
              ספקים — פירוט
            </h2>
            <div className="space-y-3">
              <Row
                label="ממתינים לאישור"
                value={stats.vendors.pending}
                highlight={stats.vendors.pending > 0 ? "amber" : undefined}
              />
              <Row label="מאושרים" value={stats.vendors.approved} />
              <Row label="נדחו" value={stats.vendors.rejected} />
              <Row
                label="דפי נחיתה פעילים"
                value={stats.vendors.landings_published}
              />
              <Row
                label="במסלול בתשלום"
                value={stats.vendors.paid_tier || "—"}
              />
            </div>
            {stats.vendors.pending > 0 && (
              <Link
                href="/admin/vendors"
                className="btn-gold mt-5 text-sm inline-flex items-center gap-2 px-4 py-2 w-full justify-center"
              >
                <ArrowUpRight size={14} aria-hidden /> אשר{" "}
                <span className="ltr-num">{stats.vendors.pending}</span> בקשות ממתינות
              </Link>
            )}
          </section>

          <section className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <ScanLine size={20} className="text-[--accent]" aria-hidden />
              Momentum Live
            </h2>
            <div className="space-y-3">
              <Row
                label="מנהלי אירוע הוזמנו"
                value={stats.managers.total_invited}
              />
              <Row
                label="אישרו את ההזמנה"
                value={stats.managers.total_accepted}
              />
              <Row
                label="צ׳ק-אינים נרשמו"
                value={stats.managers.arrivals_logged}
              />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Receipt size={20} className="text-[--accent]" aria-hidden />
              חשבוניות (Wedding CFO)
            </h2>
            <div className="space-y-3">
              <Row label="חשבוניות הועלו" value={stats.receipts.total} />
              <Row
                label="סך הסכומים"
                value={`₪${(stats.receipts.total_amount_agorot / 100).toLocaleString("he-IL")}`}
                highlight="gold"
              />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <MessageCircle size={20} className="text-[--accent]" aria-hidden />
              צ&apos;אטבוט AI
            </h2>
            <div className="space-y-3">
              <Row
                label="סך כל ההודעות"
                value={stats.assistant.total_messages}
              />
              <Row label="היום" value={stats.assistant.messages_today} />
              <Row
                label="עלות מצטברת (OpenAI)"
                value={`$${(stats.assistant.total_cost_cents / 100).toFixed(2)}`}
                highlight={
                  stats.assistant.total_cost_cents > 5000 ? "amber" : undefined
                }
              />
            </div>
          </section>
        </div>

        <section className="card p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Clock size={20} className="text-[--accent]" aria-hidden />
            פעילות אחרונה
          </h2>
          {stats.recent_activity.length === 0 ? (
            /* R12 §4X — unified empty state. The text-only "עדיין אין פעילות"
               felt like the page was broken. The card gives weight + context. */
            <EmptyState
              icon={<Clock size={28} aria-hidden />}
              title="עדיין אין פעילות"
              description="פעילות תופיע כאן ברגע שמשתמש ירשם או ספק יתקבל."
            />
          ) : (
            <div className="space-y-2">
              {stats.recent_activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: "var(--input-bg)" }}
                >
                  <div className="text-sm">{a.label}</div>
                  <div
                    className="text-xs ltr-num"
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
  sub,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  sub: string;
  color: "emerald" | "gold" | "amber" | "purple";
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    gold: "gradient-gold",
    amber: "text-amber-400",
    purple: "text-purple-400",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[--accent]"
          style={{
            background:
              "linear-gradient(135deg, rgba(244,222,169,0.15), rgba(168,136,74,0.05))",
          }}
        >
          {icon}
        </div>
        <TrendingUp
          size={14}
          className="text-emerald-400 opacity-60"
          aria-hidden
        />
      </div>
      <div className={`text-2xl font-extrabold ltr-num ${colorMap[color]}`}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
      <div
        className="text-[10px] mt-2 ltr-num"
        style={{ color: "var(--foreground-muted)" }}
      >
        {sub}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: "amber" | "gold";
}) {
  const colorMap = { amber: "text-amber-400", gold: "gradient-gold" };
  return (
    <div
      className="flex items-center justify-between py-2 border-b last:border-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-sm" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </span>
      <span
        className={`font-bold text-lg ltr-num ${highlight ? colorMap[highlight] : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
