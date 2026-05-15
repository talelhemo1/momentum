"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/store";
import {
  calculateAlcohol,
  PROFILE_LABELS,
  PROFILE_DESCRIPTIONS,
  PROFILE_DRINKS_PER_HOUR,
  BAR_STYLE_LABELS,
  BAR_STYLE_SHARES,
  DEFAULT_UNIT_PRICES,
  DEFAULT_SERVINGS,
  type DrinkingProfile,
  type BarStyle,
  type CategoryShares,
  type ServingsPerContainer,
  type UnitPrices,
} from "@/lib/alcoholCalculator";
import {
  BOTTLE_CATALOG,
  catalogByBrand,
  summarizeSelection,
  DRINK_CATEGORY_LABELS,
  type DrinkCategory,
  type SelectedBottle,
} from "@/lib/alcoholCatalog";
import {
  Wine,
  Beer,
  GlassWater,
  Sparkles,
  Users,
  Clock,
  Settings,
  RefreshCw,
  ChevronDown,
  Plus,
  Trash2,
  Check,
} from "lucide-react";

// Persistence: every editable slider/input survives a refresh so the host
// doesn't re-tune their numbers on every visit.
const STORAGE_KEY = "momentum.alcohol.v2";

interface PersistedSettings {
  adultHeads?: number;
  totalHeads?: number;
  hours?: number;
  profile?: DrinkingProfile;
  barStyle?: BarStyle;
  drinksPerHour?: number;
  shares?: CategoryShares;
  servings?: ServingsPerContainer;
  prices?: UnitPrices;
  softOnly?: boolean;
  advanced?: boolean;
  manuallyAdjusted?: { drinksPerHour?: boolean; shares?: boolean };
  // R23 — specific bottle selection.
  bottleSelection?: SelectedBottle[];
  useBottleSelection?: boolean;
}

function readPersisted(): PersistedSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writePersisted(value: PersistedSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota / private mode — non-fatal; the page still works for this session.
  }
}

export function AlcoholCalculator() {
  const { state, hydrated } = useAppState();

  const event = state.event;

  // Auto-fill heads from confirmed RSVPs.
  const { confirmedAdultHeads, confirmedTotalHeads } = useMemo(() => {
    let adults = 0;
    let total = 0;
    for (const g of state.guests) {
      if (g.status !== "confirmed") continue;
      const heads = g.attendingCount ?? 1;
      total += heads;
      if (g.ageGroup !== "child") adults += heads;
    }
    return { confirmedAdultHeads: adults, confirmedTotalHeads: total };
  }, [state.guests]);

  // ── Inputs ───────────────────────────────────────────────────────────────
  const [adultHeads, setAdultHeads] = useState<number>(0);
  const [totalHeads, setTotalHeads] = useState<number>(0);
  const [hours, setHours] = useState<number>(4);
  const [profile, setProfile] = useState<DrinkingProfile>("moderate");
  const [barStyle, setBarStyle] = useState<BarStyle>("full");

  const [advanced, setAdvanced] = useState(false);
  // Advanced-mode overrides. When the user is in quick mode, these mirror
  // the preset values; in advanced mode they're freely edited.
  const [drinksPerHour, setDrinksPerHour] = useState<number>(PROFILE_DRINKS_PER_HOUR.moderate);
  const [shares, setShares] = useState<CategoryShares>(BAR_STYLE_SHARES.full);
  const [servings, setServings] = useState<ServingsPerContainer>({ ...DEFAULT_SERVINGS });
  const [prices, setPrices] = useState<UnitPrices>({ ...DEFAULT_UNIT_PRICES });
  const [softOnly, setSoftOnly] = useState(false);
  // Track which advanced overrides the user touched; only those stay sticky
  // when they switch presets.
  const [manualDrinksPerHour, setManualDrinksPerHour] = useState(false);
  const [manualShares, setManualShares] = useState(false);

  // R23 — explicit per-bottle selection (catalog + custom + manual edit).
  const [bottleSelection, setBottleSelection] = useState<SelectedBottle[]>([]);
  const [useBottleSelection, setUseBottleSelection] = useState(false);
  const [bottlesOpen, setBottlesOpen] = useState(true);

  const [seeded, setSeeded] = useState(false);

  // Hydrate from localStorage + confirmed RSVPs once.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || seeded) return;
    const saved = readPersisted();
    if (saved.adultHeads != null) setAdultHeads(saved.adultHeads);
    else if (confirmedAdultHeads > 0) setAdultHeads(confirmedAdultHeads);
    else if (event?.guestEstimate) setAdultHeads(Math.round(event.guestEstimate * 0.9));
    if (saved.totalHeads != null) setTotalHeads(saved.totalHeads);
    else if (confirmedTotalHeads > 0) setTotalHeads(confirmedTotalHeads);
    else if (event?.guestEstimate) setTotalHeads(event.guestEstimate);
    if (saved.hours != null) setHours(saved.hours);
    if (saved.profile) setProfile(saved.profile);
    if (saved.barStyle) setBarStyle(saved.barStyle);
    if (saved.advanced != null) setAdvanced(saved.advanced);
    if (saved.drinksPerHour != null) setDrinksPerHour(saved.drinksPerHour);
    if (saved.shares) setShares(saved.shares);
    if (saved.servings) setServings({ ...DEFAULT_SERVINGS, ...saved.servings });
    if (saved.prices) setPrices({ ...DEFAULT_UNIT_PRICES, ...saved.prices });
    if (saved.softOnly != null) setSoftOnly(saved.softOnly);
    if (saved.manuallyAdjusted?.drinksPerHour) setManualDrinksPerHour(true);
    if (saved.manuallyAdjusted?.shares) setManualShares(true);
    if (Array.isArray(saved.bottleSelection)) setBottleSelection(saved.bottleSelection);
    if (saved.useBottleSelection != null) setUseBottleSelection(saved.useBottleSelection);
    setSeeded(true);
  }, [hydrated, seeded, confirmedAdultHeads, confirmedTotalHeads, event]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // When the user picks a preset (and hasn't manually overridden the
  // matching advanced field), sync the advanced field to the preset. This
  // is the canonical "external prop changed → mirror to internal state"
  // shape — set-state-in-effect is the right tool here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!manualDrinksPerHour) setDrinksPerHour(PROFILE_DRINKS_PER_HOUR[profile]);
  }, [profile, manualDrinksPerHour]);

  useEffect(() => {
    if (!manualShares) setShares(BAR_STYLE_SHARES[barStyle]);
    setSoftOnly(barStyle === "soft-only");
  }, [barStyle, manualShares]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist on every change (after seed).
  useEffect(() => {
    if (!seeded) return;
    writePersisted({
      adultHeads, totalHeads, hours, profile, barStyle,
      drinksPerHour, shares, servings, prices, softOnly, advanced,
      manuallyAdjusted: { drinksPerHour: manualDrinksPerHour, shares: manualShares },
      bottleSelection, useBottleSelection,
    });
  }, [seeded, adultHeads, totalHeads, hours, profile, barStyle,
      drinksPerHour, shares, servings, prices, softOnly, advanced,
      manualDrinksPerHour, manualShares, bottleSelection, useBottleSelection]);

  const result = useMemo(
    () =>
      calculateAlcohol({
        adultHeads, totalHeads, hours,
        drinksPerHour, shares, servings, prices, softOnly,
      }),
    [adultHeads, totalHeads, hours, drinksPerHour, shares, servings, prices, softOnly],
  );

  const sharesSum = shares.wine + shares.beer + shares.spirits + shares.soft;

  // R23 — servings the host needs per category (drives the bottle picker's
  // coverage bars). Derived from the heuristic result.
  const needByCategory = useMemo<Record<DrinkCategory, number>>(() => {
    // num() coerces NaN/Infinity (empty head/hour inputs → Number("")
    // paths) to 0 so coverage bars never render width:NaN%.
    const num = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
    const totalDrinks = num(result.totalDrinks);
    return {
      wine: num(result.wine.glasses),
      beer: num(Math.round(totalDrinks * shares.beer)),
      spirits: num(result.spirits.servings),
      // Soft is computed in liters; a "serving" here ≈ 0.33L.
      soft: num(Math.ceil(result.soft.liters / 0.33)),
    };
  }, [result, shares.beer]);

  const selectionSummary = useMemo(
    () => summarizeSelection(bottleSelection, needByCategory),
    [bottleSelection, needByCategory],
  );

  // Effective grand total: the explicit selection when the host opted in
  // and actually picked bottles; otherwise the heuristic estimate.
  const effectiveTotal =
    useBottleSelection && bottleSelection.some((b) => b.qty > 0)
      ? selectionSummary.totalCost
      : result.totalCost;

  const addBottleToSelection = (catalogId: string) => {
    const cat = BOTTLE_CATALOG.find((b) => b.id === catalogId);
    if (!cat) return;
    setBottleSelection((cur) => {
      if (cur.some((s) => s.id === cat.id)) return cur;
      // Default qty ≈ enough to cover what's still missing for the category.
      const cov = selectionSummary.byCategory.find(
        (c) => c.category === cat.category,
      );
      const missing = Math.max(0, (cov?.needed ?? 0) - (cov?.provided ?? 0));
      const qty = Math.max(1, Math.ceil(missing / Math.max(1, cat.servings)));
      return [...cur, { ...cat, qty }];
    });
  };

  const addCustomBottle = (category: DrinkCategory) => {
    setBottleSelection((cur) => [
      ...cur,
      {
        id: `custom-${category}-${Date.now()}`,
        category,
        name: "בקבוק מותאם",
        price: 0,
        servings: 1,
        unit: "יחידה",
        qty: 1,
      },
    ]);
  };

  const updateBottle = (id: string, patch: Partial<SelectedBottle>) =>
    setBottleSelection((cur) =>
      cur.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );

  const removeBottle = (id: string) =>
    setBottleSelection((cur) => cur.filter((s) => s.id !== id));

  const resetToConfirmed = () => {
    setAdultHeads(confirmedAdultHeads);
    setTotalHeads(confirmedTotalHeads);
  };

  const resetAdvanced = () => {
    setManualDrinksPerHour(false);
    setManualShares(false);
    setDrinksPerHour(PROFILE_DRINKS_PER_HOUR[profile]);
    setShares(BAR_STYLE_SHARES[barStyle]);
    setServings({ ...DEFAULT_SERVINGS });
    setPrices({ ...DEFAULT_UNIT_PRICES });
  };

  if (!hydrated) return null;

  if (!event) {
    return (
      <div className="text-center p-8" style={{ color: "var(--foreground-soft)" }}>
        הוסף אירוע כדי להשתמש במחשבון
      </div>
    );
  }

  return (
    <div>
      <div className="mt-7">
        <span className="eyebrow">תכנון בר</span>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
          מחשבון אלכוהול
        </h1>
        <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>
          כמה יין, בירה ואלכוהול חזק לקנות לאירוע. כל מספר ניתן לעריכה — הספירה ב-RSVP מזינה אוטומטית.
        </p>
      </div>

      {/* Inputs */}
      <section className="mt-8 grid lg:grid-cols-3 gap-4">
        {/* Heads + hours */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-bold text-sm">מספר אורחים ושעות</h2>
            {confirmedTotalHeads > 0 && (
              <button
                onClick={resetToConfirmed}
                className="text-xs inline-flex items-center gap-1 rounded-full px-3 py-1.5"
                style={{ border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
                title="חזור לערכים מ-RSVP"
              >
                <RefreshCw size={12} /> מ-RSVP
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <NumberField
              label="סה״כ אורחים"
              hint={confirmedTotalHeads > 0 ? `מאושרים: ${confirmedTotalHeads}` : "כולל ילדים"}
              icon={<Users size={14} />}
              value={totalHeads}
              onChange={setTotalHeads}
            />
            <NumberField
              label="מתוכם בוגרים"
              hint={confirmedAdultHeads > 0 ? `מאושרים: ${confirmedAdultHeads}` : "מעל גיל 18"}
              icon={<Users size={14} />}
              value={adultHeads}
              onChange={(v) => setAdultHeads(Math.min(v, totalHeads))}
            />
            <NumberField
              label="משך האירוע"
              hint="שעות"
              icon={<Clock size={14} />}
              value={hours}
              onChange={(v) => setHours(Math.max(1, v))}
              min={1}
              max={24}
            />
          </div>
        </div>

        {/* Profile */}
        <div className="card p-5">
          <h2 className="font-bold text-sm mb-3">סגנון שתייה</h2>
          <div className="space-y-2">
            {(Object.keys(PROFILE_LABELS) as DrinkingProfile[]).map((p) => {
              const active = profile === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProfile(p)}
                  aria-pressed={active}
                  className="w-full text-start rounded-2xl px-4 py-3 transition"
                  style={{
                    background: active ? "rgba(212,176,104,0.12)" : "var(--input-bg)",
                    border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                    color: active ? "var(--foreground)" : "var(--foreground-soft)",
                  }}
                >
                  <div className="font-bold text-sm flex items-center justify-between">
                    <span>
                      {PROFILE_LABELS[p]}
                      {active && <span className="ms-2 text-[--accent]" aria-hidden>✓</span>}
                    </span>
                    <span className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
                      {PROFILE_DRINKS_PER_HOUR[p]} משק׳/שעה
                    </span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>
                    {PROFILE_DESCRIPTIONS[p]}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bar style */}
        <div className="card p-5 lg:col-span-3">
          <h2 className="font-bold text-sm mb-3">סוג הבר</h2>
          <div className="grid sm:grid-cols-3 gap-2">
            {(Object.keys(BAR_STYLE_LABELS) as BarStyle[]).map((b) => {
              const active = barStyle === b;
              const s = BAR_STYLE_SHARES[b];
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBarStyle(b)}
                  aria-pressed={active}
                  className="rounded-2xl px-4 py-3 text-start transition"
                  style={{
                    background: active ? "rgba(212,176,104,0.12)" : "var(--input-bg)",
                    border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                    color: active ? "var(--foreground)" : "var(--foreground-soft)",
                  }}
                >
                  <div className="font-bold text-sm">
                    {BAR_STYLE_LABELS[b]}
                    {active && <span className="ms-2 text-[--accent]" aria-hidden>✓</span>}
                  </div>
                  <div className="text-[11px] mt-1 ltr-num" style={{ color: "var(--foreground-muted)" }}>
                    {Math.round(s.wine * 100)}% יין · {Math.round(s.beer * 100)}% בירה · {Math.round(s.spirits * 100)}% חזק · {Math.round(s.soft * 100)}% קל
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Advanced mode toggle */}
      <button
        onClick={() => setAdvanced((v) => !v)}
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold"
        style={{ color: "var(--foreground-soft)" }}
        aria-expanded={advanced}
      >
        <Settings size={14} />
        עריכה מתקדמת
        <ChevronDown
          size={14}
          className="transition"
          style={{ transform: advanced ? "rotate(180deg)" : undefined }}
        />
      </button>

      {advanced && (
        <section className="mt-3 card p-5 space-y-6">
          {/* Drinks per hour */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-sm font-semibold">משקאות לבוגר לשעה</label>
              {manualDrinksPerHour && (
                <button
                  onClick={() => {
                    setManualDrinksPerHour(false);
                    setDrinksPerHour(PROFILE_DRINKS_PER_HOUR[profile]);
                  }}
                  className="text-xs inline-flex items-center gap-1"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  <RefreshCw size={11} /> סנכרן ל-{PROFILE_LABELS[profile]}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={drinksPerHour}
                onChange={(e) => {
                  setManualDrinksPerHour(true);
                  setDrinksPerHour(Number(e.target.value));
                }}
                className="flex-1 ltr-num"
              />
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={5}
                step={0.1}
                value={drinksPerHour}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isNaN(n) || n < 0) return;
                  setManualDrinksPerHour(true);
                  setDrinksPerHour(n);
                }}
                className="input !py-1.5 !px-2 w-20 text-center ltr-num"
              />
            </div>
            <div className="text-xs mt-1.5" style={{ color: "var(--foreground-muted)" }}>
              סה״כ צפי: {Math.round(adultHeads * hours * drinksPerHour)} משקאות לאירוע
            </div>
          </div>

          {/* Category shares */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-sm font-semibold">חלוקת המשקאות לקטגוריות</label>
              {manualShares && (
                <button
                  onClick={() => {
                    setManualShares(false);
                    setShares(BAR_STYLE_SHARES[barStyle]);
                  }}
                  className="text-xs inline-flex items-center gap-1"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  <RefreshCw size={11} /> סנכרן לפריסט
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <SharePctField
                label="יין" icon={<Wine size={14} />}
                value={shares.wine}
                onChange={(v) => { setManualShares(true); setShares((s) => ({ ...s, wine: v })); }}
              />
              <SharePctField
                label="בירה" icon={<Beer size={14} />}
                value={shares.beer}
                onChange={(v) => { setManualShares(true); setShares((s) => ({ ...s, beer: v })); }}
              />
              <SharePctField
                label="אלכוהול חזק" icon={<Sparkles size={14} />}
                value={shares.spirits}
                onChange={(v) => { setManualShares(true); setShares((s) => ({ ...s, spirits: v })); }}
              />
              <SharePctField
                label="משקאות קלים" icon={<GlassWater size={14} />}
                value={shares.soft}
                onChange={(v) => { setManualShares(true); setShares((s) => ({ ...s, soft: v })); }}
              />
            </div>
            <div
              className="text-xs mt-2 ltr-num"
              style={{ color: Math.abs(sharesSum - 1) < 0.02 ? "var(--foreground-muted)" : "rgb(252 165 165)" }}
            >
              סה״כ: {Math.round(sharesSum * 100)}%
              {Math.abs(sharesSum - 1) >= 0.02 && " (לא מסתכם ל-100%)"}
            </div>
          </div>

          {/* Servings per container */}
          <div>
            <label className="block text-sm font-semibold mb-2">מנות בכל מיכל</label>
            <div className="grid sm:grid-cols-3 gap-3">
              <NumberField
                label="כוסות בבקבוק יין"
                icon={<Wine size={12} />}
                value={servings.wine}
                onChange={(v) => setServings((s) => ({ ...s, wine: Math.max(1, v) }))}
                min={1}
              />
              <NumberField
                label="מנות בבקבוק/פחית בירה"
                hint="1 = פחית בודדת, 4 = בקבוק שיתופי"
                icon={<Beer size={12} />}
                value={servings.beer}
                onChange={(v) => setServings((s) => ({ ...s, beer: Math.max(1, v) }))}
                min={1}
              />
              <NumberField
                label="מנות בבקבוק חזק"
                hint="≈14 פוט-לונג, ≈23 שוט"
                icon={<Sparkles size={12} />}
                value={servings.spirits}
                onChange={(v) => setServings((s) => ({ ...s, spirits: Math.max(1, v) }))}
                min={1}
              />
            </div>
          </div>

          {/* Prices */}
          <div>
            <label className="block text-sm font-semibold mb-2">מחירים ליחידה (₪)</label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <NumberField
                label="בקבוק יין"
                icon={<Wine size={12} />}
                value={prices.wine}
                onChange={(v) => setPrices((p) => ({ ...p, wine: v }))}
                min={0}
              />
              <NumberField
                label="פחית בירה"
                icon={<Beer size={12} />}
                value={prices.beer}
                onChange={(v) => setPrices((p) => ({ ...p, beer: v }))}
                min={0}
              />
              <NumberField
                label="בקבוק חזק"
                icon={<Sparkles size={12} />}
                value={prices.spirits}
                onChange={(v) => setPrices((p) => ({ ...p, spirits: v }))}
                min={0}
              />
              <NumberField
                label="ליטר משקה קל"
                icon={<GlassWater size={12} />}
                value={prices.soft}
                onChange={(v) => setPrices((p) => ({ ...p, soft: v }))}
                min={0}
              />
            </div>
          </div>

          <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={resetAdvanced}
              className="text-xs inline-flex items-center gap-1.5"
              style={{ color: "var(--foreground-muted)" }}
            >
              <RefreshCw size={11} /> אפס הכל לערכי ברירת המחדל
            </button>
          </div>
        </section>
      )}

      {/* Results */}
      <section className="mt-10">
        <div className="mb-4">
          <span className="eyebrow">המלצות</span>
          <h2 className="mt-2 text-2xl font-bold">כמויות לקנייה</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <ResultCard
            icon={<Wine size={20} />} label="יין"
            primary={`${result.wine.bottles} בקבוקים`}
            secondary={`${result.wine.glasses} כוסות`}
            cost={result.wine.cost}
            hidden={shares.wine === 0}
          />
          <ResultCard
            icon={<Beer size={20} />} label="בירה"
            primary={`${result.beer.cans} פחיות`}
            secondary={`כ-${result.beer.sixPacks} שש-פאקים`}
            cost={result.beer.cost}
            hidden={shares.beer === 0}
          />
          <ResultCard
            icon={<Sparkles size={20} />} label="אלכוהול חזק"
            primary={`${result.spirits.bottles} בקבוקים`}
            secondary={`${result.spirits.servings} מנות`}
            cost={result.spirits.cost}
            hidden={shares.spirits === 0}
          />
          <ResultCard
            icon={<GlassWater size={20} />} label="משקאות קלים"
            primary={`${result.soft.liters} ליטר`}
            secondary="קולה / מיץ / מים תוססים"
            cost={result.soft.cost}
            hidden={result.soft.liters === 0}
          />
        </div>

        <div className="mt-5 card-gold p-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>
              {useBottleSelection && bottleSelection.some((b) => b.qty > 0)
                ? "עלות לפי הבקבוקים שבחרת"
                : "עלות משוערת לקנייה"}
            </div>
            <div className="mt-1 text-3xl font-extrabold ltr-num gradient-gold">
              ₪{effectiveTotal.toLocaleString("he-IL")}
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
              {Math.round(result.totalDrinks)} משקאות · {adultHeads} בוגרים · {hours} שעות
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>
              {advanced ? "ערכים מותאמים אישית" : `${PROFILE_LABELS[profile]} · ${BAR_STYLE_LABELS[barStyle].split("(")[0].trim()}`}
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs leading-relaxed" style={{ color: "var(--foreground-muted)" }}>
          💡 ההמלצה מעוגלת כלפי מעלה כדי שלא תיתפסו עם בר ריק. לרוב יישאר עודף קל —
          קנו ב-משווק שמסכים להחזיר בקבוקים סגורים, ככה לא תפסידו על העודפים.
        </p>
      </section>

      {/* R23 — specific bottle selection (catalog + custom + manual edit) */}
      <section className="mt-8">
        <button
          onClick={() => setBottlesOpen((v) => !v)}
          className="w-full card p-4 flex items-center justify-between gap-3 text-start"
          aria-expanded={bottlesOpen}
        >
          <div>
            <div className="font-bold text-sm">🍾 בחירת בקבוקים לפי חברה</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>
              בחר מותגים ספציפיים (גולדסטאר, אבסולוט, ברקן…), ערוך כמות ומחיר
              ידנית — ותראה כיסוי מול הצורך.
            </div>
          </div>
          <ChevronDown
            size={18}
            style={{ transform: bottlesOpen ? "rotate(180deg)" : undefined, transition: "transform 200ms" }}
          />
        </button>

        {bottlesOpen && (
          <div className="mt-3 space-y-4">
            <label
              className="card p-4 flex items-center justify-between gap-3 cursor-pointer"
            >
              <div>
                <div className="text-sm font-semibold">
                  השתמש בבחירה הספציפית לחישוב העלות
                </div>
                <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                  כשמסומן — סך העלות למעלה מתעדכן לפי הבקבוקים שבחרת.
                </div>
              </div>
              <input
                type="checkbox"
                checked={useBottleSelection}
                onChange={(e) => setUseBottleSelection(e.target.checked)}
                className="w-5 h-5 shrink-0"
                style={{ accentColor: "var(--accent)" }}
              />
            </label>

            {(["wine", "beer", "spirits", "soft"] as DrinkCategory[])
              .filter((cat) => (needByCategory[cat] || 0) > 0)
              .map((cat) => {
                const cov = selectionSummary.byCategory.find(
                  (c) => c.category === cat,
                )!;
                const lines = bottleSelection.filter(
                  (s) => s.category === cat,
                );
                const pct =
                  cov.needed > 0
                    ? Math.min(100, Math.round((cov.provided / cov.needed) * 100))
                    : 0;
                return (
                  <div key={cat} className="card p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="font-bold text-sm">
                        {DRINK_CATEGORY_LABELS[cat]}
                      </h3>
                      <span
                        className="text-xs ltr-num inline-flex items-center gap-1"
                        style={{
                          color: cov.covered
                            ? "rgb(110,231,183)"
                            : "var(--foreground-muted)",
                        }}
                      >
                        {cov.covered && <Check size={12} />}
                        {cov.provided}/{cov.needed} מנות
                      </span>
                    </div>
                    {/* coverage bar */}
                    <div
                      className="h-2 rounded-full overflow-hidden mb-3"
                      style={{ background: "var(--input-bg)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: cov.covered
                            ? "linear-gradient(90deg,#34D399,#10B981)"
                            : "linear-gradient(90deg,#F4DEA9,#A8884A)",
                        }}
                      />
                    </div>

                    {/* selected lines */}
                    {lines.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {lines.map((s) => (
                          <div
                            key={s.id}
                            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs rounded-xl p-2"
                            style={{ background: "var(--input-bg)" }}
                          >
                            <input
                              value={s.name}
                              onChange={(e) =>
                                updateBottle(s.id, { name: e.target.value })
                              }
                              className="bg-transparent outline-none min-w-0 truncate"
                              style={{ color: "var(--foreground)" }}
                              aria-label="שם הבקבוק"
                            />
                            <NumberMini
                              label="₪"
                              value={s.price}
                              onChange={(v) => updateBottle(s.id, { price: v })}
                            />
                            <NumberMini
                              label="מנות"
                              value={s.servings}
                              onChange={(v) =>
                                updateBottle(s.id, { servings: v })
                              }
                            />
                            <div className="flex items-center gap-1">
                              <NumberMini
                                label="×"
                                value={s.qty}
                                onChange={(v) => updateBottle(s.id, { qty: v })}
                              />
                              <button
                                onClick={() => removeBottle(s.id)}
                                aria-label="הסר"
                                className="p-1.5 rounded-lg hover:bg-white/5"
                                style={{ color: "rgb(248,113,113)" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* catalog picker — grouped by brand/company */}
                    <div className="space-y-2.5">
                      <div className="text-[11px]" style={{ color: "var(--foreground-muted)" }}>
                        בחר לפי חברה:
                      </div>
                      {catalogByBrand(cat).map((group) => {
                        const avail = group.bottles.filter(
                          (b) => !bottleSelection.some((s) => s.id === b.id),
                        );
                        if (avail.length === 0) return null;
                        return (
                          <div key={group.brand}>
                            <div
                              className="text-[11px] font-bold mb-1"
                              style={{ color: "var(--foreground-soft)" }}
                            >
                              {group.brand}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {avail.map((b) => (
                                <button
                                  key={b.id}
                                  onClick={() => addBottleToSelection(b.id)}
                                  className="text-[11px] px-2.5 py-1.5 rounded-full inline-flex items-center gap-1 transition hover:translate-y-[-1px]"
                                  style={{
                                    background: "var(--surface-2)",
                                    border: "1px solid var(--border)",
                                    color: "var(--foreground-soft)",
                                  }}
                                  title={`${b.name} · ${b.unit}`}
                                >
                                  <Plus size={11} />
                                  {b.name} · ₪{b.price}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      <button
                        onClick={() => addCustomBottle(cat)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full inline-flex items-center gap-1"
                        style={{
                          background: "rgba(212,176,104,0.12)",
                          border: "1px solid var(--border-gold)",
                          color: "var(--accent)",
                        }}
                      >
                        <Plus size={11} /> בקבוק / חברה משלי
                      </button>
                    </div>

                    {cov.cost > 0 && (
                      <div
                        className="mt-3 text-xs text-end ltr-num"
                        style={{ color: "var(--foreground-soft)" }}
                      >
                        סה״כ {DRINK_CATEGORY_LABELS[cat]}: ₪
                        {cov.cost.toLocaleString("he-IL")}
                      </div>
                    )}
                  </div>
                );
              })}

            {bottleSelection.some((b) => b.qty > 0) && (
              <div className="card-gold p-5 flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--foreground-soft)" }}>
                  סך הבקבוקים שבחרת
                </span>
                <span className="text-2xl font-extrabold ltr-num gradient-gold">
                  ₪{selectionSummary.totalCost.toLocaleString("he-IL")}
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Compact inline numeric editor used inside the bottle rows. */
function NumberMini({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <span style={{ color: "var(--foreground-muted)" }}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n) || n < 0) return;
          onChange(n);
        }}
        className="w-12 bg-transparent text-center outline-none ltr-num rounded"
        style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}
      />
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents

function NumberField({
  label,
  hint,
  icon,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs flex items-center gap-1" style={{ color: "var(--foreground-soft)" }}>
        {icon}
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n) || n < (min ?? 0)) return;
          if (max !== undefined && n > max) return;
          onChange(n);
        }}
        className="input mt-1.5 w-full ltr-num"
      />
      {hint && (
        <span className="text-[11px] mt-1 block" style={{ color: "var(--foreground-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function SharePctField({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
}) {
  // Slider uses 0-100; the underlying value is 0..1.
  const pct = Math.round(value * 100);
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="flex items-center gap-1" style={{ color: "var(--foreground-soft)" }}>
          {icon} {label}
        </span>
        <span className="ltr-num font-bold text-[--accent]">{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full"
      />
    </div>
  );
}

function ResultCard({
  icon,
  label,
  primary,
  secondary,
  cost,
  hidden,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  cost: number;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-[--accent]"
          style={{ background: "rgba(212,176,104,0.1)", border: "1px solid var(--border-gold)" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
            {label}
          </div>
          <div className="font-bold text-lg ltr-num">{primary}</div>
        </div>
      </div>
      {secondary && (
        <div className="mt-3 text-xs" style={{ color: "var(--foreground-soft)" }}>
          {secondary}
        </div>
      )}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
          עלות
        </div>
        <div className="ltr-num font-bold gradient-gold">
          ₪{cost.toLocaleString("he-IL")}
        </div>
      </div>
    </div>
  );
}
