import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyVendorOfNewLead } from "@/lib/vendorNotificationsRich";
import { normalizeIsraeliPhone } from "@/lib/phone";

// R14.2 security — input caps. Sized to comfortably fit legit usage
// while rejecting megabyte-scale junk that floods the DB and the SMS
// gateway downstream.
const MAX_SLUG_LEN = 100;
const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 254; // RFC 5321 / 5322
const MAX_PHONE_LEN = 32; // pre-normalization; the normalizer strips noise
const MAX_MESSAGE_LEN = 2000;
const SLUG_RE = /^[a-z0-9-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/vendors/lead
 *
 * Body: { vendor_slug: string; message?: string; source?: string;
 *         couple_name?: string; couple_phone?: string; couple_email?: string }
 * Auth: Bearer <supabase access token>
 *
 * Creates a row in `vendor_leads` and fires SMS+email to the vendor.
 * Notification failures don't block the lead — the vendor will see it
 * in the dashboard either way.
 */

interface LeadRequestBody {
  vendor_slug: string;
  message?: string;
  source?: "saved" | "contact_button" | "whatsapp_click" | "manual";
  couple_name?: string;
  couple_phone?: string;
  couple_email?: string;
}

interface VendorLandingRow {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string;
  phone: string | null;
  email: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${auth.slice(7)}` } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as LeadRequestBody;

    // R14.2 — validate / cap every user-controlled field. The DB would
    // accept arbitrarily long strings (no column length cap in our
    // schema) and the downstream SMS/email gateway would happily
    // forward them. Cap at ingest time.
    const vendorSlug = body.vendor_slug?.trim() ?? "";
    if (!vendorSlug) {
      return NextResponse.json({ error: "Missing vendor_slug" }, { status: 400 });
    }
    if (vendorSlug.length > MAX_SLUG_LEN || !SLUG_RE.test(vendorSlug)) {
      return NextResponse.json({ error: "Invalid vendor_slug" }, { status: 400 });
    }

    const coupleName = body.couple_name?.trim().slice(0, MAX_NAME_LEN) || null;
    const coupleEmailRaw = body.couple_email?.trim().slice(0, MAX_EMAIL_LEN) || null;
    if (coupleEmailRaw && !EMAIL_RE.test(coupleEmailRaw)) {
      return NextResponse.json({ error: "Invalid couple_email" }, { status: 400 });
    }
    const couplePhoneRaw = body.couple_phone?.trim().slice(0, MAX_PHONE_LEN) || null;
    let couplePhoneNormalized: string | null = null;
    if (couplePhoneRaw) {
      const norm = normalizeIsraeliPhone(couplePhoneRaw);
      // Only persist if we can normalize; otherwise drop quietly rather
      // than rejecting (phone is optional). Avoids leaking "your phone
      // failed our regex" UX while still preventing junk-as-recipient
      // downstream.
      couplePhoneNormalized = norm.valid ? `+${norm.phone}` : null;
    }
    const message = body.message?.trim().slice(0, MAX_MESSAGE_LEN) || null;

    // Look up the vendor by slug. RLS on `vendor_landings` allows reads
    // for any published landing, so this works under the couple's JWT.
    const { data: landing } = (await supabase
      .from("vendor_landings")
      .select("id, slug, name, owner_user_id, phone, email")
      .eq("slug", vendorSlug)
      .eq("landing_published", true)
      .maybeSingle()) as { data: VendorLandingRow | null };

    if (!landing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Don't allow a vendor to send themselves a lead. Both protects
    // against test-data noise and prevents the unique constraint from
    // blocking the vendor's own future re-engagement.
    if (landing.owner_user_id === user.id) {
      return NextResponse.json(
        { error: "Can't send a lead to yourself" },
        { status: 400 },
      );
    }

    // Allow-list the source — the DB column has no CHECK so a malicious
    // client could otherwise store arbitrary tags here.
    const allowedSources: ReadonlyArray<NonNullable<LeadRequestBody["source"]>> = [
      "saved",
      "contact_button",
      "whatsapp_click",
      "manual",
    ];
    const source: NonNullable<LeadRequestBody["source"]> = allowedSources.includes(
      body.source as never,
    )
      ? (body.source as NonNullable<LeadRequestBody["source"]>)
      : "contact_button";

    const insertPayload = {
      vendor_id: landing.slug,
      couple_user_id: user.id,
      couple_name: coupleName || user.email?.split("@")[0] || null,
      couple_email: coupleEmailRaw || user.email || null,
      couple_phone: couplePhoneNormalized,
      message,
      source,
    };

    const { data: inserted, error } = (await supabase
      .from("vendor_leads")
      .insert(insertPayload as unknown as never)
      .select("id")
      .single()) as {
      data: { id: string } | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      // 23505 = unique_violation = couple already has an open lead with
      // this vendor. Surface friendly Hebrew instead of Postgres-speak.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "כבר שלחת התעניינות לספק הזה. המתן לתגובה." },
          { status: 409 },
        );
      }
      // P0001 = raised by check_vendor_lead_rate when the user exceeds
      // 30 lead creations per hour. Surface as 429, not 500.
      if (error.code === "P0001") {
        return NextResponse.json(
          { error: "יותר מדי בקשות התעניינות. נסה שוב בעוד שעה." },
          { status: 429 },
        );
      }
      console.error("[/api/vendors/lead]", error);
      return NextResponse.json(
        { error: "שמירת הליד נכשלה. נסה שוב." },
        { status: 500 },
      );
    }

    // Fire notifications best-effort. We DON'T await — the response
    // shouldn't depend on Twilio/Resend latency. (Vercel keeps the
    // function alive for a few seconds after response so the promise
    // resolves; if it doesn't, the lead is still in the DB.)
    //
    // R14.2 — `landing.phone` / `landing.email` are vendor-edited and
    // therefore untrusted. Validate shape before handing off to the
    // notification gateway so a malicious vendor can't smuggle junk
    // (or third-party numbers) as the SMS/email destination.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const dashboardUrl = siteUrl
      ? `${siteUrl}/vendors/dashboard/leads`
      : "/vendors/dashboard/leads";
    const safeVendorPhone = (() => {
      if (!landing.phone) return null;
      const n = normalizeIsraeliPhone(landing.phone);
      return n.valid ? `+${n.phone}` : null;
    })();
    const safeVendorEmail =
      landing.email && EMAIL_RE.test(landing.email.trim())
        ? landing.email.trim()
        : null;
    void notifyVendorOfNewLead({
      vendorPhone: safeVendorPhone,
      vendorEmail: safeVendorEmail,
      coupleName: insertPayload.couple_name ?? "זוג",
      coupleMessage: insertPayload.message,
      dashboardUrl,
    });

    return NextResponse.json({ id: inserted?.id, vendor_name: landing.name });
  } catch (e) {
    console.error("[/api/vendors/lead]", e);
    return NextResponse.json(
      { error: "שגיאה פנימית. נסה שוב." },
      { status: 500 },
    );
  }
}
