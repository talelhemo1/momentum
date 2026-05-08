/**
 * Lightweight, local-only analytics. Every event is appended to a single
 * `momentum.analytics.events.v1` key in localStorage. NO third-party tracker,
 * NO network call — this is purely so the host can see what happened from
 * their own device (and for us to debug viral funnels later).
 *
 * Cap: 500 most recent events to avoid unbounded growth in the host's storage.
 */

const STORAGE_KEY = "momentum.analytics.events.v1";
const MAX_EVENTS = 500;

export interface AnalyticsEvent {
  /** Stable, machine-readable event name (e.g. "rsvp_view"). */
  name: string;
  /** Free-form properties; values must be JSON-serializable. */
  props?: Record<string, string | number | boolean | null>;
  /** ISO timestamp for the event. */
  at: string;
}

function read(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function write(events: AnalyticsEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Storage might be full or disabled (private mode). Drop silently —
    // analytics are best-effort and never block a user flow.
  }
}

/**
 * Record a single analytics event. Safe to call from any component.
 * Returns the new event so callers can chain or test.
 */
export function trackEvent(
  name: string,
  props?: AnalyticsEvent["props"],
): AnalyticsEvent {
  const event: AnalyticsEvent = {
    name,
    props,
    at: new Date().toISOString(),
  };
  const list = read();
  list.push(event);
  // Keep only the most recent MAX_EVENTS entries.
  const trimmed = list.length > MAX_EVENTS ? list.slice(-MAX_EVENTS) : list;
  write(trimmed);
  return event;
}

/**
 * Read all events, optionally filtered by name. Useful for the host's
 * dashboard ("how many people viewed your invitation?").
 */
export function getEvents(filter?: { name?: string; since?: Date }): AnalyticsEvent[] {
  let list = read();
  if (filter?.name) list = list.filter((e) => e.name === filter.name);
  if (filter?.since) {
    const cutoff = filter.since.getTime();
    list = list.filter((e) => new Date(e.at).getTime() >= cutoff);
  }
  return list;
}

/**
 * Quick aggregate counter — e.g. countEvents("rsvp_view") gives total views.
 */
export function countEvents(name: string): number {
  return read().filter((e) => e.name === name).length;
}

/**
 * Reset the analytics log. Used on account deletion.
 */
export function clearAnalytics() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
