import { getSupabase } from "@/lib/supabase";

/**
 * R28 — short links behind /i/<id> so the WhatsApp preview shows a
 * clean URL (and a rich OG image) instead of a 300-char `?d=…&sig=…`.
 *
 * Isomorphic: `getSupabase()` is an anon HTTP client that works on the
 * server (OG image / redirect page) and the client (invite flow). Every
 * function fails soft — the caller falls back to the full URL.
 */

// 56 chars, no 1/l/I/0/O ambiguity. 56^6 ≈ 30.8B combinations.
const ALPHABET =
  "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateShortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Persist `longPath` behind a short id (deduped per event+path).
 * Returns the id, or null if Supabase is unavailable / the call failed
 * (caller keeps the long URL — the existing flow must never break).
 */
export async function createShortLink(
  longPath: string,
  eventId: string,
): Promise<string | null> {
  // R40 — was a SELECT (dedup) + INSERT pair. R36 dropped the public
  // SELECT policy on short_links (mass-PII-leak fix), so the dedup
  // query silently returned null under RLS, every INSERT then hit the
  // R30 (event_id, long_path) unique index → all 3 retries failed →
  // creation always returned null → callers shipped the long URL
  // (guests saw long, image-less links again).
  //
  // The SECURITY DEFINER RPC `create_or_get_short_link` does both steps
  // atomically in the DB: returns the existing short_id for an
  // (event_id, long_path) pair, or generates+inserts a fresh one with
  // its own collision retries.
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase.rpc("create_or_get_short_link", {
      p_long_path: longPath,
      p_event_id: eventId,
    });

    if (error) {
      console.error(
        "[shortLinks] create_or_get_short_link RPC failed",
        error,
      );
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error("[shortLinks] create failed", e);
    return null;
  }
}

/** Resolve a short id back to its long path, or null if not found. */
export async function lookupShortLink(
  shortId: string,
): Promise<string | null> {
  // R29 — getSupabase() + the query are ALL inside try/catch so zero
  // errors escape (this runs in the OG/edge-ish server path too).
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    // R36 SECURITY — the open "anyone reads short links" SELECT policy
    // was dropped (mass-PII-leak fix). Resolution goes through the
    // SECURITY DEFINER `lookup_short_link` RPC so the table isn't
    // anon-enumerable. The R36 migration is live, so the deploy-order
    // fallback to a direct select is now dead weight (RLS blocks it
    // anyway) — simplified to the RPC only.
    const { data, error } = (await supabase.rpc("lookup_short_link", {
      p_short_id: shortId,
    })) as { data: string | null; error: { message?: string } | null };

    if (error) {
      console.error("[shortLinks] lookup_short_link RPC failed", error);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error("[shortLinks] lookup failed", e);
    return null;
  }
}
