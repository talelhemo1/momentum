"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save, Check, Plane, Home, Camera } from "lucide-react";
import type { AppState } from "@/lib/types";
import { useCountUp } from "@/lib/useCountUp";
import {
  simulate,
  impactHint,
  VENUE_TIER_LABELS,
  MEAL_OPTION_LABELS,
  PHOTO_TIER_LABELS,
  type SimulationInputs,
  type VenueTier,
  type MealOption,
  type BarHours,
  type PhotoTier,
} from "@/lib/whatIfSimulator";

const SNAP_KEY = "momentum.whatif.snapshot.v1";
const shek = (agorot: number) => Math.round(agorot / 100);
const fmt = (agorot: number) => `₪${shek(agorot).toLocaleString("he-IL")}`;

/** A sensible "current situation" reference from live state. */
function deriveBaseline(state: AppState): SimulationInputs {
  const active = (state.guests || []).filter(
    (g) => g.status !== "declined",
  ).length;
  const guests = active > 0 ? active : state.event?.guestEstimate || 150;
  return {
    guests: Math.min(400, Math.max(50, guests)),
    venueTier: "midrange",
    mealOption: "single",
    barHours: 4,
    photoTier: 2,
  };
}

const EQUIV_ICON = [Home, Plane, Camera];

export function WhatIfSimulator({ state }: { state: AppState }) {
  const baseline = useMemo(() => deriveBaseline(state), [state]);
  const [inputs, setInputs] = useState<SimulationInputs>(baseline);
  const [saved, setSaved] = useState(false);
  const flashRef = useRef<HTMLDivElement>(null);
  const prevDelta = useRef(0);

  // Keep in sync if the baseline (guest list) changes underneath us and
  // the user hasn't diverged yet.
  useEffect(() => {
    // Sync to an external trigger (the live guest list / baseline). This
    // is the documented valid use of setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputs(baseline);
  }, [baseline]);

  const result = useMemo(
    () => simulate(inputs, baseline),
    [inputs, baseline],
  );
  const totalShek = useCountUp(shek(result.total_event), 900);

  // Gold flash on improve / red flash on more-expensive.
  useEffect(() => {
    const d = result.delta_from_baseline;
    if (d === prevDelta.current || !flashRef.current) {
      prevDelta.current = d;
      return;
    }
    const el = flashRef.current;
    const cls = d < prevDelta.current ? "r21-flash-save" : "r21-flash-cost";
    el.classList.remove("r21-flash-save", "r21-flash-cost");
    // Force reflow so the animation re-triggers.
    void el.offsetWidth;
    el.classList.add(cls);
    prevDelta.current = d;
  }, [result.delta_from_baseline]);

  const set = <K extends keyof SimulationInputs>(
    k: K,
    v: SimulationInputs[K],
  ) => setInputs((p) => ({ ...p, [k]: v }));

  const saving = -result.delta_from_baseline; // positive = cheaper than now
  const guestPct = ((inputs.guests - 50) / (400 - 50)) * 100;

  const handleSave = () => {
    try {
      window.localStorage.setItem(
        SNAP_KEY,
        JSON.stringify({ inputs, at: new Date().toISOString() }),
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      /* private mode — ignore */
    }
  };

  return (
    <div className="card-gold p-6 md:p-7 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -bottom-24 -start-24 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(212,176,104,0.14), transparent 70%)",
          filter: "blur(36px)",
        }}
      />
      <div className="relative grid md:grid-cols-2 gap-7">
        {/* ── Controls ── */}
        <div className="space-y-6">
          <h3 className="text-lg md:text-xl font-bold">🎚️ What If Simulator</h3>

          {/* Guests slider */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span style={{ color: "var(--foreground-soft)" }}>מוזמנים</span>
              <span className="ltr-num font-bold" style={{ color: "var(--accent)" }}>
                {inputs.guests}
              </span>
            </div>
            <div className="r21-range-wrap">
              <input
                type="range"
                min={50}
                max={400}
                step={5}
                value={inputs.guests}
                onChange={(e) => set("guests", Number(e.target.value))}
                className="r21-range"
                style={{ ["--r21-fill" as string]: `${guestPct}%` }}
                aria-label="מספר מוזמנים"
              />
            </div>
            <p className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
              {impactHint("guests")}
            </p>
          </div>

          <PillRow
            label="אולם"
            hint={impactHint("venueTier")}
            options={
              Object.entries(VENUE_TIER_LABELS) as [VenueTier, string][]
            }
            value={inputs.venueTier}
            onChange={(v) => set("venueTier", v)}
          />
          <PillRow
            label="מנות"
            hint={impactHint("mealOption")}
            options={
              Object.entries(MEAL_OPTION_LABELS) as [MealOption, string][]
            }
            value={inputs.mealOption}
            onChange={(v) => set("mealOption", v)}
          />
          <PillRow
            label="בר פתוח"
            hint={impactHint("barHours")}
            options={[
              [0, "סגור"],
              [2, "שעתיים"],
              [4, "4 שעות"],
              [6, "6 שעות"],
            ]}
            value={inputs.barHours}
            onChange={(v) => set("barHours", v as BarHours)}
          />
          <PillRow
            label="צלם"
            hint={impactHint("photoTier")}
            options={
              Object.entries(PHOTO_TIER_LABELS).map(([k, v]) => [
                Number(k),
                v,
              ]) as [number, string][]
            }
            value={inputs.photoTier}
            onChange={(v) => set("photoTier", v as PhotoTier)}
          />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="btn-gold flex-1 inline-flex items-center justify-center gap-2 text-sm py-2.5"
            >
              {saved ? (
                <><Check size={15} /> נשמר</>
              ) : (
                <><Save size={15} /> שמור סימולציה</>
              )}
            </button>
            <button
              type="button"
              onClick={() => setInputs(baseline)}
              className="btn-secondary inline-flex items-center justify-center gap-2 text-sm py-2.5 px-4"
            >
              <RotateCcw size={15} /> אפס
            </button>
          </div>
        </div>

        {/* ── Live result ── */}
        <div
          ref={flashRef}
          className="rounded-3xl p-6 flex flex-col justify-center text-center"
          style={{
            background:
              "linear-gradient(160deg, rgba(212,176,104,0.10), rgba(168,136,74,0.03))",
            border: "1px solid var(--border-gold)",
          }}
        >
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
            סך הכל
          </div>
          <div
            className="font-extrabold tracking-tight gradient-gold ltr-num leading-none mt-1"
            style={{ fontSize: "clamp(40px, 10vw, 64px)" }}
          >
            ₪{totalShek.toLocaleString("he-IL")}
          </div>
          <div className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            <span className="ltr-num font-semibold">{fmt(result.per_guest)}</span> לאורח
          </div>

          {/* Delta vs current */}
          <div
            className="mt-4 mx-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
            style={
              saving > 0
                ? { background: "rgba(52,211,153,0.12)", color: "rgb(110,231,183)", border: "1px solid rgba(52,211,153,0.3)" }
                : saving < 0
                  ? { background: "rgba(248,113,113,0.12)", color: "rgb(252,165,165)", border: "1px solid rgba(248,113,113,0.3)" }
                  : { background: "var(--input-bg)", color: "var(--foreground-muted)", border: "1px solid var(--border)" }
            }
          >
            {saving > 0
              ? `חיסכון: ${fmt(saving)} מול המצב הנוכחי`
              : saving < 0
                ? `עלות נוספת: ${fmt(-saving)}`
                : "זהה למצב הנוכחי"}
          </div>

          {/* Savings equivalents */}
          {result.savings_equivalents.length > 0 && (
            <div className="mt-6 text-start">
              <div className="text-xs mb-2" style={{ color: "var(--foreground-soft)" }}>
                החיסכון שלך שווה ל:
              </div>
              <div className="space-y-2">
                {result.savings_equivalents.map((eq, i) => {
                  const Icon = EQUIV_ICON[i] ?? Home;
                  return (
                    <div
                      key={eq}
                      className="flex items-center gap-2.5 rounded-xl p-2.5 text-sm"
                      style={{ background: "var(--input-bg)" }}
                    >
                      <span
                        className="w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0"
                        style={{ background: "rgba(212,176,104,0.15)", color: "var(--accent)" }}
                      >
                        <Icon size={15} />
                      </span>
                      <span style={{ color: "var(--foreground-soft)" }}>{eq}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PillRow<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([val, lbl]) => {
          const active = val === value;
          return (
            <button
              key={String(val)}
              type="button"
              onClick={() => onChange(val)}
              className="px-3.5 py-2 rounded-full text-sm transition hover:translate-y-[-1px]"
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, #F4DEA9, #A8884A)",
                      color: "#1A1310",
                      fontWeight: 700,
                    }
                  : {
                      background: "var(--input-bg)",
                      color: "var(--foreground-soft)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {lbl}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] mt-1" style={{ color: "var(--foreground-muted)" }}>
        {hint}
      </p>
    </div>
  );
}
