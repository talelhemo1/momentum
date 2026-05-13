import type { EventReceipt, PaymentScheduleItem } from "./types";

/**
 * Wedding CFO — cashflow forecast + anomaly detection (R20 Phase 7).
 *
 * Pure functions. The page polls Supabase for the receipts + schedule and
 * runs both through these helpers on every render — both are cheap.
 */

export interface CashflowMonth {
  /** Sort key: 'YYYY-MM'. */
  month: string;
  /** Human label: 'מאי 2026'. */
  monthLabel: string;
  /** Sum of unpaid amounts due this month, in NIS. */
  outflows: number;
  /** Running total starting at month 0. */
  cumulative: number;
  items: Array<{ vendor: string; amount: number; due_date: string }>;
}

export function buildCashflowForecast(
  receipts: EventReceipt[],
  schedule: PaymentScheduleItem[],
): CashflowMonth[] {
  const months = new Map<string, CashflowMonth>();
  const receiptById = new Map(receipts.map((r) => [r.id, r]));

  for (const item of schedule) {
    if (item.paid_at) continue;
    const date = new Date(item.due_date);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = date.toLocaleDateString("he-IL", {
      year: "numeric",
      month: "long",
    });

    let bucket = months.get(key);
    if (!bucket) {
      bucket = { month: key, monthLabel, outflows: 0, cumulative: 0, items: [] };
      months.set(key, bucket);
    }
    const receipt = receiptById.get(item.receipt_id);
    const outstanding = (item.amount - (item.paid_amount ?? 0)) / 100;
    bucket.outflows += outstanding;
    bucket.items.push({
      vendor: receipt?.vendor_name ?? "ספק לא ידוע",
      amount: outstanding,
      due_date: item.due_date,
    });
  }

  const sorted = Array.from(months.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  let cum = 0;
  for (const m of sorted) {
    cum += m.outflows;
    m.cumulative = cum;
  }
  return sorted;
}

export type AnomalySeverity = "high" | "medium" | "low";

export interface AnomalyDetection {
  receiptId: string;
  vendorName: string;
  category: string;
  yourAmount: number;
  benchmarkAvg: number;
  percentAboveAvg: number;
  severity: AnomalySeverity;
  suggestion: string;
}

export interface CategoryBenchmark {
  avg: number;
  median: number;
  sample: number;
}

/**
 * Compares each receipt against the matching category benchmark and flags
 * anything 15%+ above the benchmark average. Categories with fewer than 5
 * data points are skipped (sample too small to draw a conclusion from).
 */
export function detectAnomalies(
  receipts: EventReceipt[],
  benchmarks: Record<string, CategoryBenchmark>,
): AnomalyDetection[] {
  const anomalies: AnomalyDetection[] = [];
  for (const r of receipts) {
    if (!r.category || !r.total_amount) continue;
    const benchmark = benchmarks[r.category];
    if (!benchmark || benchmark.sample < 5) continue;

    const yours = r.total_amount / 100;
    const percent = ((yours - benchmark.avg) / benchmark.avg) * 100;
    if (percent < 15) continue;

    const severity: AnomalySeverity =
      percent > 40 ? "high" : percent > 25 ? "medium" : "low";
    anomalies.push({
      receiptId: r.id,
      vendorName: r.vendor_name ?? "ספק",
      category: r.category,
      yourAmount: yours,
      benchmarkAvg: benchmark.avg,
      percentAboveAvg: Math.round(percent),
      severity,
      suggestion:
        percent > 40
          ? `המחיר חריג מאוד. שווה לבדוק 2-3 הצעות חלופיות לפני שמתחייב.`
          : percent > 25
            ? `מעט מעל הממוצע. שווה לבקש הנחה — יש מקום למשא ומתן.`
            : `קצת מעל הממוצע — סביר עדיין.`,
    });
  }
  return anomalies.sort((a, b) => b.percentAboveAvg - a.percentAboveAvg);
}
