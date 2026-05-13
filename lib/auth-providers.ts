"use client";

import { useEffect, useState } from "react";

/**
 * Which Supabase auth methods are actually enabled in this project.
 *
 * Why this exists:
 *   `supabase.auth.signInWithOAuth({ provider: 'google' })` does NOT throw
 *   when Google isn't enabled. It still sets `window.location.href` to
 *   `<supabase-url>/auth/v1/authorize?provider=google`, the browser leaves
 *   the app, and Supabase responds with a blank/dead-end error page. The
 *   user thinks the app crashed.
 *
 *   We sidestep that by probing `/auth/v1/settings` (a public endpoint that
 *   returns the project's auth config) once on the client and gating the
 *   provider buttons before we ever call signInWithOAuth.
 */
export interface AuthProviders {
  email: boolean;
  google: boolean;
  apple: boolean;
  phone: boolean;
  /** False until the settings fetch resolves; gives the UI a way to
   *  render a neutral state for the brief window before we know. */
  loaded: boolean;
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const DEFAULT: AuthProviders = {
  // Optimistic default for email — if the settings probe fails (network
  // hiccup, ad blocker), we'd rather render a working email button than
  // hide the only path that actually works.
  email: true,
  google: false,
  apple: false,
  phone: false,
  loaded: false,
};

// Module-scoped cache so multiple components mounting in the same tab
// don't trigger a fetch storm. Resets on full reload.
let cache: AuthProviders | null = null;
let inflight: Promise<AuthProviders> | null = null;

async function fetchProviders(): Promise<AuthProviders> {
  if (cache) return cache;
  if (inflight) return inflight;

  if (!URL || !ANON_KEY) {
    cache = { ...DEFAULT, loaded: true };
    return cache;
  }

  inflight = fetch(`${URL}/auth/v1/settings`, {
    headers: { apikey: ANON_KEY },
    // The settings endpoint is public; no cookies needed. Keep CORS simple.
    credentials: "omit",
  })
    .then((r) => r.json())
    .then((d: { external?: Record<string, boolean> }) => {
      const ext = d.external ?? {};
      const next: AuthProviders = {
        email: ext.email !== false,
        google: ext.google === true,
        apple: ext.apple === true,
        phone: ext.phone === true,
        loaded: true,
      };
      cache = next;
      return next;
    })
    .catch(() => {
      // Network failure — assume only email works (safest fallback).
      const next = { ...DEFAULT, loaded: true };
      cache = next;
      return next;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Reactive accessor — returns DEFAULT until the fetch resolves, then the real values. */
export function useAuthProviders(): AuthProviders {
  // Lazy initializer reads the module cache so a second mount in the same tab
  // gets the right values on its first render (no setState-in-effect).
  const [providers, setProviders] = useState<AuthProviders>(() => cache ?? DEFAULT);

  useEffect(() => {
    // Already loaded? The lazy init above gave us the loaded value, nothing
    // to do. (Calling setProviders here would trip
    // `react-hooks/set-state-in-effect`.)
    if (cache?.loaded) return;
    let cancelled = false;
    void fetchProviders().then((p) => {
      if (!cancelled) setProviders(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}
