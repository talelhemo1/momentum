"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { PrintButton } from "@/components/PrintButton";
import { BudgetCalculator } from "@/components/BudgetCalculator";
import { BudgetSkeleton } from "@/components/skeletons/PageSkeletons";
import { EmptyState } from "@/components/EmptyState";
import { CfoSection } from "@/components/cfo/CfoSection";
import { TransparencySection } from "@/components/cfo/TransparencySection";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import {
  BUDGET_CATEGORY_LABELS,
  type BudgetCategory,
  type BudgetItem,
} from "@/lib/types";
import {
  calcEnvelopeFromState,
  RELATIONSHIP_NORMS,
  calcRelationshipBreakdown,
  type RelationshipType,
} from "@/lib/envelope";
import {
  Wallet,
  Plus,
  Trash2,
  ArrowRight,
  AlertCircle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Scale,
  Mail,
  Heart,
} from "lucide-react";

const CATEGORIES = Object.keys(BUDGET_CATEGORY_LABELS) as BudgetCategory[];

type BudgetTab = "budget" | "cfo" | "transparency";

// R12 §2M — `vendor_cost_reports` has no submission UI yet, so the
// transparency tab would always show the "not enough data" empty state.
// Hide it until the Phase 8 post-event reporting form lands. Toggle this
// flag back to true when wiring the form.
const TRANSPARENCY_TAB_ENABLED = false;

const BUDGET_TABS: ReadonlyArray<{ id: BudgetTab; label: string; emoji: string }> = [
  { id: "budget", label: "תקציב", emoji: "💰" },
  { id: "cfo", label: "AI CFO", emoji: "🤖" },
  ...(TRANSPARENCY_TAB_ENABLED
    ? ([{ id: "transparency" as const, label: "השוואת מחירים", emoji: "📊" }])
    : []),
];

export default function BudgetPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<BudgetTab>("budget");

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    // R14: no-event handled by EmptyState below.
  }, [userHydrated, user, router]);

  const summary = useMemo(() => {
    const totalEstimated = state.budget.reduce((s, b) => s + b.estimated, 0);
    const totalActual = state.budget.reduce((s, b) => s + (b.actual ?? 0), 0);
    const totalPaid = state.budget.reduce((s, b) => s + (b.paid ?? 0), 0);
    const limit = state.event?.budgetTotal ?? 0;
    // Projected = best-known cost per item (actual if known, else estimated).
    const projected = state.budget.reduce((s, b) => s + (b.actual ?? b.estimated ?? 0), 0);
    const remaining = limit - projected;
    return { totalEstimated, totalActual, totalPaid, projected, remaining, limit };
  }, [state.budget, state.event]);

  const envelope = useMemo(() => {
    if (!state.event) return null;
    // Reads live from state — uses confirmed RSVPs if any, else estimate.
    return calcEnvelopeFromState(state);
  }, [state]);

  const grouped = useMemo(() => {
    const map = new Map<BudgetCategory, BudgetItem[]>();
    for (const item of state.budget) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return Array.from(map.entries());
  }, [state.budget]);

  if (!hydrated) {
    return (
      <>
        <Header />
        <BudgetSkeleton />
      </>
    );
  }
  if (!state.event) return <EmptyEventState toolName="ניהול התקציב" />;

  const overBudget = summary.projected > summary.limit;
  const usedPct = summary.limit > 0 ? Math.min(100, (summary.projected / summary.limit) * 100) : 0;

  return (
    <>
      <Header />
      <main className="flex-1 pb-28 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-0 opacity-30" />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm text-white/50 hover:text-white inline-flex items-center gap-1.5">
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">תקציב</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
                תקציב חכם
              </h1>
              <p className="mt-2 text-white/55">עקוב אחרי כל הוצאה. בלי הפתעות.</p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "budget" && (
                <>
                  <PrintButton label="ייצא תקציב ל-PDF" />
                  <button onClick={() => setShowAdd(true)} className="btn-gold inline-flex items-center gap-2">
                    <Plus size={18} />
                    הוצאה חדשה
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tab nav — sits below the title, above the per-tab content.
              "תקציב" renders the entire existing budget page (no changes to
              its internals); the other two render the new sections. */}
          <div
            className="mt-6 inline-flex gap-1 p-1.5 rounded-2xl"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
            }}
            role="tablist"
          >
            {BUDGET_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    isActive ? "" : "hover:bg-white/5"
                  }`}
                  style={
                    isActive
                      ? {
                          background:
                            "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                          color: "#1A1310",
                        }
                      : { color: "var(--foreground-soft)" }
                  }
                >
                  <span className="me-1" aria-hidden>
                    {tab.emoji}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "cfo" && (
            <div className="mt-8">
              <CfoSection eventId={state.event.id} />
            </div>
          )}

          {activeTab === "transparency" && (
            <div className="mt-8">
              <TransparencySection />
            </div>
          )}

          {activeTab === "budget" && (
          <>
          <div className="card-gold p-8 mt-8 relative overflow-hidden">
            <div aria-hidden className="absolute -top-20 -end-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.18),transparent_70%)] blur-2xl" />
            <div className="relative grid md:grid-cols-3 gap-6 items-end">
              <div className="md:col-span-2">
                <div className="text-sm text-white/55 uppercase tracking-wider">תקציב צפוי</div>
                <div className="mt-2 text-5xl md:text-7xl font-extrabold tracking-tight gradient-gold ltr-num">
                  ₪{summary.projected.toLocaleString("he-IL")}
                </div>
                <div className="text-sm text-white/55 mt-2">
                  מתוך תקציב של <span className="ltr-num">₪{summary.limit.toLocaleString("he-IL")}</span>
                </div>
                <div className="mt-5 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-1000 ${
                      overBudget
                        ? "bg-gradient-to-r from-red-500 to-red-400"
                        : "bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9]"
                    }`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="שולם" value={`₪${summary.totalPaid.toLocaleString("he-IL")}`} />
                <MiniStat
                  label={overBudget ? "חריגה" : "נשאר"}
                  value={`₪${Math.abs(summary.remaining).toLocaleString("he-IL")}`}
                  color={overBudget ? "text-red-400" : "text-emerald-400"}
                />
              </div>
            </div>
            {overBudget && (
              <div className="relative mt-5 flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-300">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  חרגת מהתקציב ב-<span className="ltr-num">₪{Math.abs(summary.remaining).toLocaleString("he-IL")}</span>.
                  שקול להעלות את התקציב או לקצץ באחת הקטגוריות.
                </div>
              </div>
            )}
          </div>

          {envelope && envelope.verdict !== "no-data" && state.event && (
            <EnvelopeCard
              envelope={envelope}
              guests={envelope.guestCount}
              totalCost={envelope.totalCost}
            />
          )}

          {/* R18 — relationship-based "what if" calculator. Renders whenever
              there's an active event, even if the envelope card above had no
              data yet (the user can plan envelope intake before logging any
              budget items). totalCost falls back to 0 cleanly. */}
          {state.event && (
            <RelationshipCalculator totalCost={envelope?.totalCost ?? 0} />
          )}

          <BudgetCalculator
            guestEstimate={state.event.guestEstimate || 100}
            currentBudget={summary.projected}
            budgetLimit={summary.limit}
          />

          {grouped.length === 0 ? (
            <EmptyState
              icon={<Wallet size={28} aria-hidden />}
              title="עדיין לא הוספת הוצאות"
              description="התחל מסעיף ראשון: אולם, צילום, פרחים. לכל הוצאה אתה מוסיף ספק או סכום ידני, והעמוד הראשי יחשב את התקציב הכולל אוטומטית."
              secondary={{ label: "הוצאה חדשה", onClick: () => setShowAdd(true) }}
            />
          ) : (
            <div className="mt-8 space-y-4">
              {grouped.map(([cat, items]) => {
                const catTotal = items.reduce((s, i) => s + (i.actual ?? i.estimated), 0);
                return (
                  <div key={cat} className="card p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{BUDGET_CATEGORY_LABELS[cat]}</h3>
                      <div className="text-sm font-bold">₪{catTotal.toLocaleString("he-IL")}</div>
                    </div>
                    <div className="mt-3 divide-y divide-white/5">
                      {items.map((item) => (
                        <BudgetRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>

        {showAdd && <AddBudgetModal onClose={() => setShowAdd(false)} />}
      </main>
    </>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="text-xs text-white/55">{label}</div>
      <div className={`mt-1 text-lg font-bold ltr-num ${color ?? ""}`}>{value}</div>
    </div>
  );
}

function EnvelopeCard({
  envelope,
  guests,
  totalCost,
}: {
  envelope: ReturnType<typeof import("@/lib/envelope").calcEnvelopeFromState>;
  guests: number;
  totalCost: number;
}) {
  const { breakEven, withReserve, typical, expectedTotalAtTypical, netAtTypical, verdict, verdictLabel, suggestedPerGuest, countSource, costSource } = envelope;

  const verdictColor =
    verdict === "profit"
      ? "text-emerald-300"
      : verdict === "balanced"
        ? "text-[--accent]"
        : "text-red-300";

  const verdictIcon =
    verdict === "profit" ? <TrendingUp size={20} /> : verdict === "balanced" ? <Scale size={20} /> : <TrendingDown size={20} />;

  return (
    <section className="card p-7 md:p-8 mt-8 relative overflow-hidden">
      <div aria-hidden className="absolute -top-16 -end-16 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.18),transparent_70%)] blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="pill pill-gold">
            <Sparkles size={11} />
            חישוב חי
          </span>
          <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
            מתעדכן אוטומטית בכל שינוי בתקציב או באישורי הגעה
          </span>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/20 to-[#A8884A]/10 border border-[var(--border-gold)] flex items-center justify-center text-[--accent] shrink-0">
            <Mail size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              <span className="gradient-text">כמה כסף יחזירו לכם האורחים?</span>
            </h2>
            <p className="mt-2 text-white/60 leading-relaxed">
              בישראל מקובל שהאורחים מביאים מעטפה כתמיכה לזוג. בנינו לכם מחשבון
              חכם שמראה כמה ממוצע צריך להגיע מכל זוג — כדי שתדעו אם תכסו את
              עלות האירוע, תרוויחו קצת, או תוסיפו מהכיס.
            </p>
          </div>
        </div>

        {/* Headline number */}
        <div className="mt-6 grid sm:grid-cols-[1fr_auto] gap-5 items-end">
          <div>
            <div className="text-xs text-white/55 uppercase tracking-wider">סכום ממוצע מומלץ לזוג</div>
            <div className="mt-2 text-5xl md:text-6xl font-extrabold tracking-tight gradient-gold ltr-num">
              ₪{suggestedPerGuest.toLocaleString("he-IL")}
            </div>
            <div className="text-sm text-white/55 mt-2">
              לזוג · עבור <span className="ltr-num">{guests}</span> אורחים = <span className="ltr-num">₪{(suggestedPerGuest * guests).toLocaleString("he-IL")}</span>
            </div>
          </div>
          <div className={`rounded-2xl px-4 py-3 inline-flex items-center gap-2 border ${
            verdict === "profit"
              ? "border-emerald-400/30 bg-emerald-400/10"
              : verdict === "balanced"
                ? "border-[var(--border-gold)] bg-[rgba(212,176,104,0.08)]"
                : "border-red-400/30 bg-red-400/10"
          } ${verdictColor}`}>
            {verdictIcon}
            <div>
              <div className="text-xs opacity-75">תחזית</div>
              <div className="font-bold text-sm">{verdictLabel}</div>
            </div>
          </div>
        </div>

        {/* Three scenarios */}
        <div className="mt-7 grid sm:grid-cols-3 gap-3">
          <ScenarioCard
            tone="loss"
            icon={<TrendingDown size={16} />}
            title="ממוצע ארצי"
            perGuest={typical}
            total={typical * guests}
            net={typical * guests - totalCost}
            note="מה שאורחים בישראל בדרך כלל מביאים. אם זה מה שתקבלו, תצטרכו להוסיף מהכיס."
          />
          <ScenarioCard
            tone="balanced"
            icon={<Scale size={16} />}
            title="כיסוי מלא"
            perGuest={breakEven}
            total={breakEven * guests}
            net={0}
            note="הסכום שצריך להגיע מכל זוג בממוצע כדי שהאירוע ישלם על עצמו במלואו."
          />
          <ScenarioCard
            tone="profit"
            icon={<TrendingUp size={16} />}
            title="כיסוי + ירח דבש"
            perGuest={withReserve}
            total={withReserve * guests}
            net={withReserve * guests - totalCost}
            note="כיסוי מלא של עלות האירוע, פלוס 15% רזרבה לירח דבש או הפתעות."
          />
        </div>

        {/* Data source pills — show user exactly which numbers we used */}
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span className={`pill ${costSource === "actual" ? "pill-success" : "pill-muted"}`}>
            {costSource === "actual" ? "✓ עלות מבוססת על הוצאות שכבר רשמתם" : "○ עלות מבוססת על תקציב משוער (לא הוצאות בפועל)"}
          </span>
          <span className={`pill ${countSource === "confirmed" ? "pill-success" : "pill-muted"}`}>
            {countSource === "confirmed" ? `✓ ${guests} אורחים אישרו הגעה` : `○ ${guests} מוזמנים בצפי (אין אישורים עדיין)`}
          </span>
        </div>

        {/* Comparison footer */}
        <div className="mt-5 pt-5 border-t flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground-soft)" }}>
          <div>
            עלות כוללת: <span className="font-semibold ltr-num" style={{ color: "var(--foreground)" }}>₪{totalCost.toLocaleString("he-IL")}</span>
          </div>
          <div>
            צפי הכנסה לפי ממוצע: <span className={`font-semibold ltr-num ${verdictColor}`}>₪{expectedTotalAtTypical.toLocaleString("he-IL")}</span>
          </div>
          <div>
            תוצאה צפויה:{" "}
            <span className={`font-semibold ltr-num ${netAtTypical >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {netAtTypical >= 0 ? "+" : "−"}₪{Math.abs(netAtTypical).toLocaleString("he-IL")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScenarioCard({
  tone,
  icon,
  title,
  perGuest,
  total,
  net,
  note,
}: {
  tone: "loss" | "balanced" | "profit";
  icon: React.ReactNode;
  title: string;
  perGuest: number;
  total: number;
  net: number;
  note: string;
}) {
  const colors = {
    loss: "border-red-400/20 bg-red-400/[0.04] text-red-300",
    balanced: "border-[var(--border-gold)] bg-[rgba(212,176,104,0.06)] text-[--accent]",
    profit: "border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${colors}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        {icon}
        {title}
      </div>
      <div className="mt-3 text-3xl font-bold ltr-num text-white">
        ₪{perGuest.toLocaleString("he-IL")}
      </div>
      <div className="text-xs text-white/55 mt-1">לאורח</div>
      <div className="mt-3 pt-3 border-t border-white/[0.06] text-xs text-white/65">
        סה״כ: <span className="font-semibold text-white ltr-num">₪{total.toLocaleString("he-IL")}</span>
        {net !== 0 && (
          <>
            {" · "}
            <span className={`font-semibold ltr-num ${net > 0 ? "text-emerald-300" : "text-red-300"}`}>
              {net > 0 ? "+" : "−"}₪{Math.abs(net).toLocaleString("he-IL")}
            </span>
          </>
        )}
      </div>
      <div className="mt-2 text-[11px] text-white/45 leading-relaxed">{note}</div>
    </div>
  );
}

// ─── Relationship-based envelope calculator (R18) ────────────────────────────
// Lets the user enter the number of couples in each relationship bucket
// (immediate family, friends, colleagues, ...) and shows a realistic envelope
// total based on Israeli norms. State is local — this is a "what-if" tool, not
// a persisted plan, so we don't push it into the AppState store.
function RelationshipCalculator({ totalCost }: { totalCost: number }) {
  const [counts, setCounts] = useState<Partial<Record<RelationshipType, number>>>({});
  const result = useMemo(() => calcRelationshipBreakdown({ counts }), [counts]);

  const updateCount = (type: RelationshipType, value: string) => {
    // Empty input → clear. Reject negative / NaN; allow up to 500 couples per
    // bucket (covers any realistic wedding head count).
    //
    // R19 P2#8: trim() before the empty-check. Without it, a paste of " "
    // (single space) coerces to Number(" ") === 0 and persists as a real
    // 0 entry, which then shows up in totals like "0 couples × ₪600 = ₪0"
    // instead of being treated as cleared.
    if (value.trim() === "") {
      setCounts((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
      return;
    }
    const n = Number(value);
    if (Number.isNaN(n) || n < 0 || n > 500) return;
    setCounts((prev) => ({ ...prev, [type]: n }));
  };

  const balance = result.totalExpected - totalCost;
  const balanceColor =
    balance > 0
      ? "text-emerald-300"
      : balance === 0
        ? "text-[--accent]"
        : "text-red-300";

  return (
    <section className="card p-7 md:p-8 mt-6 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-16 -end-16 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(244,222,169,0.15),transparent_70%)] blur-2xl"
      />

      <div className="relative">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/20 to-[#A8884A]/10 border border-[var(--border-gold)] flex items-center justify-center text-[--accent] shrink-0">
            <Heart size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              <span className="gradient-text">חישוב מדויק לפי סוג מערכת יחסים</span>
            </h2>
            <p className="mt-2 text-white/60 leading-relaxed text-sm">
              משפחה קרובה תביא יותר מחבר מהעבודה — וזה בסדר. הזינו כמה זוגות
              מכל סוג, ונחשב לכם הערכה ריאלית של ההכנסה הצפויה במעטפות, על
              בסיס נורמות מקובלות בישראל.
            </p>
          </div>
        </div>

        {/* Per-bucket inputs */}
        <div className="grid gap-3">
          {RELATIONSHIP_NORMS.map((norm) => (
            <div
              key={norm.id}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center p-3 rounded-2xl"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
            >
              <span className="text-2xl" aria-hidden>
                {norm.emoji}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-sm">{norm.label}</div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  ₪{norm.rangeMin.toLocaleString("he-IL")} – ₪
                  {norm.rangeMax.toLocaleString("he-IL")} לזוג (ממוצע ₪
                  {norm.typical.toLocaleString("he-IL")})
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={500}
                value={counts[norm.id] ?? ""}
                onChange={(e) => updateCount(norm.id, e.target.value)}
                placeholder="0"
                aria-label={`מספר זוגות ${norm.label}`}
                className="w-20 text-center rounded-xl py-2 ltr-num"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
              />
              <div
                className="text-sm font-semibold ltr-num min-w-[80px] text-end"
                style={{ color: "var(--accent)" }}
              >
                ₪{((counts[norm.id] ?? 0) * norm.typical).toLocaleString("he-IL")}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        {result.totalCouples > 0 && (
          <div className="mt-6 card-gold p-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  סה״כ זוגות שהזנת
                </div>
                <div className="mt-1 text-2xl font-bold ltr-num">{result.totalCouples}</div>
              </div>
              <div>
                <div
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  הכנסה צפויה במעטפות
                </div>
                <div className="mt-1 text-3xl font-extrabold gradient-gold ltr-num">
                  ₪{result.totalExpected.toLocaleString("he-IL")}
                </div>
              </div>
            </div>

            {totalCost > 0 && (
              <div
                className="mt-4 pt-4 border-t flex items-center justify-between text-sm"
                style={{ borderColor: "var(--border-gold)" }}
              >
                <div style={{ color: "var(--foreground-soft)" }}>
                  עלות האירוע:{" "}
                  <span className="font-semibold ltr-num text-white">
                    ₪{totalCost.toLocaleString("he-IL")}
                  </span>
                </div>
                <div className={`font-bold ltr-num ${balanceColor}`}>
                  {balance > 0 ? "+" : balance < 0 ? "−" : ""}₪
                  {Math.abs(balance).toLocaleString("he-IL")}
                  <span className="text-xs font-normal mr-2">
                    {balance > 0 ? "רווח" : balance === 0 ? "מאוזן" : "חוסר"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {result.totalCouples === 0 && (
          <p
            className="mt-4 text-xs text-center"
            style={{ color: "var(--foreground-muted)" }}
          >
            💡 התחילו מלמלא כמה זוגות מכל קטגוריה — הסיכום יתעדכן בזמן אמת
          </p>
        )}

        {/* Tips */}
        <details className="mt-5 cursor-pointer">
          <summary
            className="text-sm font-semibold inline-flex items-center gap-2"
            style={{ color: "var(--accent)" }}
          >
            💡 טיפים לחישוב מדויק יותר
          </summary>
          <ul
            className="mt-3 space-y-2 text-sm pl-7"
            style={{ color: "var(--foreground-soft)" }}
          >
            <li>
              • <strong>ספרו זוגות, לא יחידים</strong> — מעטפה אחת בדרך כלל לכל זוג שמגיע
            </li>
            <li>
              • <strong>אורחי חוץ</strong> — מי שטס במיוחד מחו&quot;ל בדרך כלל מביא יותר מהממוצע של הקטגוריה שלו
            </li>
            <li>
              • <strong>אזור גיאוגרפי משפיע</strong> — בתל אביב הסכומים בדרך כלל גבוהים יותר מהפריפריה ב-15-20%
            </li>
            <li>
              • <strong>שמרו על הערכות ריאליות</strong> — עדיף לתכנן עם תרחיש שמרני ולהתפלא לטובה
            </li>
            <li>
              • <strong>אורחים בודדים</strong> (ללא בן/בת זוג) — בדרך כלל כ-60% מהסכום שזוג מביא
            </li>
          </ul>
        </details>
      </div>
    </section>
  );
}

function BudgetRow({ item }: { item: BudgetItem }) {
  const [paid, setPaid] = useState(String(item.paid ?? 0));

  // R19 P1#3: mirror the prop into local state when it changes externally
  // (another tab, sync from cloud, an action that updates this row from
  // elsewhere). Without this, the input keeps the stale local value and
  // diverges silently from `item.paid`. This is the documented "mirror an
  // external value into local state" pattern — setState-in-effect is
  // intentional here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaid(String(item.paid ?? 0));
  }, [item.paid]);

  const updatePaid = (v: string) => {
    // Always reflect the raw input so the user sees what they typed —
    // but only push to the store when it parses to a valid non-negative
    // number. Otherwise an "abc" entry used to land as NaN in the store
    // and poison every downstream sum (totalCost, % spent, etc.).
    setPaid(v);
    if (v.trim() === "") {
      actions.updateBudgetItem(item.id, { paid: 0 });
      return;
    }
    const n = Number(v);
    if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return;
    actions.updateBudgetItem(item.id, { paid: n });
  };

  const value = item.actual ?? item.estimated;
  const paidAmount = item.paid ?? 0;
  const pct = value > 0 ? Math.min(100, (paidAmount / value) * 100) : 0;

  return (
    <div className="py-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[150px]">
        <div className="font-medium text-sm">{item.title}</div>
        <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-emerald-400/60" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-xs text-white/60 w-32">
        עלות: <span className="text-white font-semibold">₪{value.toLocaleString("he-IL")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">שולם:</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          className="input !py-1.5 !px-2 w-24 text-sm text-center"
          value={paid}
          onChange={(e) => updatePaid(e.target.value)}
        />
      </div>
      <button
        onClick={() => actions.removeBudgetItem(item.id)}
        // R19 P2#7: 44×44 minimum touch target (WCAG 2.5.5). Hover color
        // and icon size unchanged; only the hit area expanded.
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition"
        aria-label={`מחק את "${item.title}"`}
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </div>
  );
}

function AddBudgetModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<BudgetCategory>("venue");
  const [estimated, setEstimated] = useState("");
  const [actual, setActual] = useState("");
  const [paid, setPaid] = useState("");

  // parseAmount: returns a finite non-negative number, or null when the
  // input is blank/invalid. Callers decide what to do with null (skip the
  // field, treat as 0, etc.). Centralizing the check keeps every "abc"
  // typo from leaking into the store as NaN.
  const parseAmount = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return null;
    return n;
  };
  const estimatedNum = parseAmount(estimated);
  const isValid = title.trim().length > 0 && estimatedNum !== null && estimatedNum > 0;

  const submit = () => {
    if (!isValid || estimatedNum === null) return;
    const actualNum = parseAmount(actual);
    const paidNum = parseAmount(paid);
    actions.addBudgetItem({
      title: title.trim(),
      category,
      estimated: estimatedNum,
      actual: actualNum ?? undefined,
      paid: paidNum ?? undefined,
    });
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isValid) submit();
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} onKeyDown={onKeyDown}>
      <div className="card glass-strong p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-[--accent]" />
          <h3 className="text-xl font-bold">הוצאה חדשה</h3>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>קטגוריה</label>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as BudgetCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} style={{ background: "var(--surface)", color: "var(--foreground)" }}>
                  {BUDGET_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>שם פריט <span style={{ color: "var(--accent)" }}>*</span></label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: אולם הכוכב" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>עלות צפויה ₪ <span style={{ color: "var(--accent)" }}>*</span></label>
              <input className="input" type="number" inputMode="decimal" min={0} value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="50000" />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5">עלות בפועל ₪</label>
              <input className="input" type="number" inputMode="decimal" min={0} value={actual} onChange={(e) => setActual(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1.5">שולם עד כה ₪</label>
            <input className="input" type="number" inputMode="decimal" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
        </div>
        {!isValid && (title || estimated) && (
          <p className="mt-3 text-xs" style={{ color: "var(--foreground-muted)" }}>
            {!title.trim() ? "הזן שם לפריט" : "הזן עלות צפויה גדולה מ-0"}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button
            onClick={submit}
            disabled={!isValid}
            className="btn-gold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            הוסף
          </button>
        </div>
      </div>
    </div>
  );
}
