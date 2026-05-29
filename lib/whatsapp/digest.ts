import type { ChecklistItem } from "@/lib/types";

interface AppStateLike {
  checklist?: ChecklistItem[];
  budget?: { items?: { paid?: boolean; title?: string }[] };
}

/** Build digest body parameters for WHATSAPP_TEMPLATE_DAILY_DIGEST. */
export function buildDailyDigestParams(payload: unknown): string[] {
  const state = payload as AppStateLike;
  const openTasks = (state.checklist ?? []).filter((t) => !t.done).slice(0, 5);
  const taskLines = openTasks.map((t) => `• ${t.title}`).join("\n");
  const openCount = (state.checklist ?? []).filter((t) => !t.done).length;
  const unpaid = (state.budget?.items ?? []).filter((i) => !i.paid).length;

  const summary =
    openCount > 0
      ? `נשארו ${openCount} משימות פתוחות`
      : "אין משימות פתוחות — כל הכבוד!";

  const detail =
    taskLines.length > 0
      ? taskLines
      : unpaid > 0
        ? `ו-${unpaid} פריטי תקציב שטרם שולמו`
        : "המשיכו ליהנות מההכנות";

  return [summary, detail.slice(0, 900)];
}
