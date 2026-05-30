"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase, SUPABASE_ENABLED } from "./supabase";
import { syncOnLogin, flushToCloud } from "./sync";
import { STORAGE_KEYS } from "./storage-keys";
import { normalizeIsraeliPhone } from "./phone";

/**
 * R47 — the auth return URL MUST point at the same origin the user is
 * currently on (apex / www / preview), NOT a pinned env origin.
 *
 * Previously this used `tryGetPublicOrigin()`, which returns
 * NEXT_PUBLIC_SITE_URL first. After the moomentum.events migration that
 * meant a user signing in *on* moomentum.events was redirected back
 * through whatever the env said — the session cookie is host-scoped, so
 * the callback landed on a different host than the cookie and the login
 * silently failed.
 *
 * This module is `"use client"`, so `window` is always available; the
 * SSR guard is purely defensive — returning undefined lets Supabase fall
 * back to its configured Site URL rather than emit a relative URL.
 *
 * (Note: lib/origin.ts is still env-first ON PURPOSE — WhatsApp/RSVP
 * links need a stable absolute origin even during SSR. Only the
 * interactive auth redirect must follow the live browser origin.)
 */
function authCallbackUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback`;
}

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
    // R125 — force the account-chooser screen each time. By default
    // Google silently re-uses the most-recent Google session, which
    // meant a vendor returning to /signup got logged in as whoever was
    // logged into Chrome — not whichever business account they wanted
    // to switch to. `prompt=select_account` makes Google ALWAYS show
    // the chooser; if the user wants to add another account they can.
    // Apple doesn't honor this query param (their flow always asks)
    // so we only set it for Google.
    const queryParams =
      provider === "google" ? { prompt: "select_account" } : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // R47 — finalize the session on our callback page, returning to
        // the SAME origin the user is on (see authCallbackUrl). Falls
        // back to undefined → Supabase uses its configured Site URL.
        redirectTo: authCallbackUrl(),
        ...(queryParams ? { queryParams } : {}),
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
        // R47 — Supabase redirects here after the email confirmation link
        // is clicked; return to the same origin the user signed up from
        // (see authCallbackUrl).
        emailRedirectTo: authCallbackUrl(),
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

  /**
   * R78 — bulletproof logout entry point.
   *
   * Fires `signOut()` in the background but doesn't wait for it to
   * resolve before navigating. If Supabase's local revoke ever hangs
   * (slow network, browser-level stall, ad-blocker interfering with
   * the SDK), the user still ends up at the destination within a
   * single tick. The actual localStorage purge inside `signOut()` is
   * fast enough that it has effectively always completed by the time
   * `window.location.href = …` triggers the document unload.
   *
   * @param target Where to send the user. Default `/` (landing page).
   */
  signOutAndRedirect(target = "/") {
    if (typeof window === "undefined") return;
    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      window.location.href = target;
    };
    // Navigate only AFTER signOut() resolves. signOut() FIRST flushes the
    // local AppState to the cloud (data safety) and THEN purges localStorage;
    // navigating immediately (the old behavior) unloaded the page and
    // cancelled that flush, so a freshly-created event/guest list could be
    // lost on logout. signOut() is internally bounded (2.5s flush race +
    // fast local-scope auth revoke), so this resolves in well under a second
    // on a normal connection.
    void this.signOut().catch(() => {}).finally(go);
    // Hard fallback: never leave the user stuck mid-logout if signOut hangs.
    window.setTimeout(go, 4000);
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
    //   0. FLUSH local state to the cloud (CRITICAL — data safety).
    //   1. Try the official signOut (revokes server-side session).
    //   2. Sweep every `sb-*-auth-token` / pkce-verifier key.
    //   3. Clear our local user record + admin cache hint.
    //   Caller does window.location.href = "/" for a hard reload so
    //   no in-memory state survives.
    const supabase = getSupabase();

    // STEP 0 — guarantee the latest local AppState (event, guests, seating,
    // budget…) is in the cloud BEFORE we (a) revoke the session and (b) wipe
    // `momentum.app.v1` below. Without this, edits made in the last few
    // hundred ms — before the debounced sync push (800ms) fired — are lost
    // forever: the page unloads on redirect (cancelling any in-flight push)
    // and then the purge removes the only remaining copy. The flush MUST run
    // while still authenticated (it calls auth.getUser()), so it goes before
    // auth.signOut(). Bounded by a race so a dead network can't hang logout.
    try {
      await Promise.race([
        flushToCloud(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
      ]);
    } catch (e) {
      console.error("[momentum/user] pre-logout cloud flush failed", e);
    }

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
        // R19 — wipe the AppState too. Until this fix, signing out only
        // cleared the auth identity; the event/guests/budget payload was
        // still in localStorage, so the Header kept rendering the previous
        // user's event card in the top-left until a manual refresh.
        // Strings hard-coded for the same circular-import reason as above —
        // keep in sync with STORAGE_KEYS.app / .slots / .activeSlotId.
        ls.removeItem("momentum.app.v1");
        ls.removeItem("momentum.app.slots");
        ls.removeItem("momentum.app.activeSlotId");
        ls.removeItem("momentum.terms_accepted_at");
        ls.removeItem("momentum.selectedTier");
        // Notify any live subscribers (Header, AssistantWidget, sync hooks)
        // that local state was wiped, so they re-render against an empty
        // store immediately rather than waiting for the next storage event.
        window.dispatchEvent(new CustomEvent("momentum:update"));
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
