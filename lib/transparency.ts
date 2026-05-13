import { getSupabase } from "./supabase";

/**
 * Cost Transparency Network — client helpers (R20 Phase 7).
 *
 * Reads the `vendor_cost_stats` view (categories with sample_size >= 3).
 * No writes happen here — submitting a report is a Phase 8 concern.
 */

export interface CostBenchmark {
  category: string;
  region: string;
  guestBand: string;
  sampleSize: number;
  avgAmount: number;
  medianAmount: number;
  p25Amount: number;
  p75Amount: number;
  avgSatisfaction: number;
}

interface StatsRow {
  category: string;
  region: string;
  guest_count_band: string;
  sample_size: number;
  avg_amount: number;
  median_amount: number;
  p25_amount: number;
  p75_amount: number;
  avg_satisfaction: number | null;
}

export async function fetchBenchmark(
  category: string,
  region: string,
  guestBand: string,
): Promise<CostBenchmark | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = (await supabase
    .from("vendor_cost_stats")
    .select("*")
    .eq("category", category)
    .eq("region", region)
    .eq("guest_count_band", guestBand)
    .maybeSingle()) as {
    data: StatsRow | null;
    error: { message: string } | null;
  };

  if (error || !data) return null;

  return {
    category: data.category,
    region: data.region,
    guestBand: data.guest_count_band,
    sampleSize: data.sample_size,
    avgAmount: data.avg_amount,
    medianAmount: data.median_amount,
    p25Amount: data.p25_amount,
    p75Amount: data.p75_amount,
    avgSatisfaction: data.avg_satisfaction ?? 0,
  };
}

export interface CategoryStats {
  avg: number;
  median: number;
  p25: number;
  p75: number;
  sample: number;
  satisfaction: number;
}

export async function fetchAllBenchmarks(
  region: string,
  guestBand: string,
): Promise<Record<string, CategoryStats>> {
  const supabase = getSupabase();
  if (!supabase) return {};

  const { data } = (await supabase
    .from("vendor_cost_stats")
    .select("*")
    .eq("region", region)
    .eq("guest_count_band", guestBand)) as { data: StatsRow[] | null };

  const result: Record<string, CategoryStats> = {};
  for (const row of data ?? []) {
    result[row.category] = {
      avg: row.avg_amount,
      median: row.median_amount,
      p25: row.p25_amount,
      p75: row.p75_amount,
      sample: row.sample_size,
      satisfaction: row.avg_satisfaction ?? 0,
    };
  }
  return result;
}

/**
 * Builds a polite Hebrew negotiation message backed by transparency data.
 * The vendor sees a concrete median from real reports, not "I heard it
 * should be cheaper" — usually unlocks a real discussion.
 */
export function buildNegotiationMessage(input: {
  vendorName: string;
  category: string;
  yourPrice: number;
  benchmarkMedian: number;
}): string {
  return `שלום ${input.vendorName}, 👋

אני בתהליך תכנון אירוע ושוקל את שירותיכם.

לפי נתונים שאני רואה ב-Momentum (פלטפורמה לתכנון אירועים), המחיר החציוני באזור שלי ל${input.category} הוא בסביבות ₪${input.benchmarkMedian.toLocaleString("he-IL")}.

המחיר שלכם הוא ₪${input.yourPrice.toLocaleString("he-IL")} — מעט מעל הממוצע.

האם יש מקום להתאמה? אשמח לסגור איתכם אם נמצא נקודה משותפת.

תודה רבה!`;
}
