"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase, SUPABASE_ENABLED } from "./supabase";
import { syncOnLogin } from "./sync";
import { STORAGE_KEYS } from "./storage-keys";

export type SignupMethod = "google" | "apple" | "phone";

export type ObservanceLevel = "secular" | "traditional" | "religious";

export interface UserAccount {
  id: string;
  name: string;
  /** Email for Google/Apple, phone digits for Phone signup. */
  identifier: string;
  method: SignupMethod;
  createdAt: string;
  /** How strictly the user observes Shabbat / holidays. Drives notification gating.
   *  Optional for backwards compatibility — undefined behaves like "secular". */
  observanceLevel?: ObservanceLevel;
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
  if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(STORAGE_KEY);
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

    const sub = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (session?.user) {
        write(fromSupabaseUser(session.user));
        await syncOnLogin();
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
  updateProfile(patch: Partial<Pick<UserAccount, "name" | "observanceLevel">>): UserAccount | null {
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
        // and pull the cloud state into localStorage before landing on /onboarding.
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    if (error) throw error;
  },

  /** Phone OTP via Supabase. Step 1 — request OTP. */
  async sendPhoneOtp(phone: string) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    const normalized = phone.replace(/\D/g, "").replace(/^0/, "+972");
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized.startsWith("+") ? normalized : `+${normalized}`,
    });
    if (error) throw error;
  },

  /** Phone OTP via Supabase. Step 2 — verify code. */
  async verifyPhoneOtp(phone: string, code: string) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("cloud-sync-disabled");
    const normalized = phone.replace(/\D/g, "").replace(/^0/, "+972");
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized.startsWith("+") ? normalized : `+${normalized}`,
      token: code,
      type: "sms",
    });
    if (error) throw error;
  },

  async signOut() {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
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
