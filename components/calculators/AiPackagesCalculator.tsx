"use client";

import { useMemo, useState } from "react";
import { Sparkles, Check, X, Minus, Plus, Star } from "lucide-react";
import type { AppState } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { MoneyInput, parseMoney } from "@/components/inputs/MoneyInput";
import {
  getAiPackages,
  computePackagesFallback,
  PRIORITY_LABELS,
  type Priority,
  type PackagesResult,
  type PackageProposal,
} from "@/lib/aiPackagesCalculator";

const ACTIVE_KEY = "momentum.ai_package.active.v1";
const fmt = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const ALL_PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];

export function AiPackagesCalculator({ state }: { state: AppState }) {
  // Defaults from live state.
  const defaults = useMemo(() => {
    const active = (state.guests || []).filter(
      (g) => g.status !== "declined",
    ).length;
    return {
      budget: state.event?.budgetTotal || 80000,
      guests: active > 0 ? active : state.event?.guestEstimate || 150,
    };
  }, [state]);

  const [budgetStr, setBudgetStr] = useState(
    defaults.budget.toLocaleString("he-IL"),
  );
  const [guests, setGuests] = useState(defaults.guests);
  const [priorities, setPriorities] = useState<Priority[]>([
    "food",
    "venue",
    "vibe",
  ]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<PackagesResult | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const togglePriority = (p: Priority) => {
    setPriorities((cur) => {
      if (cur.includes(p)) return cur.filter((x) => x !== p);
      if (cur.length >= 3) return cur; // exactly 3
      return [...cur, p];
    });
  };

  const canGenerate = priorities.length === 3 && parseMoney(budgetStr) > 0;

  const generate = async () => {
    if (!canGenerate) return;
    setStatus("loading");
    setResult(null);
    const inputs = {
      budget_total: parseMoney(budgetStr),
      guests_count: guests,
      event_type: state.event?.type ?? ("wedding" as const),
      priorities,
    };
    try {
      let token: string | undefined;
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          token = data.session?.access_token;
        }
      } catch {
        /* no session — endpoint will 401 → fallback kicks in */
      }
      const r = await getAiPackages(inputs, token);
      setResult(r);
      setStatus("done");
    } catch {
      // getAiPackages already falls back internally; this is the last
      // resort if even the deterministic engine throws.
      try {
        setResult(computePackagesFallback(inputs));
        setStatus("done");
      } catch {
        setStatus("error");
      }
    }
  };

  const selectPackage = (name: string) => {
    setActive(name);
    try {
      window.localStorage.setItem(
        ACTIVE_KEY,
        JSON.stringify({ name, at: new Date().toISOString() }),
      );
    } catch {
      /* private mode — in-memory only */
    }
  };

  return (
    <div>
      {/* ── Input form ── */}
      <div
        className="rounded-3xl p-5 md:p-6"
        style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              סך הכל תקציב
            </label>
            <MoneyInput
              value={budgetStr}
              onChange={setBudgetStr}
              ariaLabel="סך הכל תקציב בשקלים"
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              מספר מוזמנים
            </label>
            <div
              className="flex items-stretch rounded-2xl overflow-hidden"
              style={{ border: "1px solid var(--border)", background: "var(--surface-2)" }}
            >
              <button
                type="button"
                onClick={() => setGuests((g) => Math.max(10, g - 10))}
                className="px-4 flex items-center justify-center hover:bg-white/5 transition"
                aria-label="פחות 10"
              >
                <Minus size={16} />
              </button>
              <input
                dir="ltr"
                inputMode="numeric"
                value={guests}
                onChange={(e) =>
                  setGuests(
                    Math.max(10, Math.min(1000, Number(e.target.value.replace(/\D/g, "")) || 0)),
                  )
                }
                className="flex-1 bg-transparent text-center text-lg font-bold ltr-num outline-none"
                style={{ color: "var(--foreground)" }}
                aria-label="מספר מוזמנים"
              />
              <button
                type="button"
                onClick={() => setGuests((g) => Math.min(1000, g + 10))}
                className="px-4 flex items-center justify-center hover:bg-white/5 transition"
                aria-label="עוד 10"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm" style={{ color: "var(--foreground-soft)" }}>
              3 העדיפויות שלך
            </label>
            <span
              className="text-xs ltr-num"
              style={{ color: priorities.length === 3 ? "var(--accent)" : "var(--foreground-muted)" }}
            >
              {priorities.length}/3
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_PRIORITIES.map((p) => {
              const on = priorities.includes(p);
              const order = priorities.indexOf(p) + 1;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePriority(p)}
                  className="px-4 py-2.5 rounded-full text-sm transition hover:translate-y-[-1px] inline-flex items-center gap-1.5"
                  style={
                    on
                      ? {
                          background: "linear-gradient(135deg, #F4DEA9, #A8884A)",
                          color: "#1A1310",
                          fontWeight: 700,
                        }
                      : {
                          background: "var(--surface-2)",
                          color: "var(--foreground-soft)",
                          border: "1px solid var(--border)",
                        }
                  }
                >
                  {on && (
                    <span className="ltr-num text-[11px] opacity-80">{order}</span>
                  )}
                  {PRIORITY_LABELS[p]}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate || status === "loading"}
          className="btn-gold w-full mt-6 py-3.5 text-base inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Sparkles size={18} />
          {status === "loading" ? "AI חושב על האירוע שלך..." : "✨ צור 3 הצעות חכמות"}
        </button>
      </div>

      {/* ── Result ── */}
      {status === "loading" && <LoadingSkeleton />}

      {status === "error" && (
        <div
          className="mt-6 rounded-2xl p-5 text-center text-sm"
          style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "rgb(252,165,165)",
          }}
        >
          לא הצלחנו ליצור הצעה כרגע. נסה שוב, או צור קשר ב-support@momentum.app
        </div>
      )}

      {status === "done" && result && (
        <div className="mt-7">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {result.packages.map((pkg) => (
              <PackageCard
                key={pkg.name}
                pkg={pkg}
                guests={guests}
                active={active === pkg.name}
                onSelect={() => selectPackage(pkg.name)}
              />
            ))}
          </div>
          <div
            className="mt-6 rounded-2xl p-4 text-center text-sm font-semibold"
            style={{
              background: "rgba(212,176,104,0.10)",
              border: "1px solid var(--border-gold)",
              color: "var(--accent)",
            }}
          >
            {result.recommendation}
            {result.source === "fallback" && (
              <span
                className="block mt-1 text-[11px] font-normal"
                style={{ color: "var(--foreground-muted)" }}
              >
                (חישוב חכם מקומי — חיבור ל-AI יעשיר את ההצעות בהמשך)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const BREAKDOWN_LABELS: Record<string, string> = {
  food: "אוכל",
  venue: "אולם",
  music: "מוזיקה",
  photography: "צילום",
  decor: "עיצוב",
  alcohol: "אלכוהול",
};

function PackageCard({
  pkg,
  guests,
  active,
  onSelect,
}: {
  pkg: PackageProposal;
  guests: number;
  active: boolean;
  onSelect: () => void;
}) {
  // R24 — when this package is selected the host can fine-tune the
  // budget split per category; total + per-guest recompute live.
  const [edited, setEdited] = useState<Record<string, number> | null>(null);
  const bd = edited ?? (pkg.breakdown as unknown as Record<string, number>);
  const editedTotal = Object.values(bd).reduce((a, b) => a + b, 0);
  const editedPerGuest = guests > 0 ? Math.round(editedTotal / guests) : 0;
  const isDirty = edited !== null;

  return (
    <div
      className="rounded-3xl p-5 flex flex-col transition hover:translate-y-[-2px]"
      style={{
        background:
          "linear-gradient(165deg, rgba(212,176,104,0.08), rgba(168,136,74,0.02))",
        border: active
          ? "1.5px solid var(--accent)"
          : "1px solid var(--border-gold)",
        boxShadow: active ? "0 0 0 3px rgba(212,176,104,0.18)" : undefined,
      }}
    >
      <div className="text-center">
        <div className="text-3xl" aria-hidden>
          {pkg.emoji}
        </div>
        <div className="mt-1 text-lg font-bold">{pkg.name}</div>
        <div
          className="mt-3 font-extrabold gradient-gold ltr-num leading-none"
          style={{ fontSize: "clamp(34px, 7vw, 46px)" }}
        >
          {fmt(editedPerGuest)}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
          לאורח · סה״כ {fmt(editedTotal)}
          {isDirty && <span style={{ color: "var(--accent)" }}> · מותאם</span>}
        </div>
      </div>

      {/* Vibe meter */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "var(--foreground-muted)" }}>
          <span>וייב</span>
          <span className="ltr-num">{pkg.vibe_score}/10</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-2 rounded-full"
              style={{
                background:
                  i < pkg.vibe_score
                    ? "linear-gradient(90deg, #F4DEA9, #A8884A)"
                    : "var(--input-bg)",
              }}
            />
          ))}
        </div>
      </div>

      {/* R24 — editable budget split (only on the selected package) */}
      {active && (
        <div
          className="mt-4 rounded-2xl p-3 space-y-1.5"
          style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span style={{ color: "var(--foreground-soft)" }}>
              כוונון פילוח התקציב
            </span>
            {isDirty && (
              <button
                onClick={() => setEdited(null)}
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                איפוס
              </button>
            )}
          </div>
          {Object.keys(pkg.breakdown).map((k) => (
            <div key={k} className="flex items-center justify-between gap-2 text-xs">
              <span style={{ color: "var(--foreground-soft)" }}>
                {BREAKDOWN_LABELS[k] ?? k}
              </span>
              <span className="inline-flex items-center gap-1">
                <span style={{ color: "var(--foreground-muted)" }}>₪</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={bd[k]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setEdited({
                      ...bd,
                      [k]: Number.isFinite(n) && n >= 0 ? n : 0,
                    });
                  }}
                  className="w-20 bg-transparent text-center outline-none ltr-num rounded py-0.5"
                  style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}
                  aria-label={BREAKDOWN_LABELS[k] ?? k}
                />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        {pkg.pros.map((p, i) => (
          <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
            <Check size={13} className="mt-0.5 shrink-0 text-emerald-400" />
            <span>{p}</span>
          </div>
        ))}
        {pkg.cons.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground-muted)" }}>
            <X size={13} className="mt-0.5 shrink-0" style={{ color: "rgb(248,113,113)" }} />
            <span>{c}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="mt-5 w-full py-2.5 rounded-full text-sm font-semibold transition inline-flex items-center justify-center gap-2"
        style={
          active
            ? { background: "var(--accent)", color: "#1A1310" }
            : {
                background: "rgba(212,176,104,0.12)",
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }
        }
      >
        {active ? (
          <><Star size={14} /> נבחרה</>
        ) : (
          "בחר חבילה זו"
        )}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mt-7">
      <p className="text-center text-sm mb-4" style={{ color: "var(--foreground-soft)" }}>
        ✨ AI חושב על האירוע שלך...
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-3xl p-5 animate-pulse"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)", minHeight: 340 }}
          >
            <div className="h-8 w-8 mx-auto rounded-full bg-white/10" />
            <div className="h-4 w-20 mx-auto mt-3 rounded bg-white/10" />
            <div className="h-10 w-32 mx-auto mt-3 rounded bg-white/10" />
            <div className="h-2 w-full mt-6 rounded bg-white/10" />
            <div className="space-y-2 mt-5">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-3 w-full rounded bg-white/10" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
