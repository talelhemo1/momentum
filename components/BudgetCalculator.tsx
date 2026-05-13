"use client";

import { useMemo, useState } from "react";
import { BUDGET_CATEGORY_LABELS, type BudgetCategory } from "@/lib/types";
import { Calculator, Sparkles, ChevronDown, ChevronUp, Check } from "lucide-react";

/**
 * Smart budget calculator — gives the user an Israeli-market-realistic estimate
 * of what their event "should" cost, broken down by category. Three tiers, with
 * per-guest costs that scale + fixed costs that don't (photographer, attire).
 *
 * Numbers are calibrated against typical 2026 wedding spend in Israel; close
 * enough to be a useful planning anchor.
 */

type Tier = "modest" | "balanced" | "premium";

const TIER_LABELS: Record<Tier, string> = {
  modest: "צנוע",
  balanced: "מאוזן",
  premium: "פרימיום",
};

const TIER_ACCENTS: Record<Tier, string> = {
  modest: "rgb(96,165,250)",
  balanced: "var(--accent)",
  premium: "rgb(216,180,254)",
};

interface CategoryDef {
  cat: BudgetCategory;
  /** Per-guest cost in NIS (multiplied by guest count). */
  perGuest: number;
  /** Fixed cost in NIS (doesn't scale with guests). */
  fixed: number;
}

/** Cost model per tier. Sum of (perGuest * guests) + fixed = category total. */
const MODEL: Record<Tier, CategoryDef[]> = {
  modest: [
    { cat: "venue", perGuest: 230, fixed: 8000 },
    { cat: "catering", perGuest: 220, fixed: 0 },
    { cat: "photography", perGuest: 0, fixed: 6500 },
    { cat: "music", perGuest: 0, fixed: 4000 },
    { cat: "flowers", perGuest: 0, fixed: 2500 },
    { cat: "decoration", perGuest: 0, fixed: 1500 },
    { cat: "attire", perGuest: 0, fixed: 4500 },
    { cat: "invitations", perGuest: 4, fixed: 500 },
    { cat: "transportation", perGuest: 0, fixed: 1200 },
    { cat: "other", perGuest: 10, fixed: 1500 },
  ],
  balanced: [
    { cat: "venue", perGuest: 320, fixed: 12000 },
    { cat: "catering", perGuest: 300, fixed: 0 },
    { cat: "photography", perGuest: 0, fixed: 9500 },
    { cat: "music", perGuest: 0, fixed: 5500 },
    { cat: "flowers", perGuest: 0, fixed: 4500 },
    { cat: "decoration", perGuest: 0, fixed: 3000 },
    { cat: "attire", perGuest: 0, fixed: 8500 },
    { cat: "invitations", perGuest: 6, fixed: 800 },
    { cat: "transportation", perGuest: 0, fixed: 2500 },
    { cat: "other", perGuest: 18, fixed: 3000 },
  ],
  premium: [
    { cat: "venue", perGuest: 480, fixed: 18000 },
    { cat: "catering", perGuest: 420, fixed: 0 },
    { cat: "photography", perGuest: 0, fixed: 15000 },
    { cat: "music", perGuest: 0, fixed: 9000 },
    { cat: "flowers", perGuest: 0, fixed: 8000 },
    { cat: "decoration", perGuest: 0, fixed: 6000 },
    { cat: "attire", perGuest: 0, fixed: 16000 },
    { cat: "invitations", perGuest: 9, fixed: 1500 },
    { cat: "transportation", perGuest: 0, fixed: 5000 },
    { cat: "other", perGuest: 30, fixed: 6000 },
  ],
};

export function BudgetCalculator({
  guestEstimate,
  currentBudget,
  budgetLimit,
}: {
  guestEstimate: number;
  /** Sum of the user's current budget items (projected actual spend). */
  currentBudget: number;
  /** The budgetTotal they set during onboarding. */
  budgetLimit: number;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Tier>("balanced");
  const [guests, setGuests] = useState(guestEstimate || 100);

  const breakdown = useMemo(() => {
    return MODEL[tier].map((d) => ({
      cat: d.cat,
      total: d.perGuest * guests + d.fixed,
    }));
  }, [tier, guests]);

  const total = breakdown.reduce((s, b) => s + b.total, 0);
  const perGuest = guests > 0 ? Math.round(total / guests) : 0;
  const vsBudget = budgetLimit > 0 ? Math.round((total / budgetLimit) * 100) : 0;
  const vsCurrent = currentBudget > 0 ? Math.round((total / currentBudget) * 100) : 0;

  return (
    <section className="card p-6 md:p-7 mt-8 relative overflow-hidden">
      <div aria-hidden className="absolute -bottom-16 -start-16 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.18),transparent_70%)] blur-2xl" />

      <header className="relative flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="pill" style={{ background: "rgba(96,165,250,0.1)", color: "rgb(147,197,253)", borderColor: "rgba(96,165,250,0.3)" }}>
            <Calculator size={11} />
            מחשבון תקציב חכם
          </span>
          <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">
            <span className="gradient-text">כמה זה באמת יעלה לך?</span>
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            מודל מבוסס שוק 2026 — בחר רמה ומספר אורחים, וקבל פירוט לפי קטגוריה.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 transition"
          style={{ border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
        >
          {open ? "סגור" : "פתח מחשבון"}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </header>

      {open && (
        <div className="relative mt-6 fade-up">
          {/* Tier picker */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TIER_LABELS) as Tier[]).map((t) => {
              const active = tier === t;
              return (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className="rounded-2xl py-3 px-3 text-sm font-bold transition relative"
                  style={{
                    background: active ? "rgba(212,176,104,0.1)" : "var(--input-bg)",
                    border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                    color: active ? TIER_ACCENTS[t] : "var(--foreground-soft)",
                  }}
                >
                  {active && <Check size={12} className="absolute top-2 end-2" />}
                  {TIER_LABELS[t]}
                </button>
              );
            })}
          </div>

          {/* Guest count slider */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span style={{ color: "var(--foreground-soft)" }}>מספר אורחים</span>
              <span className="font-bold ltr-num">{guests}</span>
            </div>
            <input
              type="range"
              min={30}
              max={800}
              step={10}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="מספר אורחים"
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--foreground-muted)" }}>
              <span className="ltr-num">30</span>
              <span className="ltr-num">800</span>
            </div>
          </div>

          {/* Result summary */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card-gold p-4">
              <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>סך הכל צפוי</div>
              <div className="mt-1 text-3xl font-extrabold ltr-num gradient-gold">
                ₪{total.toLocaleString("he-IL")}
              </div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>למוזמן</div>
              <div className="mt-1 text-2xl font-bold ltr-num">₪{perGuest.toLocaleString("he-IL")}</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>מהתקציב שהגדרת</div>
              <div className="mt-1 text-2xl font-bold ltr-num" style={{ color: vsBudget > 110 ? "rgb(248,113,113)" : vsBudget < 80 ? "rgb(110,231,183)" : "var(--accent)" }}>
                {budgetLimit > 0 ? `${vsBudget}%` : "—"}
              </div>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="mt-6 space-y-1.5">
            {breakdown
              .slice()
              .sort((a, b) => b.total - a.total)
              .map(({ cat, total: catTotal }) => {
                const pct = total > 0 ? (catTotal / total) * 100 : 0;
                return (
                  <div key={cat} className="rounded-xl px-3 py-2.5" style={{ border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{BUDGET_CATEGORY_LABELS[cat]}</span>
                      <span className="ltr-num font-bold">₪{catTotal.toLocaleString("he-IL")}</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                      <div
                        className="h-full bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9] transition-[width] duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Smart insight */}
          <div className="mt-5 rounded-2xl p-4 flex items-start gap-2.5" style={{ background: "rgba(212,176,104,0.06)", border: "1px solid var(--border-gold)" }}>
            <Sparkles size={16} className="text-[--accent] mt-0.5 shrink-0" />
            <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>
              {currentBudget > 0 && vsCurrent !== 100 ? (
                vsCurrent > 100 ? (
                  <>הערכה זו גבוהה ב-<span className="ltr-num font-bold">{vsCurrent - 100}%</span> מההוצאות שהזנת — בדוק אם פספסת קטגוריה.</>
                ) : (
                  <>אתה כרגע נמוך ב-<span className="ltr-num font-bold">{100 - vsCurrent}%</span> מההערכה לרמה הזו — או שמצאת מחירים טובים, או שיש קטגוריה חסרה.</>
                )
              ) : budgetLimit > 0 && vsBudget > 110 ? (
                <>ההערכה גבוהה ב-<span className="ltr-num font-bold">{vsBudget - 100}%</span> מהתקציב שהגדרת. שקול לרדת רמה או להעלות תקציב ב-<span className="ltr-num font-bold">₪{(total - budgetLimit).toLocaleString("he-IL")}</span>.</>
              ) : budgetLimit > 0 && vsBudget < 80 ? (
                <>יש לך מרווח של <span className="ltr-num font-bold">₪{(budgetLimit - total).toLocaleString("he-IL")}</span> מעל ההערכה — או שאתה יכול לעלות רמה, או לשמור כעתודה.</>
              ) : (
                <>השוק ב-2026 פועל ברווחי תמחור גדולים. השוואת 3 ספקים בכל קטגוריה חוסכת בממוצע 12-18%.</>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
