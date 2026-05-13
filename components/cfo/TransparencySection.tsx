"use client";

import { useEffect, useState } from "react";
import { fetchAllBenchmarks, type CategoryStats } from "@/lib/transparency";
import { BarChart3, MapPin, Users, Loader2 } from "lucide-react";

/**
 * Cost Transparency Network — tab content (R20 Phase 7).
 *
 * Reads aggregated stats from the `vendor_cost_stats` view filtered by
 * (region, guest_count_band). Categories with <3 reports are hidden by
 * the view itself, so an empty result here means "no data yet" — not a
 * silent failure.
 */

const REGIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "tel-aviv", label: "תל אביב והמרכז" },
  { id: "jerusalem", label: "ירושלים" },
  { id: "north", label: "צפון" },
  { id: "south", label: "דרום" },
  { id: "shfela", label: "שפלה" },
];

const GUEST_BANDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "<100", label: "עד 100 אורחים" },
  { id: "100-200", label: "100-200" },
  { id: "200-300", label: "200-300" },
  { id: "300-500", label: "300-500" },
  { id: "500+", label: "500+" },
];

const CATEGORY_LABELS: Record<string, string> = {
  venue: "אולם / גן אירועים",
  catering: "קייטרינג",
  photography: "צילום סטילס",
  videography: "וידאו",
  "music-dj": "DJ / להקה",
  rabbi: "רב",
  "makeup-hair": "איפור ושיער",
  bridal: "שמלת כלה",
  florist: "פרחים",
};

export function TransparencySection() {
  const [region, setRegion] = useState("tel-aviv");
  const [guestBand, setGuestBand] = useState("100-200");
  const [benchmarks, setBenchmarks] = useState<Record<string, CategoryStats>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Documented "fetch-on-deps-change" pattern. Switching region / band
    // re-runs the query, so setLoading + setBenchmarks both fire from
    // inside the effect intentionally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetchAllBenchmarks(region, guestBand).then((data) => {
      if (cancelled) return;
      setBenchmarks(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [region, guestBand]);

  return (
    <div className="space-y-6">
      <section className="card-gold p-7 text-center">
        <BarChart3 size={32} className="mx-auto text-[--accent]" aria-hidden />
        <h2 className="mt-3 text-2xl font-bold gradient-gold">
          השוואת מחירים — נתונים אמיתיים
        </h2>
        <p
          className="mt-2 text-sm max-w-md mx-auto"
          style={{ color: "var(--foreground-soft)" }}
        >
          לפי דיווחי זוגות אנונימיים שעשו אירוע דרך Momentum. הנתונים מתעדכנים
          שבועית.
        </p>
      </section>

      <section className="card p-5">
        <h3 className="font-bold mb-4 text-sm">בחר את הקונטקסט שלך</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label
              className="text-xs flex items-center gap-1.5 mb-2"
              style={{ color: "var(--foreground-soft)" }}
            >
              <MapPin size={12} aria-hidden /> אזור
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="input"
            >
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-xs flex items-center gap-1.5 mb-2"
              style={{ color: "var(--foreground-soft)" }}
            >
              <Users size={12} aria-hidden /> כמות אורחים
            </label>
            <select
              value={guestBand}
              onChange={(e) => setGuestBand(e.target.value)}
              className="input"
            >
              {GUEST_BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="animate-spin mx-auto text-[--accent]" aria-hidden />
        </div>
      ) : Object.keys(benchmarks).length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: "var(--foreground-soft)" }}>
            עדיין אין מספיק נתונים בקונטקסט הזה (פחות מ-3 דיווחים).
            <br />
            ככל שיותר זוגות ידווחו אחרי האירוע — הנתונים יהיו מדויקים יותר.
          </p>
        </div>
      ) : (
        <section>
          <h3 className="font-bold mb-3">מחירים ממוצעים בקטגוריות</h3>
          <div className="grid gap-3">
            {Object.entries(benchmarks).map(([category, data]) => (
              <BenchmarkCard
                key={category}
                label={CATEGORY_LABELS[category] ?? category}
                data={data}
              />
            ))}
          </div>
        </section>
      )}

      <section
        className="card p-5 text-center"
        style={{ borderColor: "var(--border-gold)" }}
      >
        <h3 className="font-bold">עזור לרשת — דווח את המחירים שלך</h3>
        <p className="mt-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
          אחרי האירוע נשלח לך טופס מקוצר. כמה דקות = שינוי שכל זוג בישראל יוכל
          לקבל מחיר הוגן.
        </p>
      </section>
    </div>
  );
}

function BenchmarkCard({ label, data }: { label: string; data: CategoryStats }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-bold">{label}</div>
          <div
            className="text-xs mt-0.5 ltr-num"
            style={{ color: "var(--foreground-muted)" }}
          >
            {data.sample} דיווחים
          </div>
        </div>
        <div className="text-end">
          <div className="text-2xl font-extrabold ltr-num gradient-gold">
            ₪{data.median.toLocaleString("he-IL")}
          </div>
          <div className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
            חציון
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="p-2 rounded-lg bg-emerald-400/10">
          <div className="font-semibold ltr-num text-emerald-400">
            ₪{data.p25.toLocaleString("he-IL")}
          </div>
          <div
            className="text-[10px] mt-0.5"
            style={{ color: "var(--foreground-muted)" }}
          >
            זול
          </div>
        </div>
        <div className="p-2 rounded-lg bg-amber-400/10">
          <div className="font-semibold ltr-num text-amber-400">
            ₪{data.avg.toLocaleString("he-IL")}
          </div>
          <div
            className="text-[10px] mt-0.5"
            style={{ color: "var(--foreground-muted)" }}
          >
            ממוצע
          </div>
        </div>
        <div className="p-2 rounded-lg bg-red-400/10">
          <div className="font-semibold ltr-num text-red-400">
            ₪{data.p75.toLocaleString("he-IL")}
          </div>
          <div
            className="text-[10px] mt-0.5"
            style={{ color: "var(--foreground-muted)" }}
          >
            יקר
          </div>
        </div>
      </div>
    </div>
  );
}
