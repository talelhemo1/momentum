"use client";

/**
 * Web Crypto helpers — HMAC-SHA256 signing/verification and AES-GCM
 * encryption for sensitive data at rest.
 *
 * All operations use the browser's native `crypto.subtle`, so secrets never
 * leave the device and we don't ship a third-party crypto library.
 */

// ──────────────────────────────────────────────────────────────────────────
// Base64URL helpers (URL-safe, no padding)
// ──────────────────────────────────────────────────────────────────────────

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array | null {
  try {
    let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Random key generation
// ──────────────────────────────────────────────────────────────────────────

/** Generate a 256-bit random secret, base64url-encoded. */
export function generateSigningKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

// ──────────────────────────────────────────────────────────────────────────
// HMAC-SHA256 sign + verify
// ──────────────────────────────────────────────────────────────────────────

async function importHmacKey(secretB64Url: string): Promise<CryptoKey> {
  const keyBytes = base64UrlToBytes(secretB64Url);
  if (!keyBytes) throw new Error("invalid signing key");
  return crypto.subtle.importKey(
    "raw",
    asArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const enc = new TextEncoder();

function asArrayBuffer(view: Uint8Array): ArrayBuffer {
  // Allocate a fresh ArrayBuffer and copy bytes. Avoids the
  // ArrayBuffer | SharedArrayBuffer union that lib.dom now exposes.
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

export async function hmacSign(secretB64Url: string, message: string): Promise<string> {
  const key = await importHmacKey(secretB64Url);
  const sig = await crypto.subtle.sign("HMAC", key, asArrayBuffer(enc.encode(message)));
  return bytesToBase64Url(new Uint8Array(sig));
}

/**
 * Constant-time HMAC verification. Returns true only if the signature was
 * produced by the same secret over the same message.
 */
export async function hmacVerify(
  secretB64Url: string,
  message: string,
  signatureB64Url: string,
): Promise<boolean> {
  try {
    const key = await importHmacKey(secretB64Url);
    const sig = base64UrlToBytes(signatureB64Url);
    if (!sig) return false;
    return await crypto.subtle.verify("HMAC", key, asArrayBuffer(sig), asArrayBuffer(enc.encode(message)));
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// RSVP tokens — thin wrapper around hmacSign/Verify with a stable message
// shape so every place that builds or checks a token agrees.
// ──────────────────────────────────────────────────────────────────────────

/** Canonical message we sign for RSVP tokens — pipe-separated, ASCII-only. */
function rsvpMessage(eventId: string, guestId: string): string {
  return `rsvp:${eventId}|${guestId}`;
}

/**
 * Generate a per-guest RSVP token signed with the event's HMAC key. The token
 * is base64url and embeds NO sensitive data — it's a signature over
 * (eventId, guestId), which are already in the URL.
 */
export async function generateRsvpToken(
  eventId: string,
  guestId: string,
  signingKey: string,
): Promise<string> {
  return hmacSign(signingKey, rsvpMessage(eventId, guestId));
}

/**
 * Verify a token presented in an RSVP URL. Returns true only when:
 *  - the token decodes
 *  - it was signed with `signingKey`
 *  - over exactly the (eventId, guestId) pair the URL is targeting
 */
export async function verifyRsvpToken(
  token: string,
  eventId: string,
  guestId: string,
  signingKey: string,
): Promise<boolean> {
  if (!token || !eventId || !guestId || !signingKey) return false;
  return hmacVerify(signingKey, rsvpMessage(eventId, guestId), token);
}

// R166 — removed unused AES-GCM field-encryption helpers
// (encryptString/decryptString/importAesKey). They were never wired up;
// their own note said to delete them if unshipped by launch (June 2026).
// Unused crypto is a maintenance/audit liability — gone. Restore from git
// history if field-level encryption is ever actually implemented.
