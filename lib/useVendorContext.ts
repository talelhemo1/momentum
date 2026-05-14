"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { STORAGE_KEYS } from "./storage-keys";
import type { VendorLandingData } from "./types";

/**
 * Vendor identity for the signed-in user.
 *
 * "Is this signed-in user the owner of any vendor_landings row?"
 * — drives every vendor-side routing decision (sidebar visibility,
 * /dashboard ↔ /vendors/dashboard redirect, "you have a vendor profile"
 * banners).
 *
 * Caches the answer in module scope + localStorage so we don't re-hit
 * Supabase on every Header/Sidebar mount. The cache stores the slug too,
 * because navigating between vendor pages needs it without a re-fetch.
 */

interface VendorContextValue {
  isVendor: boolean;
  vendorLanding: VendorLandingData | null;
  /** True once we've made the first server check (vs. just the cache). */
  hasPaidTier: boolean;
  isLoading: boolean;
}

interface CachedContext {
  isVendor: boolean;
  vendorSlug: string | null;
  lastChecked: number;
}

let moduleCache: CachedContext | null = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes — short enough that a freshly
                                  // created landing is reflected within a
                                  // page refresh, long enough to not spam
                                  // the DB on every navigation.

function readCache(): CachedContext | null {
  if (moduleCache) return moduleCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.vendorContext);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedContext;
    if (!parsed.lastChecked || Date.now() - parsed.lastChecked > CACHE_TTL_MS) {
      return null;
    }
    moduleCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(c: CachedContext) {
  moduleCache = c;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.vendorContext, JSON.stringify(c));
  } catch {
    // localStorage full / disabled — module cache is enough for the session.
  }
}

/** Clear the vendor context — call from signOut paths so the next render
 *  doesn't show stale vendor UI for a now-anonymous user. */
export function clearVendorContextCache() {
  moduleCache = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.vendorContext);
  } catch {}
}

export function useVendorContext(): VendorContextValue {
  const initialCache = readCache();
  const [isVendor, setIsVendor] = useState<boolean>(
    initialCache?.isVendor ?? false,
  );
  const [vendorLanding, setVendorLanding] = useState<VendorLandingData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // hasPaidTier reads price_range from the landing — "premium" / "luxury"
  // tiers unlock advanced dashboard features (TODO: gate behind real
  // payments once Stripe is wired in).
  const [hasPaidTier, setHasPaidTier] = useState<boolean>(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setIsVendor(false);
          setVendorLanding(null);
          setHasPaidTier(false);
          writeCache({ isVendor: false, vendorSlug: null, lastChecked: Date.now() });
          return;
        }

        const { data } = (await supabase
          .from("vendor_landings")
          .select("*")
          .eq("owner_user_id", user.id)
          .maybeSingle()) as { data: VendorLandingData | null };

        if (cancelled) return;
        const found = !!data;
        setIsVendor(found);
        setVendorLanding(data);
        setHasPaidTier(
          !!data &&
            (data.price_range === "premium" || data.price_range === "luxury"),
        );
        writeCache({
          isVendor: found,
          vendorSlug: data?.slug ?? null,
          lastChecked: Date.now(),
        });
      } catch (e) {
        // Soft failure — UI just doesn't show vendor surfaces.
        console.error("[useVendorContext]", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { isVendor, vendorLanding, hasPaidTier, isLoading };
}
