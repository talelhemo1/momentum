"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { PrintButton } from "@/components/PrintButton";
import { BalanceSkeleton } from "@/components/skeletons/PageSkeletons";
import { useAppState, actions } from "@/lib/store";
import { useUser } from "@/lib/user";
import type { Guest } from "@/lib/types";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  ArrowRight,
  Search,
  Mail,
  Sparkles,
  Check,
  Filter,
  ArrowDownUp,
  Repeat,
  Info,
} from "lucide-react";

type FilterMode = "all" | "filled" | "empty";

export default function BalancePage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortByGiven, setSortByGiven] = useState(false);

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    if (hydrated && !state.event) router.replace("/onboarding");
  }, [userHydrated, user, hydrated, state.event, router]);

  // Eligible = anyone who actually came.
  const attended = useMemo(
    () => state.guests.filter((g) => g.status === "confirmed"),
    [state.guests],
  );

  const filtered = useMemo(() => {
    let list = attended;
    if (filter === "filled") list = list.filter((g) => g.envelopeAmount && g.envelopeAmount > 0);
    if (filter === "empty") list = list.filter((g) => !g.envelopeAmount || g.envelopeAmount === 0);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(s));
    }
    if (sortByGiven) list = [...list].sort((a, b) => (b.envelopeAmount ?? 0) - (a.envelopeAmount ?? 0));
    return list;
  }, [attended, filter, search, sortByGiven]);

  // Money math
  const totals = useMemo(() => {
    const totalIncome = attended.reduce((s, g) => s + (g.envelopeAmount ?? 0), 0);
    const filledCount = attended.filter((g) => g.envelopeAmount && g.envelopeAmount > 0).length;
    const totalCost = state.budget.reduce((s, b) => s + (b.actual ?? b.estimated), 0)
      || (state.event?.budgetTotal ?? 0);
    const net = totalIncome - totalCost;
    const totalHeads = attended.reduce((s, g) => s + (g.attendingCount || 1), 0);
    const avgPerHead = totalHeads > 0 && filledCount > 0
      ? Math.round(totalIncome / attended.filter((g) => g.envelopeAmount).reduce((sum, g) => sum + (g.attendingCount || 1), 0))
      : 0;
    return { totalIncome, filledCount, totalCost, net, totalHeads, avgPerHead };
  }, [attended, state.budget, state.event]);

  const verdict = totals.net > 0 ? "profit" : totals.net < 0 ? "loss" : "balanced";

  if (!hydrated || !state.event) {
    return (
      <>
        <Header />
        <BalanceSkeleton />
      </>
    );
  }

  const dateFmt = new Date(state.event.date).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <Header />
      <main className="flex-1 pb-28 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-0 opacity-30" />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">סיכום האירוע</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
                המאזן שלך
              </h1>
              <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
                מלא כמה כל אורח שם במעטפה — נחשב לך רווח/הפסד וכמה להחזיר באירועים שלהם.
              </p>
            </div>
            <PrintButton label="ייצא מאזן ל-PDF" />
          </div>

          {/* Big money panel */}
          <SummaryPanel
            totalIncome={totals.totalIncome}
            totalCost={totals.totalCost}
            net={totals.net}
            verdict={verdict}
            avgPerHead={totals.avgPerHead}
            filledCount={totals.filledCount}
            totalAttended={attended.length}
            eventLabel={EVENT_TYPE_LABELS[state.event.type]}
            dateFmt={dateFmt}
          />

          {attended.length === 0 ? (
            <div className="card p-10 mt-8 text-center" style={{ color: "var(--foreground-muted)" }}>
              עוד לא אישרו הגעה. אחרי האירוע, מי שאישר/הגיע יופיע כאן כדי שתוכל לרשום מה הוא הביא.
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="card p-4 mt-8 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2" style={{ color: "var(--foreground-muted)" }} />
                  <input
                    className="input pe-10 !py-2.5 text-sm"
                    placeholder="חפש מוזמן..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <FilterPill icon={<Filter size={12} />} label="הכל" active={filter === "all"} onClick={() => setFilter("all")} />
                <FilterPill icon={<Check size={12} />} label="מולא" active={filter === "filled"} onClick={() => setFilter("filled")} />
                <FilterPill icon={<Mail size={12} />} label="חסר" active={filter === "empty"} onClick={() => setFilter("empty")} />
                <button
                  onClick={() => setSortByGiven((v) => !v)}
                  className={`text-xs rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 transition ${
                    sortByGiven ? "bg-[var(--secondary-button-bg-hover)]" : ""
                  }`}
                  style={{ border: "1px solid var(--border)", color: sortByGiven ? "var(--accent)" : "var(--foreground-soft)" }}
                >
                  <ArrowDownUp size={12} /> מיין לפי סכום
                </button>
              </div>

              {/* Guest list */}
              <div className="mt-4 space-y-2">
                {filtered.map((g) => (
                  <EnvelopeRow key={g.id} guest={g} />
                ))}
                {filtered.length === 0 && (
                  <div className="card p-8 text-center" style={{ color: "var(--foreground-muted)" }}>
                    אין מוזמנים שתואמים את החיפוש.
                  </div>
                )}
              </div>

              {/* Reciprocity table */}
              {totals.filledCount > 0 && (
                <ReciprocitySection guests={attended.filter((g) => g.envelopeAmount && g.envelopeAmount > 0)} />
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryPanel({
  totalIncome,
  totalCost,
  net,
  verdict,
  avgPerHead,
  filledCount,
  totalAttended,
  eventLabel,
  dateFmt,
}: {
  totalIncome: number;
  totalCost: number;
  net: number;
  verdict: "profit" | "loss" | "balanced";
  avgPerHead: number;
  filledCount: number;
  totalAttended: number;
  eventLabel: string;
  dateFmt: string;
}) {
  const netColor = verdict === "profit" ? "text-emerald-300" : verdict === "loss" ? "text-red-300" : "text-[--accent]";
  const netLabel = verdict === "profit" ? "צפוי רווח" : verdict === "loss" ? "צפוי הפסד" : "מאוזן";
  const netIcon = verdict === "profit" ? <TrendingUp size={20} /> : verdict === "loss" ? <TrendingDown size={20} /> : <Scale size={20} />;
  const fillPct = totalAttended > 0 ? Math.round((filledCount / totalAttended) * 100) : 0;

  return (
    <section className="card-gold p-7 md:p-8 mt-8 relative overflow-hidden">
      <div aria-hidden className="absolute -top-20 -end-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.16),transparent_70%)] blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="pill pill-gold">
            <Sparkles size={11} /> {eventLabel}
          </span>
          <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>{dateFmt}</span>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>סה״כ נכנס במעטפות</div>
            <div className="text-5xl md:text-7xl font-extrabold tracking-tight gradient-gold ltr-num mt-2">
              ₪{totalIncome.toLocaleString("he-IL")}
            </div>
            <div className="text-sm mt-2" style={{ color: "var(--foreground-soft)" }}>
              עלות האירוע: <span className="font-semibold ltr-num">₪{totalCost.toLocaleString("he-IL")}</span>
            </div>
          </div>
          <div className={`rounded-2xl px-5 py-4 inline-flex items-center gap-3 border ${
            verdict === "profit"
              ? "border-emerald-400/30 bg-emerald-400/10"
              : verdict === "loss"
                ? "border-red-400/30 bg-red-400/10"
                : "border-[var(--border-gold)] bg-[rgba(212,176,104,0.08)]"
          } ${netColor}`}>
            {netIcon}
            <div>
              <div className="text-xs opacity-75">{netLabel}</div>
              <div className="text-2xl font-extrabold ltr-num">
                {net >= 0 ? "+" : "−"}₪{Math.abs(net).toLocaleString("he-IL")}
              </div>
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="mt-6 pt-5 border-t grid grid-cols-2 sm:grid-cols-3 gap-4" style={{ borderColor: "var(--border)" }}>
          <Stat label="מולאו מעטפות" value={`${filledCount} / ${totalAttended}`} sub={`${fillPct}%`} />
          <Stat label="ממוצע למשתתף" value={avgPerHead > 0 ? `₪${avgPerHead.toLocaleString("he-IL")}` : "—"} sub="לפי שמולאו" />
          <Stat label="צפי לאיזון" value={totalAttended > 0 ? `₪${Math.ceil(totalCost / totalAttended).toLocaleString("he-IL")}` : "—"} sub="ממוצע למשתתף" />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>{label}</div>
      <div className="font-bold text-lg ltr-num mt-1">{value}</div>
      {sub && <div className="text-xs mt-0.5 ltr-num" style={{ color: "var(--foreground-muted)" }}>{sub}</div>}
    </div>
  );
}

function FilterPill({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 transition"
      style={{
        border: "1px solid var(--border)",
        background: active ? "var(--secondary-button-bg-hover)" : "transparent",
        color: active ? "var(--foreground)" : "var(--foreground-soft)",
      }}
    >
      {icon} {label}
    </button>
  );
}

function EnvelopeRow({ guest }: { guest: Guest }) {
  const [val, setVal] = useState(guest.envelopeAmount?.toString() ?? "");
  const [editing, setEditing] = useState(false);

  const save = () => {
    const num = Number(val);
    actions.setGuestEnvelope(guest.id, isNaN(num) || num <= 0 ? undefined : num);
    setEditing(false);
  };

  const filled = guest.envelopeAmount && guest.envelopeAmount > 0;

  return (
    <div className={`card p-4 flex items-center gap-3 ${filled ? "" : ""}`}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0"
        style={{
          background: filled
            ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
            : "var(--input-bg)",
          color: filled ? "var(--gold-button-text)" : "var(--foreground-soft)",
        }}
      >
        {guest.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{guest.name}</div>
        <div className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
          {guest.attendingCount > 1 ? `${guest.attendingCount} אנשים` : "אורח יחיד"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    setVal(guest.envelopeAmount?.toString() ?? "");
                    setEditing(false);
                  }
                }}
                onBlur={save}
                placeholder="0"
                className="input !py-2 !px-3 w-28 text-end"
                autoFocus
              />
              <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--foreground-muted)" }}>₪</span>
            </div>
          </>
        ) : (
          <button
            onClick={() => {
              setVal(guest.envelopeAmount?.toString() ?? "");
              setEditing(true);
            }}
            className={`rounded-2xl px-4 py-2 text-sm font-bold ltr-num transition ${
              filled ? "" : "border border-dashed"
            }`}
            style={
              filled
                ? { background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))", color: "var(--gold-button-text)" }
                : { borderColor: "var(--border-strong)", color: "var(--foreground-muted)" }
            }
          >
            {filled ? `₪${guest.envelopeAmount!.toLocaleString("he-IL")}` : "הוסף סכום"}
          </button>
        )}
      </div>
    </div>
  );
}

function ReciprocitySection({ guests }: { guests: Guest[] }) {
  const sorted = [...guests].sort((a, b) => (b.envelopeAmount ?? 0) - (a.envelopeAmount ?? 0));
  return (
    <section className="card p-6 md:p-7 mt-10">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--gold-100)]/20 to-[var(--gold-500)]/10 border border-[var(--border-gold)] flex items-center justify-center text-[--accent] shrink-0">
          <Repeat size={22} />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight gradient-text">להחזיר באירוע שלהם</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
            כשתהיה מוזמן לאירוע של אחד מהם — ההמלצה היא להחזיר את אותו הסכום (או יותר, אם הזוג גדל בינתיים).
            הרשימה שלך נשמרת בדפדפן ותהיה זמינה גם בעוד שנתיים.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-xs font-semibold" style={{ background: "var(--input-bg)", color: "var(--foreground-muted)" }}>
          <div>שם המוזמן</div>
          <div>הם נתנו</div>
          <div>תחזיר</div>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {sorted.map((g) => (
            <div key={g.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center text-sm">
              <div className="font-medium truncate">{g.name}</div>
              <div className="ltr-num" style={{ color: "var(--foreground-soft)" }}>
                ₪{g.envelopeAmount!.toLocaleString("he-IL")}
              </div>
              <div className="ltr-num font-bold gradient-gold">
                ₪{g.envelopeAmount!.toLocaleString("he-IL")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs rounded-2xl p-3" style={{ background: "var(--input-bg)", color: "var(--foreground-soft)" }}>
        <Info size={14} className="text-[--accent] mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">טיפ:</span> מקובל להוסיף 50-100₪ לזוג שכבר התחתן ומגדיל משפחה — הם נתנו לך כשהיו רק שניים, אתה מחזיר להם כשהם משפחה.
        </span>
      </div>
    </section>
  );
}
