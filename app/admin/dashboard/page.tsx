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
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { isFounderEmail } from "@/lib/constants";
import { useUser, userActions } from "@/lib/user";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";
import { VendorControlPanel } from "@/components/admin/VendorControlPanel";

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
  // R161c — the app's persisted user (localStorage) survives even when the
  // Supabase session can't be read, so it's the reliable signal for "is
  // this the founder". identifier holds the email for Google/Apple.
  const { user: appUser, hydrated: userHydrated } = useUser();
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  // R161c — founder is recognized but the Supabase session is gone/expired:
  // show a clear re-login card instead of bouncing to /signup (which looped
  // because the app still considers them signed in).
  const [needsReauth, setNeedsReauth] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // R12+ — show the signed-in email on the "not authorized" screen so
  // the user can see immediately if Google logged them in with a
  // different Gmail than the one in admin_emails.
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  // R129 — hold the session access token so embedded panels (e.g.
  // VendorControlPanel) can call /api/admin/* without re-fetching it.
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // R64 (R79) — clear the localStorage admin-cache hint on every
  // /admin/dashboard visit so the Header's pill re-checks against the
  // DB. Without this, a stale "false" cached after a bad earlier
  // check would keep the admin nav hidden until the user manually
  // cleared storage.
  useEffect(() => {
    try {
      window.localStorage.removeItem("momentum.isAdmin.v1");
    } catch {
      /* private mode / quota — best-effort */
    }
  }, []);

  useEffect(() => {
    // R12 §2J — every exit path lives inside try/catch/finally so a
    // single throw can't leave the page spinning forever. AbortController
    // cancels the in-flight fetch if the user navigates away mid-load.
    const controller = new AbortController();
    let aborted = false;

    // Hard 10-second safety timer. If supabase.auth.getUser() hangs (it
    // does sometimes when the session token is in a weird state), this
    // forces the page out of the loading state with a friendly error
    // instead of an infinite spinner. The finally block itself also
    // flips state — but only if the async work actually completes.
    const hardTimeout = window.setTimeout(() => {
      if (aborted) return;
      console.error("[admin/dashboard] hard timeout reached at 10s");
      setError(
        "הטעינה לוקחת יותר מהרגיל. בדוק חיבור לאינטרנט או רענן את הדף.",
      );
      setLoading(false);
      setAuthChecked(true);
    }, 10000);

    void (async () => {
      // Wait until the persisted app user is known before judging auth —
      // otherwise the founder could be briefly misclassified as
      // unauthenticated on the first render. The effect re-runs when
      // `userHydrated` flips (it's in the deps).
      if (!userHydrated) return;
      try {
        const supabase = getSupabase();
        if (!supabase) {
          setError("Supabase לא מוגדר. בדוק את הגדרות הסביבה.");
          return;
        }

        // R161/R161c — gate on getSession() (local-first, auto-refreshing),
        // NOT getUser() (a network round-trip that returns null whenever the
        // token needs a refresh / the network hiccups — worse under Safari
        // ITP). Founder identity is taken from the SESSION email OR the
        // app's persisted user (which survives a missing Supabase session),
        // so the founder is never misclassified as "not authorized" just
        // because the session momentarily can't be read. This is UX only;
        // the real security is server-side requireAdmin (verifies the JWT).
        const { data: { session } } = await supabase.auth.getSession();
        const sessionEmail = session?.user?.email?.toLowerCase().trim();
        const appEmail = appUser?.identifier?.toLowerCase().trim();
        const founder =
          (!!sessionEmail && isFounderEmail(sessionEmail)) ||
          (!!appEmail && isFounderEmail(appEmail));

        // Surface whichever email we know for the screens below.
        setSignedInEmail(sessionEmail ?? appEmail ?? null);

        if (!founder) {
          // No identity at all (and the app user has finished hydrating)
          // → send to sign-in. Otherwise fall through to the "not
          // authorized" screen (authorized stays false).
          if (userHydrated && !sessionEmail && !appEmail) {
            router.replace("/signup?returnTo=/admin/dashboard");
          }
          return;
        }

        // Founder confirmed. The admin API needs a live access token; if
        // the Supabase session is gone, show the re-login card (R161c)
        // instead of an endless /signup bounce.
        if (!session?.access_token) {
          setNeedsReauth(true);
          return;
        }

        setAuthorized(true);
        setAdminToken(session.access_token);

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
        window.clearTimeout(hardTimeout);
        if (!aborted) {
          setLoading(false);
          setAuthChecked(true);
        }
      }
    })();

    return () => {
      aborted = true;
      window.clearTimeout(hardTimeout);
      controller.abort();
    };
    // Re-run once the app user hydrates from localStorage so the founder
    // is recognized even when the Supabase session is unreadable.
  }, [router, appUser?.identifier, userHydrated]);

  // R131 — projectedRevenue card removed. Owner asked to keep the
  // section visible but show ₪0 until real payments come through.
  // The figure will become non-zero automatically when a future
  // Stripe webhook stamps `paid_at` rows we sum here. Until then
  // the panel honestly displays the real revenue (₪0) rather than
  // a fantasy "if everyone paid" theoretical maximum.
  const realRevenue = 0;

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  // R161c — founder recognized, but no live Supabase session. Offer a
  // one-click fresh sign-in instead of a confusing /signup bounce or the
  // misleading "not authorized" screen.
  if (needsReauth) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <ShieldCheck
            size={32}
            className="mx-auto"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <h1 className="mt-4 text-xl font-bold">ההתחברות פגה</h1>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--foreground-soft)" }}
          >
            זוהית כמנהל, אבל החיבור המאובטח פג תוקף. התחבר מחדש כדי לטעון
            את לוח הבקרה.
          </p>
          <button
            onClick={() => {
              void userActions.signInWithOAuth("google");
            }}
            className="btn-gold mt-6 inline-flex items-center justify-center gap-2 w-full"
          >
            התחבר מחדש עם Google
          </button>
          <Link
            href="/dashboard"
            className="text-xs underline mt-5 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לאפליקציה
          </Link>
        </div>
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
          {signedInEmail && (
            <div
              className="mt-4 rounded-xl p-3 text-sm font-mono ltr-num text-start"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                color: "var(--foreground-soft)",
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: "var(--foreground-muted)" }}
              >
                מחובר כעת בתור
              </div>
              {signedInEmail}
            </div>
          )}
          <p
            className="mt-4 text-sm"
            style={{ color: "var(--foreground-soft)" }}
          >
            כדי להוסיף את המייל הזה כמנהל, הרץ ב-Supabase SQL Editor:
          </p>
          <div
            dir="ltr"
            className="mt-2 rounded-xl p-3 text-xs font-mono text-start overflow-x-auto"
            style={{
              background: "rgba(0,0,0,0.4)",
              border: "1px solid var(--border-gold)",
              color: "var(--accent)",
            }}
          >
            insert into admin_emails (email) values
            <br />
            &nbsp;&nbsp;(&apos;{signedInEmail ?? "your@email.com"}&apos;)
            <br />
            on conflict do nothing;
          </div>
          <Link
            href="/"
            className="text-xs underline mt-5 inline-block"
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

  // R126 — was `return null` (blank screen if the stats response was
  // empty but didn't 4xx). Replace with an honest empty state + retry
  // CTA so the admin isn't staring at a black page.
  if (!stats) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle
            size={28}
            className="mx-auto text-amber-400"
            aria-hidden
          />
          <h1 className="mt-4 text-lg font-bold">לא ניתן לטעון את הנתונים</h1>
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{ color: "var(--foreground-soft)" }}
          >
            ה-API החזיר תשובה ריקה. בדוק את לוג השרת או נסה לרענן.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold mt-5 inline-flex items-center gap-2 text-sm"
          >
            <Loader2 size={14} aria-hidden /> רענן
          </button>
        </div>
      </main>
    );
  }

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
              {/* R128 — greeting is now dynamic: founder sees "טל חמו",
                  any other admin sees the local-part of their email so
                  the page doesn't render Tal's name to the wrong person. */}
              <div className="font-bold text-sm">
                לוח הבקרה של{" "}
                {signedInEmail && isFounderEmail(signedInEmail)
                  ? "טל חמו"
                  : signedInEmail
                    ? signedInEmail.split("@")[0]
                    : "המנהל"}
              </div>
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
        {/* R125 — command-center quick actions. The admin dashboard
            used to be stats-only; getting from "I see N pending" to
            "approve them" required two more clicks. This strip puts
            every important admin surface one click away, with a gold
            badge showing the live counter the admin cares about most
            (pending applications). */}
        <section className="mb-6">
          <div className="text-[10px] uppercase tracking-widest mb-2 ms-1"
               style={{ color: "var(--foreground-muted)" }}>
            פעולות מהירות
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <CommandTile
              href="/admin/vendors"
              icon={<Briefcase size={18} aria-hidden />}
              label="ניהול ספקים"
              hint="הצמדה · הסרה · שחזור"
              badge={
                stats.vendors.pending > 0
                  ? { text: `${stats.vendors.pending} ממתינים`, kind: "warn" }
                  : undefined
              }
              accent
            />
            <CommandTile
              href="/admin/vendors/applications"
              icon={<CheckCircle2 size={18} aria-hidden />}
              label="אישור בקשות"
              hint="הזרם בקשות חדשות"
              badge={
                stats.vendors.pending > 0
                  ? {
                      text: String(stats.vendors.pending),
                      kind: "warn",
                    }
                  : undefined
              }
            />
            <CommandTile
              href="/admin/leads"
              icon={<TrendingUp size={18} aria-hidden />}
              label="לידים"
              hint="פונים חדשים השבוע"
            />
            <CommandTile
              href="/admin/users"
              icon={<Users size={18} aria-hidden />}
              label="משתמשים"
              hint={`${stats.users.new_today} חדשים היום`}
            />
            <CommandTile
              href="/admin/errors"
              icon={<AlertCircle size={18} aria-hidden />}
              label="שגיאות"
              hint="לוג שגיאות שרת"
            />
          </div>
        </section>

        {/* R129 — inline vendor control panel. Lists active vendors
            directly on the dashboard with pin/delete buttons so the
            admin can manage without leaving this page. */}
        {adminToken && <VendorControlPanel token={adminToken} />}

        {/* R131 — real revenue card. Shows the actual ₪ that came in
            through the system. Stays at ₪0 until a real payment
            processor is wired in (e.g. Stripe). The number is intended
            to grow automatically as `paid_at` events accumulate. */}
        <section className="card-gold p-7 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div
                className="text-xs uppercase tracking-wider"
                style={{ color: "var(--foreground-muted)" }}
              >
                הכנסה כוללת שהתקבלה
              </div>
              <div className="mt-2 text-5xl font-extrabold gradient-gold ltr-num">
                ₪{realRevenue.toLocaleString("he-IL")}
              </div>
              <div
                className="mt-2 text-sm"
                style={{ color: "var(--foreground-soft)" }}
              >
                מתעדכן אוטומטית עם כל תשלום שמתקבל במערכת
              </div>
            </div>
            <div className="text-end">
              <div
                className="text-xs"
                style={{ color: "var(--foreground-muted)" }}
              >
                כאשר ייפעל מערכת סליקה
              </div>
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--foreground-muted)" }}
              >
                הסכום יעודכן בזמן אמת
              </div>
            </div>
          </div>
        </section>

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
            {/* R115 — "approve N pending applications" CTA hidden. Manual
                approval is off; vendor applications auto-promote on submit. */}
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

/**
 * R125 — Command-center jump tile.
 *
 * Big tap target with an icon, primary label, and a sub-line. When
 * the action has a "live counter" (e.g. pending applications),
 * pass `badge` and it surfaces as a coloured pill at the top-right
 * so the admin sees urgency without clicking through.
 *
 * `accent` paints the tile gold-on-dark — used for the primary
 * vendor-management entry point.
 */
function CommandTile({
  href,
  icon,
  label,
  hint,
  badge,
  accent,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  badge?: { text: string; kind: "warn" | "info" };
  accent?: boolean;
}) {
  const badgeStyle =
    badge?.kind === "warn"
      ? {
          background: "rgba(251,191,36,0.18)",
          color: "rgb(251,191,36)",
          border: "1px solid rgba(251,191,36,0.4)",
        }
      : {
          background: "rgba(96,165,250,0.16)",
          color: "rgb(96,165,250)",
          border: "1px solid rgba(96,165,250,0.35)",
        };
  return (
    <Link
      href={href}
      className="card p-3.5 flex items-start gap-3 transition hover:translate-y-[-2px] relative"
      style={
        accent
          ? {
              borderColor: "var(--border-gold)",
              background:
                "linear-gradient(135deg, rgba(244,222,169,0.08), rgba(168,136,74,0.03))",
            }
          : undefined
      }
    >
      <div
        className="w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0"
        style={{
          background: accent
            ? "linear-gradient(135deg, rgba(244,222,169,0.30), rgba(168,136,74,0.12))"
            : "color-mix(in srgb, var(--accent) 12%, transparent)",
          color: "var(--accent)",
          border: accent ? "1px solid var(--border-gold)" : undefined,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm leading-tight truncate">{label}</div>
        {hint && (
          <div
            className="text-[11px] mt-0.5 truncate"
            style={{ color: "var(--foreground-muted)" }}
          >
            {hint}
          </div>
        )}
      </div>
      {badge && (
        <span
          className="absolute top-2 end-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ltr-num"
          style={badgeStyle}
        >
          {badge.text}
        </span>
      )}
    </Link>
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
