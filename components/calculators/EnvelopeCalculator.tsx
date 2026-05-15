"use client";

import { useMemo, useState } from "react";
import {
  calcEnvelopeFromState,
  RELATIONSHIP_NORMS,
  calcRelationshipBreakdown,
  type RelationshipType,
} from "@/lib/envelope";
import type { AppState } from "@/lib/types";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Scale,
  Mail,
  Heart,
} from "lucide-react";

export function EnvelopeCalculator({ state }: { state: AppState }) {
  const envelope = useMemo(
    () => (state.event ? calcEnvelopeFromState(state) : null),
    [state],
  );

  if (!state.event || !envelope || envelope.verdict === "no-data") {
    return (
      <div
        className="text-center p-8"
        style={{ color: "var(--foreground-soft)" }}
      >
        הוסף תקציב ומוזמנים כדי לחשב כמה צריך להכניס במעטפות.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EnvelopeCard
        envelope={envelope}
        guests={envelope.guestCount}
        totalCost={envelope.totalCost}
      />
      {/* R18 — relationship-based "what if" calculator. Renders whenever
          there's an active event, even if the envelope card above had no
          data yet (the user can plan envelope intake before logging any
          budget items). totalCost falls back to 0 cleanly. */}
      <RelationshipCalculator totalCost={envelope.totalCost} />
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
