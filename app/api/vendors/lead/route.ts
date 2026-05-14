import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyVendorOfNewLead } from "@/lib/vendorNotificationsRich";

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
    if (!body.vendor_slug?.trim()) {
      return NextResponse.json({ error: "Missing vendor_slug" }, { status: 400 });
    }

    // Look up the vendor by slug. RLS on `vendor_landings` allows reads
    // for any published landing, so this works under the couple's JWT.
    const { data: landing } = (await supabase
      .from("vendor_landings")
      .select("id, slug, name, owner_user_id, phone, email")
      .eq("slug", body.vendor_slug)
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

    const insertPayload = {
      vendor_id: landing.slug,
      couple_user_id: user.id,
      couple_name: body.couple_name?.trim() || user.email?.split("@")[0] || null,
      couple_email: body.couple_email?.trim() || user.email || null,
      couple_phone: body.couple_phone?.trim() || null,
      message: body.message?.trim() || null,
      source: body.source ?? "contact_button",
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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const dashboardUrl = siteUrl
      ? `${siteUrl}/vendors/dashboard/leads`
      : "/vendors/dashboard/leads";
    void notifyVendorOfNewLead({
      vendorPhone: landing.phone,
      vendorEmail: landing.email,
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
