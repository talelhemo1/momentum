/**
 * Momentum Live — manager-side intelligence (R20 Phase 3).
 *
 * Pure functions. No React, no Supabase, no DOM. The dashboard feeds an
 * AlertContext snapshot every 30s and gets back an ordered list of
 * SmartAlert objects to render in the AI Co-Pilot panel.
 *
 * The rules are simple, deterministic heuristics — not an LLM. Names
 * "AI Co-Pilot" in the UI because they read like one to the user, and
 * because we may swap them for actual LLM-derived insights later.
 */

// ═════════════════════ Smart Alerts ═════════════════════

export type AlertSeverity = "info" | "warning" | "success" | "critical";

export interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  emoji: string;
  title: string;
  description: string;
  /** Optional one-click action label + the action_type to dispatch into
   *  manager_actions. The dashboard maps actionType → handleVendorAction. */
  actionLabel?: string;
  actionType?: string;
}

export interface AlertTableSnapshot {
  id: string;
  label: string;
  capacity: number;
  /** How many guests at this table have an arrived_at timestamp. */
  arrivedCount: number;
  /** How many guests were seated to this table in the plan. */
  expectedCount: number;
}

export interface AlertContext {
  /** Wall-clock millis when the dashboard opened — proxy for "event start". */
  eventStartedAt: number;
  totalGuests: number;
  arrivedCount: number;
  /** Arrivals timestamped in the last 15 minutes. */
  recentArrivalRate: number;
  tables: AlertTableSnapshot[];
  /** Wall-clock millis when the snapshot was taken. */
  now: number;
}

/**
 * Returns a fresh list of alerts for the current event state. Each call is
 * idempotent for a given context, so the dashboard can simply replace the
 * previous list when polling.
 *
 * Alert IDs are deterministic (`empty-${tableId}`, `overcrowded-${tableId}`,
 * etc.) so the dismissed-set lives across re-computations without re-firing
 * the same alert after the user clicked X.
 */
export function generateSmartAlerts(ctx: AlertContext): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const minutesSinceStart = (ctx.now - ctx.eventStartedAt) / 60_000;
  const arrivalPercent =
    ctx.totalGuests > 0 ? (ctx.arrivedCount / ctx.totalGuests) * 100 : 0;

  // 1. Majority arrived — nudge toward starting the ceremony / meal.
  if (arrivalPercent >= 80 && arrivalPercent < 95 && minutesSinceStart > 30) {
    alerts.push({
      id: "majority-arrived",
      severity: "success",
      emoji: "🎉",
      title: "רוב הקהל הגיע!",
      description: `${Math.round(arrivalPercent)}% מהאורחים אצלכם — זה הזמן להתחיל את הטקס/ארוחה.`,
      actionLabel: "MC — הכרזה",
      actionType: "mc-announce",
    });
  }

  // 2. Overcrowded tables — happens with unplanned plus-ones at the door.
  for (const t of ctx.tables) {
    if (t.arrivedCount > t.capacity) {
      alerts.push({
        id: `overcrowded-${t.id}`,
        severity: "warning",
        emoji: "🪑",
        title: `${t.label} עמוס מדי`,
        description: `${t.arrivedCount} אורחים בשולחן עם קיבולת ${t.capacity}. מוסיפים כיסא נוסף?`,
      });
    }
  }

  // 3. Table with expected guests but none showed — manager should check why.
  if (minutesSinceStart > 60) {
    for (const t of ctx.tables) {
      if (t.expectedCount > 0 && t.arrivedCount === 0) {
        alerts.push({
          id: `empty-${t.id}`,
          severity: "warning",
          emoji: "🚪",
          title: `${t.label} עדיין ריק`,
          description: `${t.expectedCount} אורחים צפויים ולא הגיעו אחרי שעה. שולחים תזכורת?`,
        });
      }
    }
  }

  // 4. Arrival pace dying off — most of the room is here, time to roll.
  if (
    minutesSinceStart > 45 &&
    ctx.recentArrivalRate === 0 &&
    arrivalPercent > 60
  ) {
    alerts.push({
      id: "arrival-slowing",
      severity: "info",
      emoji: "📊",
      title: "קצב ההגעה דועך",
      description: `אין הגעות חדשות ב-15 דק׳ האחרונות. ${ctx.totalGuests - ctx.arrivedCount} עדיין לא הגיעו. אולי כדאי להתקדם.`,
    });
  }

  // 5. Hora window — Israeli weddings peak energy at ~90 min in.
  if (minutesSinceStart > 90 && minutesSinceStart < 120) {
    alerts.push({
      id: "time-for-hora",
      severity: "info",
      emoji: "💃",
      title: "זה הזמן ל'הורה'",
      description:
        "כבר 90 דק׳ מתחילת האירוע — קצב הריקודים תמיד מתלהב אחרי שלב הזה. הצלם והDJ מוכנים?",
      actionLabel: "DJ — העלה את הקצב",
      actionType: "dj-up",
    });
  }

  // 6. Cake-cutting reminder.
  if (minutesSinceStart > 150) {
    alerts.push({
      id: "time-for-cake",
      severity: "info",
      emoji: "🎂",
      title: "זמן עוגה?",
      description:
        "כבר 2.5 שעות מהתחלה — חיתוך עוגה זה אחד הרגעים שאורחים מחכים אליו.",
    });
  }

  // Cheerful fallback so the panel never looks broken when the event
  // is in a quiet, well-running stretch.
  if (alerts.length === 0 && arrivalPercent > 30) {
    alerts.push({
      id: "all-good",
      severity: "success",
      emoji: "✨",
      title: "האירוע זורם מצוין!",
      description: "אין מה לטפל ברגע זה. תהנה.",
    });
  }

  return alerts;
}

// ═════════════════════ Guest Pass URL ═════════════════════

/**
 * Build a public URL for the guest "welcome" page (table number, event
 * details). Sent to the guest via WhatsApp once they check in at the door.
 * The origin is trimmed of trailing slashes so concatenation is safe.
 */
export function buildGuestPassUrl(origin: string, eventId: string, guestId: string): string {
  const o = origin.replace(/\/+$/, "");
  return `${o}/pass/${encodeURIComponent(eventId)}/${encodeURIComponent(guestId)}`;
}
