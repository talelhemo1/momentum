import "server-only";

/**
 * R30 — tiny in-memory sliding-window rate limiter shared by the SMS /
 * AI routes. Best-effort (per serverless instance) — enough to stop a
 * tight abuse loop / cost-amplification without a schema change.
 *
 * Self-pruning: every call drops entries whose window has expired, so
 * the Map can't grow unbounded (the previous /api/ai/packages bespoke
 * Map leaked one entry per user forever).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// R36 B8 — full-Map scan on EVERY call is O(n) per request. Throttle
// the sweep to once per 60s; an expired-but-not-yet-swept bucket is
// still treated as fresh by the per-id check below, so correctness is
// unchanged — only the cleanup cadence.
let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 60_000;

/**
 * @returns true if the call is ALLOWED, false if the limit is exceeded.
 */
export function rateLimit(
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();

  // Prune expired entries (bounded cleanup — keeps the Map small),
  // at most once per minute.
  if (now - lastPruneAt >= PRUNE_INTERVAL_MS) {
    lastPruneAt = now;
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
    }
  }

  const id = `${bucket}:${key}`;
  const cur = store.get(id);
  if (!cur || cur.resetAt <= now) {
    store.set(id, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}
