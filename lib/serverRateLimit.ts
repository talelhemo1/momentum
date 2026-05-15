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

  // Prune expired entries (bounded cleanup — keeps the Map small).
  for (const [k, v] of store) {
    if (v.resetAt <= now) store.delete(k);
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
