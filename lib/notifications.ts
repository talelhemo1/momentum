/**
 * Notification scheduling — wraps every reminder/notification with Israeli
 * calendar awareness. Caller passes an "ideal" send time; we shift it forward
 * to the next allowed moment based on the user's `observanceLevel`.
 *
 * Persistence: scheduled notifications are appended to localStorage under
 * `momentum.notifications.queue.v1` so a future Service Worker / native bridge
 * can pick them up. Today the function is mostly a planner + audit log; the
 * actual delivery layer is intentionally pluggable (browser Notification API
 * for in-session, but the queue is the source of truth).
 */

import {
  blockedReasons,
  formatScheduledTime,
  nextValidNotificationTime,
  type ObservanceLevel,
} from "./israeliCalendar";
import { userActions } from "./user";

const QUEUE_KEY = "momentum.notifications.queue.v1";
const MAX_QUEUE = 200;

export interface ScheduledNotification {
  /** Stable id so callers can update / cancel by reference. */
  id: string;
  /** Recipient — the host user id; used to gate by their observance. */
  userId: string;
  /** Hebrew message that ends up in the OS notification body. */
  message: string;
  /** When the caller WANTED us to send (ISO). */
  idealAt: string;
  /** When we'll actually send (ISO) — may be later than ideal due to Shabbat etc. */
  scheduledAt: string;
  /** Whether we deferred from the ideal time, and why (for the audit log). */
  delayReason?: string;
  /** Has this been delivered? Updated by the delivery layer (SW/in-session). */
  status: "pending" | "delivered" | "cancelled";
  /** ISO timestamp of when the queue entry was created. */
  createdAt: string;
}

function readQueue(): ScheduledNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduledNotification[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: ScheduledNotification[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // Disk full / private mode — non-fatal. The reminder is best-effort.
  }
}

/** Resolve the active user's observance level. Defaults to "secular" if unknown. */
function getObservance(): ObservanceLevel {
  const u = userActions.getSnapshot();
  return u?.observanceLevel ?? "secular";
}

export interface ScheduleNotificationInput {
  /** Hebrew body. The OS notification title is set automatically. */
  message: string;
  /** When the caller WANTS this to fire. Date or ISO string. */
  idealTime: Date | string;
  /** The host user id this reminder belongs to. */
  userId: string;
  /** Optional override of the user's observance — useful for tests. */
  observance?: ObservanceLevel;
}

/**
 * Schedule a notification, deferring around Shabbat/holidays/mourning periods
 * based on the user's observance level.
 *
 * Returns the persisted queue entry. The function is synchronous and side-
 * effecting only on localStorage; nothing is fired right now even if the
 * scheduledAt is in the past — that's the delivery layer's job.
 */
export function scheduleNotification(input: ScheduleNotificationInput): ScheduledNotification {
  const ideal = input.idealTime instanceof Date ? input.idealTime : new Date(input.idealTime);
  const observance = input.observance ?? getObservance();
  const scheduled = nextValidNotificationTime(ideal, observance);
  const wasDeferred = scheduled.getTime() !== ideal.getTime();
  const reasons = wasDeferred ? blockedReasons(ideal, observance) : [];
  const delayReason = wasDeferred ? reasons.map((r) => r.label).join(" + ") : undefined;

  const entry: ScheduledNotification = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now()}`,
    userId: input.userId,
    message: input.message,
    idealAt: ideal.toISOString(),
    scheduledAt: scheduled.toISOString(),
    delayReason,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  if (wasDeferred) {
    // Telemetry-friendly log so the host can see why a reminder slid.
    // Format chosen to be grep-able in console + preserved in dev tools.
    console.log(
      `🕯️ Reminder delayed due to ${delayReason} — sending ${formatScheduledTime(scheduled)}`,
    );
  }

  const q = readQueue();
  q.push(entry);
  writeQueue(q);

  return entry;
}

/** All pending notifications for a user, sorted by scheduled time ascending. */
export function getPendingNotifications(userId: string): ScheduledNotification[] {
  return readQueue()
    .filter((n) => n.userId === userId && n.status === "pending")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** Mark a queued notification delivered. Idempotent. */
export function markDelivered(id: string) {
  const q = readQueue();
  const idx = q.findIndex((n) => n.id === id);
  if (idx === -1) return;
  q[idx] = { ...q[idx], status: "delivered" };
  writeQueue(q);
}

/** Cancel a queued notification by id. Useful when a checklist item is done. */
export function cancelNotification(id: string) {
  const q = readQueue();
  const idx = q.findIndex((n) => n.id === id);
  if (idx === -1) return;
  q[idx] = { ...q[idx], status: "cancelled" };
  writeQueue(q);
}

/** Clear the entire queue. Used on account deletion. */
export function clearNotificationQueue() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {}
}
