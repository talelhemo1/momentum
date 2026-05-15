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
import { CalculatorsHub } from "@/components/calculators/CalculatorsHub";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import {
  BUDGET_CATEGORY_LABELS,
  type BudgetCategory,
  type BudgetItem,
} from "@/lib/types";
import {
  Wallet,
  Plus,
  Trash2,
  ArrowRight,
  AlertCircle,
  Scale,
} from "lucide-react";

const CATEGORIES = Object.keys(BUDGET_CATEGORY_LABELS) as BudgetCategory[];

type BudgetTab = "budget" | "calculators" | "cfo" | "transparency";

// R12 §2M — `vendor_cost_reports` has no submission UI yet, so the
// transparency tab would always show the "not enough data" empty state.
// Hide it until the Phase 8 post-event reporting form lands. Toggle this
// flag back to true when wiring the form.
const TRANSPARENCY_TAB_ENABLED = false;

const BUDGET_TABS: ReadonlyArray<{ id: BudgetTab; label: string; emoji: string }> = [
  { id: "budget", label: "תקציב", emoji: "💰" },
  { id: "calculators", label: "מחשבונים", emoji: "🧮" },
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
    // ?? 0 — legacy/imported items can have `estimated: undefined`,
    // which otherwise poisons the headline to "₪NaN".
    const totalEstimated = state.budget.reduce((s, b) => s + (b.estimated ?? 0), 0);
    const totalActual = state.budget.reduce((s, b) => s + (b.actual ?? 0), 0);
    const totalPaid = state.budget.reduce((s, b) => s + (b.paid ?? 0), 0);
    const limit = state.event?.budgetTotal ?? 0;
    // Projected = best-known cost per item (actual if known, else estimated).
    const projected = state.budget.reduce((s, b) => s + (b.actual ?? b.estimated ?? 0), 0);
    const remaining = limit - projected;
    return { totalEstimated, totalActual, totalPaid, projected, remaining, limit };
  }, [state.budget, state.event]);

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

          {activeTab === "calculators" && (
            <div className="mt-8">
              <CalculatorsHub state={state} />
            </div>
          )}

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

          {/* R22 — the envelope + relationship calculators moved into the
              unified "מחשבונים" tab (CalculatorsHub → EnvelopeCalculator).
              Removed from the budget tab to avoid duplication. */}

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
