"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Optional cloud sync via Supabase.
 *
 * The app is fully functional without it (localStorage), so we feature-detect
 * the env vars and only initialize the client when both are present.
 *
 * To enable cloud sync, add to `.env.local`:
 *   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
 *
 * Then run the SQL in `supabase/schema.sql` on your Supabase project.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_ENABLED = !!(URL && ANON_KEY);

let _client: SupabaseClient | null = null;

/**
 * R146 — Safari-ITP-resistant auth storage.
 *
 * Safari's Intelligent Tracking Prevention wipes localStorage on a domain
 * after the user is bounced through "third-party" domains (Google OAuth →
 * supabase.co → back). The PKCE code_verifier — which signInWithOAuth()
 * stores BEFORE the redirect — gets nuked mid-flight, so when /auth/callback
 * later calls exchangeCodeForSession() the verifier is gone, the exchange
 * fails (or worse, hangs while supabase-js's internal retry runs), and the
 * user sees "האימות לוקח יותר מהרגיל".
 *
 * Workaround: dual-write every auth key to BOTH localStorage AND a same-site
 * cookie. Cookies on the same eTLD+1 survive Safari ITP's redirect chain.
 * Reads try localStorage first (fast); fall through to the cookie when ITP
 * has wiped it. Affects ONLY supabase auth state; everything else (app
 * state, etc.) keeps using localStorage directly.
 *
 * Cookies are capped at ~3.5KB per value (Safari limit ≈ 4KB) — the PKCE
 * verifier is ~100 bytes and the session ~3KB, both well under. Anything
 * larger silently falls back to localStorage-only and we lose the ITP
 * resistance for that one key (acceptable).
 */
const COOKIE_MAX_BYTES = 3500;

function readCookie(rawKey: string): string | null {
  if (typeof document === "undefined") return null;
  const ek = encodeURIComponent(rawKey).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp("(^|; )" + ek + "=([^;]*)"));
  if (!m) return null;
  try {
    return decodeURIComponent(m[2]);
  } catch {
    return null;
  }
}

function writeCookie(rawKey: string, value: string): void {
  if (typeof document === "undefined") return;
  // 1 year. SameSite=Lax lets the cookie survive a top-level GET redirect
  // back from an external OAuth provider — Strict would block it.
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  const ek = encodeURIComponent(rawKey);
  const ev = encodeURIComponent(value);
  try {
    document.cookie = `${ek}=${ev}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  } catch {
    /* private mode quotas — non-fatal */
  }
}

function deleteCookie(rawKey: string): void {
  if (typeof document === "undefined") return;
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  const ek = encodeURIComponent(rawKey);
  try {
    document.cookie = `${ek}=; path=/; max-age=0; SameSite=Lax${secure}`;
  } catch {
    /* non-fatal */
  }
}

const itpResistantAuthStorage = {
  isServer: false,
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      const ls = window.localStorage.getItem(key);
      if (ls != null) return ls;
    } catch {
      /* fall through */
    }
    return readCookie(key);
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* quota — non-fatal */
    }
    if (value.length <= COOKIE_MAX_BYTES) writeCookie(key, value);
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* non-fatal */
    }
    deleteCookie(key);
  },
};

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_ENABLED) return null;
  if (_client) return _client;
  _client = createClient(URL as string, ANON_KEY as string, {
    auth: {
      storage: itpResistantAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      // R145 — DISABLED auto-detection. The /auth/callback page exchanges
      // the code EXPLICITLY. Leaving detectSessionInUrl on caused a
      // double-exchange race: supabase-js would start its own internal
      // exchange when getSession() was first called, and our explicit
      // exchangeCodeForSession() would then race against it — under Safari
      // (and any browser where the internal exchange held its mutex longer
      // than a few hundred ms) the second call deadlocked behind the
      // unfinished first, and our 12s callback timeout fired with
      // "האימות לוקח יותר מהרגיל". With auto-detect off, the callback owns
      // the entire exchange end-to-end and there's no race.
      detectSessionInUrl: false,
      // Force PKCE so OAuth (Google/Apple) + magic links always return a
      // `?code=` we exchange on /auth/callback. The supabase-js default
      // has drifted between "implicit" (#access_token hash) and "pkce"
      // across versions; pinning keeps the return shape consistent with
      // the callback handler.
      flowType: "pkce",
    },
    realtime: { params: { eventsPerSecond: 2 } },
  });
  return _client;
}

/** Database row shape for the single `events` row per user. */
export interface DbEventState {
  user_id: string;
  payload: unknown; // We store the entire AppState JSON for simplicity (single user, single event for now).
  updated_at: string;
}
