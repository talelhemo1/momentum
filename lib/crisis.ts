/**
 * R27 — Momentum Live Phase 3: automatic crisis detection.
 *
 * Pure. The crisis control room feeds a snapshot in and renders the
 * `Crisis[]` it gets back. Deterministic ids so a "resolved" dismissal
 * (kept in a Set by the page) never re-fires for the same situation.
 */

export type CrisisSeverity = "warning" | "critical";

export interface CrisisVendor {
  id: string;
  name: string;
  phone?: string;
  /** "HH:MM" the vendor was due on-site, if known. */
  expectedArrival?: string;
  arrived?: boolean;
  /** A deposit/advance is owed and not yet marked paid. */
  paymentDue?: boolean;
}

export interface CrisisContext {
  /** Minutes from "now" until the event start (negative once started). */
  minutesToEvent: number;
  totalGuests: number;
  arrivedGuests: number;
  /** "HH:MM" string for the message wording. */
  nowLabel: string;
  vendors: CrisisVendor[];
}

export interface Crisis {
  id: string;
  severity: CrisisSeverity;
  title: string;
  description: string;
  /** Vendor to contact, when the crisis is vendor-scoped. */
  vendorName?: string;
  vendorPhone?: string;
}

/** Parse "HH:MM" → minutes-since-midnight (or null). */
function hhmmToMinutes(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function detectCrises(ctx: CrisisContext): Crisis[] {
  const out: Crisis[] = [];

  // Minutes-since-midnight "now", derived from nowLabel for vendor-late math.
  const nowMin = hhmmToMinutes(ctx.nowLabel);

  // 1) vendor_late — expected on-site 15+ min ago, not arrived.
  for (const v of ctx.vendors) {
    if (v.arrived) continue;
    const due = hhmmToMinutes(v.expectedArrival);
    if (due == null || nowMin == null) continue;
    const lateBy = nowMin - due;
    if (lateBy >= 15) {
      out.push({
        id: `vendor-late-${v.id}`,
        severity: lateBy >= 40 ? "critical" : "warning",
        title: `${v.name} עוד לא הגיע`,
        description: `${v.name} אמור היה להגיע ב-${v.expectedArrival}, השעה עכשיו ${ctx.nowLabel} — איחור של ${lateBy} דקות.`,
        vendorName: v.name,
        vendorPhone: v.phone,
      });
    }
  }

  // 2) low_arrival_30min_before — <40% arrived with ≤30 min to start.
  if (
    ctx.minutesToEvent <= 30 &&
    ctx.minutesToEvent >= -120 &&
    ctx.totalGuests > 0
  ) {
    const rate = ctx.arrivedGuests / ctx.totalGuests;
    if (rate < 0.4) {
      out.push({
        id: "low-arrival",
        severity: "warning",
        title: "הגעה איטית מהצפוי",
        description: `רק ${Math.round(rate * 100)}% מהמוזמנים הגיעו ונותרו ~${Math.max(0, ctx.minutesToEvent)} דקות לפתיחה. שווה לעדכן את הקייטרינג על עיכוב אפשרי.`,
      });
    }
  }

  // 3) payment_unconfirmed — advance owed, not marked paid.
  for (const v of ctx.vendors) {
    if (!v.paymentDue) continue;
    out.push({
      id: `payment-${v.id}`,
      severity: "warning",
      title: `מקדמה לא מאושרת — ${v.name}`,
      description: `לא סומן שהמקדמה ל-${v.name} שולמה. ודא תשלום לפני תחילת השירות כדי למנוע עיכוב.`,
      vendorName: v.name,
      vendorPhone: v.phone,
    });
  }

  // critical first, then warnings; stable within group.
  return out.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
  );
}
