import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAdminOfNewApplication } from "@/lib/vendorNotifications";
import { VENDOR_CATEGORIES, type VendorApplicationInput } from "@/lib/vendorApplication";
import { normalizeIsraeliPhone } from "@/lib/phone";

/**
 * Local URL guard. Mirrors lib/safeUrl.ts:safeHttpUrl semantics but inlined
 * so the API layer doesn't import client-only modules. Returns true for
 * absent inputs (the field is optional) and for valid http(s) URLs only;
 * `javascript:`, `data:`, etc. are rejected.
 */
// R14.2 — name kept (`isHttpsUrl`) for diff-friendliness, but the body
// now actually requires HTTPS. The earlier `http:`-allowed version was
// inconsistent with the user-facing error message and let portfolios
// be submitted under cleartext, which is a downgrade vector when the
// admin dashboard renders the link.
function isHttpsUrl(u: string | undefined | null): boolean {
  if (!u) return true;
  try {
    const url = new URL(u);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── R19 security: in-memory rate limit ────────────────────────────────────
// Per-IP cap on vendor applications. This is a defense-in-depth measure: the
// real long-term fix is a Supabase RPC backed by the row-level `ip_address`
// column we already log, but that requires a service-role key or a custom
// SECURITY DEFINER function. In-memory works fine for a single-instance dev
// deploy and the warm window of a serverless instance; cold starts reset
// the counter, which is acceptable because the same attacker spinning up new
// instances would still be slowed by Vercel's connection-level throttling.

const APPLY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const APPLY_MAX_PER_IP = 5;
// Map<ip, timestamps[]>. Module-scoped so it persists across requests in the
// same instance. Stale entries are pruned on every check.
const recentApplyByIp = new Map<string, number[]>();

function checkApplyRateLimit(ip: string | null): { ok: true } | { ok: false; retryAfterSec: number } {
  if (!ip) return { ok: true }; // No IP header — can't rate-limit; let through.
  const now = Date.now();
  const cutoff = now - APPLY_WINDOW_MS;
  const history = (recentApplyByIp.get(ip) ?? []).filter((t) => t >= cutoff);
  if (history.length >= APPLY_MAX_PER_IP) {
    // Tell the client when the oldest hit drops off — that's their next window.
    const retryAfterSec = Math.max(60, Math.ceil((history[0] + APPLY_WINDOW_MS - now) / 1000));
    recentApplyByIp.set(ip, history); // persist pruned list
    return { ok: false, retryAfterSec };
  }
  history.push(now);
  recentApplyByIp.set(ip, history);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    // Rate-limit BEFORE we parse the body. A spammer who hits the limit
    // shouldn't get their bytes parsed or their phone number normalized.
    //
    // R14.2 — `x-forwarded-for` is trivially spoofed by a client (any
    // value rotates the bucket key, defeating the cap). On Vercel,
    // `x-vercel-forwarded-for` is set by the platform's proxy and is
    // NOT echoed from client headers. Prefer it; fall back to
    // x-real-ip (also platform-set on most edges); fall back to XFF
    // only when neither is present (e.g. local dev), where spoofing
    // matters less because we're not in production anyway.
    const earlyIp =
      req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const rl = checkApplyRateLimit(earlyIp);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `יותר מדי בקשות מהכתובת הזו. נסה שוב בעוד ${Math.ceil(rl.retryAfterSec / 60)} דקות.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = (await req.json()) as VendorApplicationInput;

    // ── Server-side validation. Never trust the client. ──
    const required: (keyof VendorApplicationInput)[] = [
      "business_name",
      "contact_name",
      "phone",
      "email",
      "category",
      "sample_work_url",
      "business_id",
      "years_in_field",
    ];
    for (const field of required) {
      const v = body[field];
      if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
        return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
      }
    }

    if (!/.+@.+\..+/.test(body.email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    // Number.isFinite guards against NaN, Infinity, -Infinity. The previous
    // `typeof === "number"` was true for NaN, and NaN comparisons returned
    // false, so a sneaky NaN would pass through. This now blocks it.
    if (
      !Number.isFinite(body.years_in_field) ||
      body.years_in_field < 0 ||
      body.years_in_field > 80
    ) {
      return NextResponse.json({ error: "ניסיון בשנים לא תקין" }, { status: 400 });
    }
    if (
      body.business_name.length > 200 ||
      (body.about !== undefined && body.about.length > 2000) ||
      body.contact_name.length > 200
    ) {
      return NextResponse.json({ error: "Field too long" }, { status: 400 });
    }

    // Category: must be one of the known IDs. Without this guard, a caller
    // could insert any string into the table, breaking downstream consumers
    // that match on the enum.
    const validCategoryIds = VENDOR_CATEGORIES.map((c) => c.id) as string[];
    if (!validCategoryIds.includes(body.category)) {
      return NextResponse.json({ error: "קטגוריה לא חוקית" }, { status: 400 });
    }

    // Phone normalization. Same source of truth as the rest of the app
    // (lib/phone.ts) so a vendor with a "0501234567" entry gets stored as
    // "972501234567" — same shape we'd send to wa.me.
    const normalized = normalizeIsraeliPhone(body.phone);
    if (!normalized.valid) {
      return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400 });
    }

    // URL scheme validation. JSX renders the href verbatim, so a stored
    // `javascript:alert(1)` would execute on click in the admin dashboard.
    if (!isHttpsUrl(body.sample_work_url)) {
      return NextResponse.json(
        { error: "קישור לדוגמה חייב להיות https://" },
        { status: 400 },
      );
    }
    if (body.website && !isHttpsUrl(body.website)) {
      return NextResponse.json({ error: "אתר חייב להיות https://" }, { status: 400 });
    }

    // Use anon key for inserts — RLS policy allows public insert in `pending` only.
    const supabase = createClient(supabaseUrl, anonKey);

    // Reuse the IP we already extracted for rate-limiting. Keeps the route
    // honest about the fact that there's exactly one IP under consideration
    // (no risk of the rate-limit and the row-insert seeing different values).
    const ip = earlyIp;
    const ua = req.headers.get("user-agent") ?? null;

    // ── CRITICAL: explicit insert payload, NOT `{ ...body }`. ──
    // Spreading the whole body let a caller smuggle `status: "approved"`,
    // `reviewed_at`, `approved_vendor_id`, `phone_verified` etc. into the
    // INSERT. The DB defaults + the tightened RLS policy now block that
    // server-side too, but we still strip at the application layer for
    // defense in depth and to keep the SQL diagnostics clean.
    const insertPayload = {
      business_name: body.business_name.trim().slice(0, 200),
      contact_name: body.contact_name.trim().slice(0, 100),
      phone: normalized.phone,
      email: body.email.trim().slice(0, 254),
      city: body.city?.trim().slice(0, 100) ?? null,
      category: body.category,
      about: body.about?.trim().slice(0, 1500) ?? null,
      website: body.website?.trim().slice(0, 500) ?? null,
      instagram: body.instagram?.trim().slice(0, 100) ?? null,
      facebook: body.facebook?.trim().slice(0, 100) ?? null,
      sample_work_url: body.sample_work_url.trim().slice(0, 500),
      business_id: body.business_id.trim().slice(0, 50),
      years_in_field: body.years_in_field,
      ip_address: ip,
      user_agent: ua,
      // status='pending', phone_verified=false, reviewed_at=null,
      // approved_vendor_id=null all stay at their column defaults.
    };

    const { data, error } = await supabase
      .from("vendor_applications")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      // R19 security: log the full DB error server-side; return a generic
      // message to the client. Supabase / Postgres errors can leak schema
      // names, constraint text, internal hostnames — none of that should
      // reach the browser.
      console.error("[/api/vendors/apply] insert failed", error);
      return NextResponse.json(
        { error: "שמירת הבקשה נכשלה. נסה שוב בעוד רגע." },
        { status: 500 },
      );
    }

    // The application is in the DB. Notification failure must NOT roll back
    // the row or surface as a 500 — admin can still see the entry and act.
    // The notify type expects `string | undefined` (not `string | null`) so
    // we coerce nullable optional fields here without touching the DB row.
    const notifyPayload = {
      business_name: insertPayload.business_name,
      contact_name: insertPayload.contact_name,
      phone: insertPayload.phone,
      email: insertPayload.email,
      city: insertPayload.city ?? undefined,
      category: insertPayload.category,
      about: insertPayload.about ?? undefined,
      website: insertPayload.website ?? undefined,
      instagram: insertPayload.instagram ?? undefined,
      facebook: insertPayload.facebook ?? undefined,
      sample_work_url: insertPayload.sample_work_url,
      business_id: insertPayload.business_id,
      years_in_field: insertPayload.years_in_field,
    };
    let notifyResults: Awaited<ReturnType<typeof notifyAdminOfNewApplication>> = [];
    try {
      notifyResults = await notifyAdminOfNewApplication(notifyPayload, data.id);
    } catch (notifyErr) {
      console.error("[apply] notification failed:", notifyErr);
    }

    const logRows = notifyResults.map((r) => ({
      application_id: data.id,
      channel: r.channel,
      status: r.status,
      error: r.error ?? null,
    }));
    if (logRows.length) {
      try {
        await supabase.from("vendor_notifications_log").insert(logRows);
      } catch (logErr) {
        console.error("[apply] notification log insert failed:", logErr);
      }
    }

    return NextResponse.json({ applicationId: data.id, success: true });
  } catch (e) {
    // R19 security: log full error server-side, return generic message.
    // The previous `e.message` echo leaked stack traces / internal field
    // names to the browser on any unexpected throw.
    console.error("[/api/vendors/apply]", e);
    return NextResponse.json(
      { error: "שגיאה פנימית. נסה שוב בעוד רגע." },
      { status: 500 },
    );
  }
}
