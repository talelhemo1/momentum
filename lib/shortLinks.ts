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
 * Persist `longPath` behind a fresh short id. Returns the id, or null
 * if Supabase is unavailable / the insert failed (caller keeps the long
 * URL — the existing flow must never break).
 */
export async function createShortLink(
  longPath: string,
  eventId: string,
): Promise<string | null> {
  // R29 — whole body guarded: the invite flow must NEVER break because
  // the short_links table/row is missing or Supabase hiccups. Caller
  // falls back to the full URL on null.
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    // R30 — dedupe: re-use an existing short id for the SAME
    // (event_id, long_path) instead of inserting a fresh row on every
    // cache-miss / reload / device. Without this the open-INSERT table
    // grew one row per (re)send. (The R30 hardening migration adds a
    // matching unique index as the hard guarantee.)
    const existing = (await supabase
      .from("short_links")
      .select("short_id")
      .eq("event_id", eventId)
      .eq("long_path", longPath)
      .limit(1)
      .maybeSingle()) as { data: { short_id: string } | null };
    if (existing.data?.short_id) return existing.data.short_id;

    // A couple of attempts in the (astronomically unlikely) collision case.
    for (let attempt = 0; attempt < 3; attempt++) {
      const shortId = generateShortId();
      const { error } = await supabase
        .from("short_links")
        .insert({ short_id: shortId, long_path: longPath, event_id: eventId });
      if (!error) return shortId;
      // 23505 = unique_violation → retry; anything else → bail.
      if (!/duplicate key|23505/i.test(error.message ?? "")) {
        console.error("[shortLinks] insert failed", error.message);
        return null;
      }
    }
    return null;
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
    // is dropped; resolution now goes through the SECURITY DEFINER
    // `lookup_short_link` RPC so the table isn't anon-enumerable.
    //
    // Resilient deploy: try the RPC first. If it's missing (this code
    // shipped before the migration ran) OR errors, fall back to the
    // direct select — which still works pre-migration (old policy
    // present) and is simply RLS-blocked post-migration (returns
    // nothing, same as a miss). So the invite flow is safe in EITHER
    // deploy order.
    const rpc = (await supabase.rpc("lookup_short_link", {
      p_short_id: shortId,
    })) as { data: string | null; error: { message?: string } | null };
    if (!rpc.error && typeof rpc.data === "string" && rpc.data) {
      return rpc.data;
    }

    const { data } = (await supabase
      .from("short_links")
      .select("long_path")
      .eq("short_id", shortId)
      .maybeSingle()) as { data: { long_path: string } | null };
    return data?.long_path ?? null;
  } catch (e) {
    console.error("[shortLinks] lookup failed", e);
    return null;
  }
}
