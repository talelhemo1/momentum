/**
 * Notification scheduling — a planner + audit log for future reminders.
 *
 * The actual delivery layer is intentionally pluggable (a future Service
 * Worker / native bridge would consume this queue). Today the module is a
 * persisted record of "we'd like to send X at Y" — calling code can read
 * the queue back via `getPendingNotifications`.
 *
 * Persistence: scheduled notifications are appended to localStorage under
 * `momentum.notifications.queue.v1`.
 */

// R12 §3S — centralized.
import { STORAGE_KEYS } from "./storage-keys";
const QUEUE_KEY = STORAGE_KEYS.notificationsQueue;
const MAX_QUEUE = 200;

export interface ScheduledNotification {
  /** Stable id so callers can update / cancel by reference. */
  id: string;
  /** Recipient — the host user id. */
  userId: string;
  /** Hebrew message that ends up in the OS notification body. */
  message: string;
  /** When the notification should fire (ISO). */
  scheduledAt: string;
  /** Has this been delivered? Updated by the delivery layer (SW/in-session). */
  status: "pending" | "delivered" | "cancelled";
  /** ISO timestamp of when the queue entry was created. */
  createdAt: string;
}

/** Runtime validator — protects against stale schemas in localStorage where
 *  e.g. `status` is missing. A loose `as` cast would silently let a malformed
 *  entry through, then crash later when `n.userId` or `n.status` is undefined. */
function isScheduledNotification(x: unknown): x is ScheduledNotification {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.userId === "string" &&
    typeof o.message === "string" &&
    typeof o.scheduledAt === "string" &&
    typeof o.createdAt === "string" &&
    (o.status === "pending" || o.status === "delivered" || o.status === "cancelled")
  );
}

function readQueue(): ScheduledNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter(isScheduledNotification);
    if (parsed.length > 0 && filtered.length < parsed.length / 2) {
      // Major schema mismatch — overwrite once so we stop paying the filter
      // cost on every read. This also self-heals an old version's leftovers.
      console.warn(
        `[momentum/notifications] dropped ${parsed.length - filtered.length}/${parsed.length} malformed entries; rewriting queue.`,
      );
      writeQueue(filtered);
    }
    return filtered;
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

/**
 * Generate a unique notification id. Two reminders scheduled in the same
 * millisecond (e.g. "30h before AND 6h before" enqueued together in a loop)
 * used to share `n-${Date.now()}` and collide; markDelivered would only
 * mark one. Each id now carries a random suffix.
 */
function makeNotificationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Prefer crypto.getRandomValues over Math.random where available — the
  // former is well-distributed across all browsers we ship to.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `n-${Date.now()}-${hex}`;
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ScheduleNotificationInput {
  /** Hebrew body. The OS notification title is set automatically. */
  message: string;
  /** When the notification should fire. Date or ISO string. */
  scheduledAt: Date | string;
  /** The host user id this reminder belongs to. */
  userId: string;
}

/**
 * Schedule a notification. Returns the persisted queue entry.
 *
 * Refuses to schedule for the past (allows a 60s grace window for clock
 * skew); anything earlier is almost certainly a UI bug or a wonky system
 * clock and we'd rather throw loudly than fire something instantly.
 */
export function scheduleNotification(input: ScheduleNotificationInput): ScheduledNotification {
  const scheduled = input.scheduledAt instanceof Date
    ? input.scheduledAt
    : new Date(input.scheduledAt);
  if (scheduled.getTime() < Date.now() - 60_000) {
    throw new Error("scheduled time is in the past");
  }

  const entry: ScheduledNotification = {
    id: makeNotificationId(),
    userId: input.userId,
    message: input.message,
    scheduledAt: scheduled.toISOString(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };

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
