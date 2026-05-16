"use client";

import { useEffect, useRef, useState } from "react";
import { buildHostInvitationWhatsappLink } from "@/lib/invitation";
import type { EventInfo, Guest } from "@/lib/types";

/**
 * Cached WhatsApp/RSVP link builder for guest cards.
 *
 * Originally this hook gated link-building behind an IntersectionObserver
 * to avoid running 400 concurrent HMACs on mount with 200 cards. In
 * practice the IO gate caused real-world breakage — cards rendered inside
 * scroll containers, in StrictMode double-mount paths, or in browsers
 * where the IO callback didn't fire promptly all left buttons disabled
 * forever ("the WhatsApp link doesn't work").
 *
 * Now we build immediately on mount. Two cheap layers still keep things fast:
 *
 *   1) **Module-scoped Promise cache.** Same `eventId:guestId:token` across
 *      re-renders / route returns reuses the same Promise — we never
 *      recompute a link we already have.
 *
 *   2) **Microtask defer.** The actual crypto.subtle work runs inside a
 *      `queueMicrotask`, so the current render finishes before the HMAC
 *      starts. The engine then batches concurrent microtasks naturally.
 *      For a 200-guest list this trades a single render-blocking spike for
 *      a chain of cheap microtasks — barely measurable on a phone.
 *
 * Caller binds `cardRef` to the GuestCard root (kept for backwards
 * compatibility, but no longer strictly required). Returns
 *   { whatsappUrl, rsvpUrl, ready }
 * where `ready` flips true once both URLs land.
 */

type CacheKey = string;
interface BuiltLink {
  whatsappUrl: string;
  rsvpUrl: string;
}
const linkCache = new Map<CacheKey, Promise<BuiltLink>>();

function cacheKeyFor(origin: string, eventId: string, guestId: string, token?: string): CacheKey {
  // CRITICAL: origin must be in the key. Without it, a render that happened
  // with an empty origin (SSR/first hydration) cached a relative-URL Promise
  // — and every subsequent render with the real origin got back the broken
  // URL. WhatsApp shipped `/rsvp?...` to guests; tapping it opened blank.
  return `${origin}|${eventId}:${guestId}:${token ?? ""}`;
}

async function buildLink(origin: string, event: EventInfo, guest: Guest): Promise<BuiltLink> {
  // R33 — short-link + premium message now live INSIDE
  // buildHostInvitationWhatsappLink (the single canonical builder), so
  // this is a thin map. It used to re-implement the R28 short-link
  // upgrade on top of the legacy result, which double-created short
  // links (one here, one if any other caller appeared) — consolidated.
  //
  // The builder uses the legacy `?d=&sig=` payload-in-URL format (not
  // the `?e=&g=&t=` token-only one): a guest opening the link from
  // WhatsApp has NONE of the host's localStorage, so /rsvp must render
  // straight from the URL. The short `/i/<id>` redirects to that.
  const { url, rsvpUrl } = await buildHostInvitationWhatsappLink(
    origin,
    event,
    guest,
  );
  return { whatsappUrl: url, rsvpUrl };
}

/**
 * R18 §Q — eager pre-warm. Seeds the module Promise cache for a batch of
 * guests so the per-row hooks resolve instantly (cache hit) instead of
 * each kicking off its own HMAC after mount. Callers decide the batch:
 * the whole list for small events, the first screen-worth for big ones.
 * Cheap + idempotent — an already-cached key is skipped.
 */
export function prewarmGuestWhatsappLinks(
  origin: string,
  event: EventInfo | null | undefined,
  guests: Guest[],
): void {
  if (!event) return;
  if (!origin || !/^https?:\/\//i.test(origin)) return;
  for (const guest of guests) {
    const key = cacheKeyFor(origin, event.id, guest.id, guest.rsvpToken);
    if (linkCache.has(key)) continue;
    const promise = new Promise<BuiltLink>((resolve, reject) => {
      queueMicrotask(() => {
        buildLink(origin, event, guest).then(resolve, reject);
      });
    });
    // Drop poisoned entries so a later real render can retry.
    promise.catch(() => {
      if (linkCache.get(key) === promise) linkCache.delete(key);
    });
    linkCache.set(key, promise);
  }
}

export interface UseGuestWhatsappLinkResult {
  /** Pre-encoded `https://wa.me/...` URL with the invitation body, or "" until ready. */
  whatsappUrl: string;
  /** Bare RSVP URL the host can copy-paste, or "" until ready. */
  rsvpUrl: string;
  /** True once both URLs are resolved. */
  ready: boolean;
  /** Bind to the GuestCard root. Kept for callers that already attach a ref;
   *  the hook itself no longer requires the ref to function. */
  cardRef: React.RefObject<HTMLDivElement | null>;
}

export function useGuestWhatsappLink(
  origin: string,
  event: EventInfo | null | undefined,
  guest: Guest,
): UseGuestWhatsappLinkResult {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [rsvpUrl, setRsvpUrl] = useState("");

  // Build the link as soon as event + guest are available — no viewport
  // gate. The cache + microtask defer keep this cheap; previously gating
  // on IntersectionObserver locked buttons in disabled state when IO
  // didn't fire (small viewports, scroll containers, StrictMode quirks).
  useEffect(() => {
    if (!event) return;
    if (!origin || !/^https?:\/\//i.test(origin)) {
      // Don't poison the cache with a Promise built from an empty origin.
      // The component will re-render with a real origin once the browser
      // is alive, and that render will populate the cache correctly.
      return;
    }
    let cancelled = false;
    const key = cacheKeyFor(origin, event.id, guest.id, guest.rsvpToken);
    let promise = linkCache.get(key);
    if (!promise) {
      promise = new Promise<BuiltLink>((resolve, reject) => {
        queueMicrotask(() => {
          buildLink(origin, event, guest).then(resolve, reject);
        });
      });
      linkCache.set(key, promise);
    }
    promise.then(
      (built) => {
        if (cancelled) return;
        setWhatsappUrl(built.whatsappUrl);
        setRsvpUrl(built.rsvpUrl);
      },
      () => {
        // Drop a poisoned cache entry so a future render can retry.
        if (linkCache.get(key) === promise) linkCache.delete(key);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [origin, event, guest]);

  return {
    whatsappUrl,
    rsvpUrl,
    ready: !!whatsappUrl && !!rsvpUrl,
    cardRef,
  };
}
