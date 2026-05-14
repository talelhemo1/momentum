"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase, SUPABASE_ENABLED } from "./supabase";
import { syncOnLogin } from "./sync";
import { STORAGE_KEYS } from "./storage-keys";
import { normalizeIsraeliPhone } from "./phone";
import { tryGetPublicOrigin } from "./origin";

export type SignupMethod = "google" | "apple" | "phone" | "email";

export interface UserAccount {
  id: string;
  name: string;
  /** Email for Google/Apple, phone digits for Phone signup. */
  identifier: string;
  method: SignupMethod;
  createdAt: string;
}

const STORAGE_KEY = STORAGE_KEYS.user;

// ────────────────────────────────────────────────────────────────────────────
// Local-storage backed snapshot
// ────────────────────────────────────────────────────────────────────────────

function read(): UserAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserAccount) : null;
  } catch {
    return null;
  }
}

function write(user: UserAccount | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Quota / private mode — non-fatal. We still update the in-memory copy
    // and dispatch the event below so the UI reflects the change.
    console.error("[momentum/user] localStorage write failed:", e);
  }
  // Invalidate snapshot cache and notify subscribers.
  cachedUser = undefined;
  window.dispatchEvent(new CustomEvent("momentum:user-update"));
}

// useSyncExternalStore needs referential equality of unchanged snapshots.
// `undefined` here is the "uncached" sentinel so we don't have to distinguish
// it from the legitimate `null` (signed-out) value.
let cachedUser: UserAccount | null | undefined = undefined;
function getUserSnapshot(): UserAccount | null {
  if (cachedUser !== undefined) return cachedUser;
  cachedUser = read();
  return cachedUser;
}
function getUserServerSnapshot(): UserAccount | null {
  return null;
}
function subscribeUser(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onUpdate = () => {
    cachedUser = undefined;
    callback();
  };
  window.addEventListener("momentum:user-update", onUpdate);
  window.addEventListener("storage", onUpdate);
  return () => {
    window.removeEventListener("momentum:user-update", onUpdate);
    window.removeEventListener("storage", onUpdate);
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Build a UserAccount from a Supabase user object
// ────────────────────────────────────────────────────────────────────────────

function fromSupabaseUser(u: { id: string; email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> }): UserAccount {
  const meta = u.user_metadata ?? {};
  const provider = (meta.provider as string | undefined) ?? "";
  const method: SignupMethod =
    provider.includes("google") ? "google" : provider.includes("apple") ? "apple" : u.phone ? "phone" : "google";
  const name = (meta.name as string | undefined) || (meta.full_name as string | undefined) || (u.email?.split("@")[0]) || "אורח";
  return {
    id: u.id,
    name,
    identifier: u.email || u.phone || u.id,
    method,
    createdAt: (meta.created_at as string | undefined) || new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useUser() {
  const user = useSyncExternalStore(subscribeUser, getUserSnapshot, getUserServerSnapshot);
  const hydrated = useSyncExternalStore(subscribeUser, () => true, () => false);

  // Mirror Supabase auth into local storage. The effect only writes external
  // state (localStorage) and dispatches events — it never calls setState
  // directly, so it complies with `react-hooks/set-state-in-effect`.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;
    const init = async () => {
      const { data: { user: sbUser } } = await supabase.auth.getUser();
      if (cancelled || !sbUser) return;
      write(fromSupabaseUser(sbUser));
      await syncOnLogin();
    };
    void init();

    // R13 fix — Phone OTP verify hang.
    // supabase-js holds an internal mutex during onAuthStateChange dispatch.
    // Calling getUser()/getSession() inside the callback (which syncOnLogin
    // → pullFromCloud does) deadlocks the verifyOtp() promise indefinitely.
    // Defer syncOnLogin to a microtask so it runs OFF the auth event's call
    // stack — no nested supabase calls inside the listener body itself.
    const sub = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) {
        write(fromSupabaseUser(session.user));
        queueMicrotask(() => {
          void syncOnLogin();
        });
      } else {
        write(null);
      }
    });

    return () => {
      cancelled = true;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  return { user, hydrated };
}

// ────────────────────────────────────────────────────────────────────────────
// Imperative actions (no hooks — callable from event handlers)
// ────────────────────────────────────────────────────────────────────────────

export const userActions = {
  /** Local signup (no cloud). Used when Supabase is not configured. */
  signup(input: { name: string; identifier: string; method: SignupMethod }): UserAccount {
    const user: UserAccount = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      identifier: input.identifier.trim(),
      method: input.method,
      createdAt: new Date().toISOString(),
    };
    write(user);
    return user;
  },

  /**
   * Patch the local user profile. Used by /onboarding to persist the
   * observance-level picker, and any future profile edits. Returns the new
   * snapshot or null if no user is signed in.
   */
  updateProfile(patch: Partial<Pick<UserAccount, "name">>): UserAccount | null {
    const current = read();
    if (!current) return null;
    const next: UserAccount = { ...current, ...patch };
    write(next);
    return next;
  },

  /** OAuth via Supabase — opens the provider redirect flow. */
  async signInWithOAuth(provider: "google" | "apple") {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Redirect through our callback page so we can finalize the session
        // and pull the cloud state into localStorage before landing on
        // /onboarding. Use tryGetPublicOrigin so prod respects the
        // NEXT_PUBLIC_SITE_URL env var instead of whatever
        // window.location.origin happens to be (tunnel domains, preview
        // deploys, etc). Falls back to undefined which lets Supabase use
        // its configured Site URL.
        redirectTo: (() => {
          const o = tryGetPublicOrigin();
          return o ? `${o}/auth/callback` : undefined;
        })(),
      },
    });
    if (error) throw error;
  },

  /** Phone OTP via Supabase. Step 1 — request OTP. */
  async sendPhoneOtp(phone: string) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    // Single source of truth for phone format: lib/phone.ts. Inline regexes
    // here used to disagree with normalizeIsraeliPhone on edge cases like
    // "+9720..." or "00972...", giving Supabase auth a different number from
    // the one /guests / /rsvp would have shown the user.
    const { phone: normalized, valid } = normalizeIsraeliPhone(phone);
    if (!valid) throw new Error("מספר טלפון לא תקין");
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+${normalized}`,
    });
    if (error) throw error;
  },

  /**
   * Email + password signup via Supabase. The user's session is established
   * synchronously when `mailer_autoconfirm` is on; when it's off (the
   * default), Supabase sends a confirmation email and `data.session` is
   * null until the link is clicked. The caller should branch on the
   * returned `confirmationRequired` to show a "check your email" view.
   */
  async signUpWithEmail(email: string, password: string, name: string) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    const trimmedEmail = email.trim().toLowerCase();
    if (!/.+@.+\..+/.test(trimmedEmail)) {
      throw new Error("כתובת מייל לא תקינה");
    }
    if (password.length < 8) {
      throw new Error("הסיסמה חייבת להיות לפחות 8 תווים");
    }
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        // Stash the name in user_metadata so the verify-email landing page
        // can read it back without us having to round-trip through profiles.
        data: { full_name: name.trim() },
        // Where Supabase redirects after the confirmation link is clicked.
        emailRedirectTo: (() => {
          const o = tryGetPublicOrigin();
          return o ? `${o}/auth/callback` : undefined;
        })(),
      },
    });
    if (error) throw error;
    return { confirmationRequired: !data.session, user: data.user };
  },

  /** Email + password sign-in for users who already verified their email. */
  async signInWithEmail(email: string, password: string) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    const trimmedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (error) throw error;
  },

  /** Phone OTP via Supabase. Step 2 — verify code. */
  async verifyPhoneOtp(phone: string, code: string) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    const { phone: normalized, valid } = normalizeIsraeliPhone(phone);
    if (!valid) throw new Error("מספר טלפון לא תקין");
    const { error } = await supabase.auth.verifyOtp({
      phone: `+${normalized}`,
      token: code,
      type: "sms",
    });
    if (error) throw error;
  },

  async signOut() {
    // R13 — bulletproof sign-out.
    //
    // Root cause we kept hitting: `useUser()` runs a
    // `supabase.auth.getUser()` on every mount and, if it sees a valid
    // session, rewrites the local `momentum.user.v1` with the Supabase
    // user — undoing any signOut that didn't fully purge Supabase's
    // localStorage. So clearing just our own key isn't enough; we have
    // to manually nuke every `sb-*` key Supabase ever wrote, otherwise
    // the next page load rehydrates the user from the leftover session
    // token.
    //
    // Order:
    //   1. Try the official signOut (revokes server-side session).
    //   2. Sweep every `sb-*-auth-token` / pkce-verifier key.
    //   3. Clear our local user record + admin cache hint.
    //   Caller does window.location.href = "/" for a hard reload so
    //   no in-memory state survives.
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (e) {
        console.error("[momentum/user] supabase signOut failed", e);
      }
    }

    // Force-clear every Supabase localStorage key. Naming convention:
    //   "sb-<project>-auth-token"
    //   "sb-<project>-auth-token-code-verifier"
    // Iterate over all keys to catch alt formats / future changes too.
    try {
      if (typeof window !== "undefined") {
        const ls = window.localStorage;
        const doomed: string[] = [];
        for (let i = 0; i < ls.length; i += 1) {
          const k = ls.key(i);
          if (!k) continue;
          if (
            k.startsWith("sb-") &&
            (k.includes("auth-token") || k.includes("verifier"))
          ) {
            doomed.push(k);
          }
        }
        for (const k of doomed) ls.removeItem(k);
        // Admin badge cache. Hard-coded key since `STORAGE_KEYS.adminCache`
        // is a circular import risk; keeping the literal matches the value.
        ls.removeItem("momentum.isAdmin.v1");
        // R14 — vendor-context cache. Same reasoning: avoid the circular
        // import, keep the literal in sync with STORAGE_KEYS.vendorContext.
        // Without this, the next visitor (or freshly anonymous tab) sees
        // the prior user's vendor pill for ~1s until the server check
        // returns "no landing".
        ls.removeItem("momentum.vendor.context.v1");
      }
    } catch (e) {
      console.error("[momentum/user] localStorage purge failed", e);
    }

    write(null);
  },

  getSnapshot() {
    return read();
  },

  /** True if cloud sync is configured (env vars set). */
  cloudEnabled(): boolean {
    return SUPABASE_ENABLED;
  },
};
