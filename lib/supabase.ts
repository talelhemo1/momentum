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

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_ENABLED) return null;
  if (_client) return _client;
  _client = createClient(URL as string, ANON_KEY as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
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
