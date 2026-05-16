import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const userToken = auth.slice(7);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify the user is on the admin list. RLS on `admin_emails` only
    // surfaces the row when the JWT email matches, so a `.single()` returning
    // null is the rejection signal.
    const { data: adminCheck } = await supabase
      .from("admin_emails")
      .select("email")
      .eq("email", user.email)
      .single();

    if (!adminCheck) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { applicationId, decision, rejectionReason } = (await req.json()) as {
      applicationId: string;
      decision: "approved" | "rejected";
      rejectionReason?: string;
    };

    if (!applicationId || !["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      status: decision,
      reviewed_at: new Date().toISOString(),
    };
    if (decision === "rejected" && rejectionReason) {
      updates.rejection_reason = rejectionReason;
    }
    // R38 — the catalog is now table-backed: /vendors reads approved
    // applications via the list_approved_vendors RPC and maps each to a
    // Vendor with id `app-<application id>`. Stamp that id here so the
    // application is marked "synced to catalog" (clears the admin
    // "approved but not in catalog" warning) — no separate vendors
    // table needed; the row IS the catalog source.
    if (decision === "approved") {
      updates.approved_vendor_id = `app-${applicationId}`;
    }

    // Catalog integration — Phase 0 quirk:
    //
    // The customer-facing catalog (`lib/vendors.ts`) is a STATIC TypeScript
    // array, not a Supabase table. There's nothing to insert into at the
    // moment of approval. We:
    //   1. Mark the application as approved.
    //   2. Leave `approved_vendor_id` null until the catalog moves to a
    //      table-backed source. When that happens, the admin route will
    //      insert into the new table here and stamp the resulting id.
    //
    // TODO(catalog): once a `vendors` table exists, insert here:
    //   const { data: vendorRow } = await supabase.from("vendors").insert({...}).select("id").single();
    //   updates.approved_vendor_id = vendorRow?.id ?? null;
    //
    // Mapping reference (vendorApplication.category → VendorType in
    // lib/types.ts):
    //   "music-dj" → "dj" (band → also dj for now; collapse on import)
    //   "bridal", "groomswear" → "dress"
    //   "makeup-hair" → "makeup"
    //   "invitations" → "stationery"
    //   "transport" → "transportation"
    //   "chuppah" → "designer"
    //   everything else maps 1:1 by id.

    // Race protection: only update rows still pending. Two admins clicking
    // at the same time used to cause the second to silently overwrite the
    // first. The `eq("status", "pending")` clause filters out any row that
    // already moved on, and we treat "0 affected rows" as a 409 conflict.
    const { data: updated, error: updateErr } = await supabase
      .from("vendor_applications")
      .update(updates)
      .eq("id", applicationId)
      .eq("status", "pending")
      .select("id");

    if (updateErr) {
      return NextResponse.json({ error: "פעולה נכשלה" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "הבקשה כבר אושרה/נדחתה" }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    // R19 security: full error stays in server logs, generic message to client.
    console.error("[/api/vendors/admin/decide]", e);
    return NextResponse.json(
      { error: "פעולה נכשלה" },
      { status: 500 },
    );
  }
}
