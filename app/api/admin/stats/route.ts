import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin dashboard aggregates.
 *
 * Two clients are needed:
 *
 *   - `userClient` (anon key + user's JWT) — proves who's calling, hits
 *     `admin_emails` under RLS so non-admins can't fake-bypass.
 *   - `adminClient` (service role) — counts across every user's row.
 *     Tables like `app_states` / `assistant_messages` / `event_receipts`
 *     all have `auth.uid() = user_id` RLS, so the user client returns
 *     only the admin's own rows. Service role bypasses RLS.
 *
 * The service role key must be added to .env.local as
 * `SUPABASE_SERVICE_ROLE_KEY` for the heavy counters to work. Without it
 * we return 503 with a clear error so the admin knows what to add.
 */

interface AdminStats {
  users: {
    total: number;
    new_today: number;
    new_this_week: number;
    new_this_month: number;
    active_last_24h: number;
  };
  events: {
    total: number;
    active: number;
    new_this_week: number;
  };
  vendors: {
    total_applications: number;
    pending: number;
    approved: number;
    rejected: number;
    paid_tier: number;
    landings_published: number;
  };
  reviews: {
    total: number;
    avg_rating: number;
    new_this_week: number;
  };
  managers: {
    total_invited: number;
    total_accepted: number;
    arrivals_logged: number;
  };
  receipts: {
    total: number;
    total_amount_agorot: number;
  };
  assistant: {
    total_messages: number;
    messages_today: number;
    total_cost_cents: number;
  };
  recent_activity: Array<{
    id: string;
    type: string;
    label: string;
    timestamp: string;
  }>;
}

interface AuthUser {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
}

interface PageOfUsers {
  users: AuthUser[];
  aud?: string;
}

async function listAllUsers(adminClient: SupabaseClient): Promise<AuthUser[]> {
  // The admin API paginates at 1000 per page. For a small project this
  // is one or two pages — keep going until we get a short page back.
  const out: AuthUser[] = [];
  let page = 1;
  // Hard ceiling so a misconfiguration can't spin forever.
  while (page < 50) {
    const { data, error } = (await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    })) as { data: PageOfUsers | null; error: { message: string } | null };
    if (error || !data) break;
    out.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 503 },
      );
    }

    // Auth — same pattern as /api/vendors/admin/decide.
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userToken = auth.slice(7);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: adminCheck } = (await userClient
      .from("admin_emails")
      .select("email")
      .eq("email", user.email)
      .maybeSingle()) as { data: { email: string } | null };
    if (!adminCheck) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY חסר ב-.env.local — נדרש כדי לקרוא נתונים חוצי משתמשים. הוסף אותו והפעל מחדש את ה-dev server.",
        },
        { status: 503 },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const dayAgo = new Date(now);
    dayAgo.setDate(dayAgo.getDate() - 1);

    // ─── USERS — via Supabase Auth admin API (no RLS to fight) ───
    const allUsers = await listAllUsers(adminClient);
    const usersTotal = allUsers.length;
    const newToday = allUsers.filter(
      (u) => u.created_at && new Date(u.created_at) >= today,
    ).length;
    const newWeek = allUsers.filter(
      (u) => u.created_at && new Date(u.created_at) >= weekAgo,
    ).length;
    const newMonth = allUsers.filter(
      (u) => u.created_at && new Date(u.created_at) >= monthAgo,
    ).length;
    const active24h = allUsers.filter(
      (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) >= dayAgo,
    ).length;

    // ─── EVENTS (via app_states which has one row per user with event) ───
    // The payload is a JSON blob; we count rows + filter by created/updated.
    const eventsRes = (await adminClient
      .from("app_states")
      .select("user_id, updated_at", { count: "exact" })) as {
      data: { user_id: string; updated_at: string }[] | null;
      count: number | null;
    };
    const eventsTotal = eventsRes.count ?? 0;
    const eventsActive = (eventsRes.data ?? []).filter(
      (e) => e.updated_at && new Date(e.updated_at) >= monthAgo,
    ).length;
    const eventsNewWeek = (eventsRes.data ?? []).filter(
      (e) => e.updated_at && new Date(e.updated_at) >= weekAgo,
    ).length;

    // ─── VENDORS ───
    const [
      appsRes,
      pendingRes,
      approvedRes,
      rejectedRes,
      landingsRes,
    ] = await Promise.all([
      adminClient
        .from("vendor_applications")
        .select("id", { count: "exact", head: true }),
      adminClient
        .from("vendor_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      adminClient
        .from("vendor_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      adminClient
        .from("vendor_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
      adminClient
        .from("vendor_landings")
        .select("id", { count: "exact", head: true })
        .eq("landing_published", true),
    ]);

    // ─── REVIEWS ───
    const [reviewsCount, reviewsWeekRes, reviewsAvgRes] = await Promise.all([
      adminClient
        .from("vendor_reviews")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      adminClient
        .from("vendor_reviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString()),
      adminClient
        .from("vendor_reviews")
        .select("overall_rating")
        .eq("is_published", true),
    ]);
    const ratings = ((reviewsAvgRes.data ?? []) as { overall_rating: number }[])
      .map((r) => r.overall_rating)
      .filter((n): n is number => typeof n === "number");
    const avgRating =
      ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;

    // ─── MANAGERS ───
    const [managersInvitedRes, managersAcceptedRes, arrivalsRes] = await Promise.all([
      adminClient
        .from("event_managers")
        .select("id", { count: "exact", head: true }),
      adminClient
        .from("event_managers")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted"),
      adminClient
        .from("guest_arrivals")
        .select("id", { count: "exact", head: true }),
    ]);

    // ─── RECEIPTS ───
    const [receiptsCount, receiptsSumRes] = await Promise.all([
      adminClient
        .from("event_receipts")
        .select("id", { count: "exact", head: true }),
      adminClient.from("event_receipts").select("total_amount"),
    ]);
    const receiptsTotal = (
      (receiptsSumRes.data ?? []) as { total_amount: number | null }[]
    ).reduce((s, r) => s + (r.total_amount ?? 0), 0);

    // ─── ASSISTANT ───
    const [aiTotal, aiTodayRes, aiCostRes] = await Promise.all([
      adminClient
        .from("assistant_messages")
        .select("id", { count: "exact", head: true }),
      adminClient
        .from("assistant_messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      adminClient.from("assistant_messages").select("cost_cents"),
    ]);
    const aiCostTotal = (
      (aiCostRes.data ?? []) as { cost_cents: number | null }[]
    ).reduce((s, m) => s + (m.cost_cents ?? 0), 0);

    // ─── RECENT ACTIVITY ───
    const [recentVendors, recentReviews, recentManagers] = await Promise.all([
      adminClient
        .from("vendor_applications")
        .select("business_name, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      adminClient
        .from("vendor_reviews")
        .select("vendor_name, overall_rating, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      adminClient
        .from("event_managers")
        .select("invitee_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const activity: AdminStats["recent_activity"] = [];
    // R12 §2J — stable `id` per row so the React list key doesn't collide
    // when two rows happen to share a label (e.g. two managers with the
    // same name created at different times).
    let idCounter = 0;
    for (const v of (recentVendors.data ?? []) as {
      business_name: string;
      created_at: string;
    }[]) {
      activity.push({
        id: `vendor_apply-${idCounter++}-${v.created_at}`,
        type: "vendor_apply",
        label: `ספק חדש: ${v.business_name}`,
        timestamp: v.created_at,
      });
    }
    for (const r of (recentReviews.data ?? []) as {
      vendor_name: string;
      overall_rating: number;
      created_at: string;
    }[]) {
      activity.push({
        id: `review-${idCounter++}-${r.created_at}`,
        type: "review",
        label: `דירוג ${r.overall_rating}⭐ ל-${r.vendor_name}`,
        timestamp: r.created_at,
      });
    }
    for (const m of (recentManagers.data ?? []) as {
      invitee_name: string;
      status: string;
      created_at: string;
    }[]) {
      activity.push({
        id: `manager-${idCounter++}-${m.created_at}`,
        type: "manager",
        label: `מנהל הוזמן: ${m.invitee_name}`,
        timestamp: m.created_at,
      });
    }
    activity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const stats: AdminStats = {
      users: {
        total: usersTotal,
        new_today: newToday,
        new_this_week: newWeek,
        new_this_month: newMonth,
        active_last_24h: active24h,
      },
      events: {
        total: eventsTotal,
        active: eventsActive,
        new_this_week: eventsNewWeek,
      },
      vendors: {
        total_applications: appsRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
        // No payment_status column yet; left at 0 so the UI shows "—".
        paid_tier: 0,
        landings_published: landingsRes.count ?? 0,
      },
      reviews: {
        total: reviewsCount.count ?? 0,
        avg_rating: Math.round(avgRating * 10) / 10,
        new_this_week: reviewsWeekRes.count ?? 0,
      },
      managers: {
        total_invited: managersInvitedRes.count ?? 0,
        total_accepted: managersAcceptedRes.count ?? 0,
        arrivals_logged: arrivalsRes.count ?? 0,
      },
      receipts: {
        total: receiptsCount.count ?? 0,
        total_amount_agorot: receiptsTotal,
      },
      assistant: {
        total_messages: aiTotal.count ?? 0,
        messages_today: aiTodayRes.count ?? 0,
        total_cost_cents: aiCostTotal,
      },
      recent_activity: activity.slice(0, 15),
    };

    return NextResponse.json(stats);
  } catch (e) {
    // R12 §1F — don't leak Postgres / Supabase message contents to the
    // client; they can include schema names, RLS policy text, or column
    // hints. Log the full error server-side and return a generic.
    console.error("[/api/admin/stats]", e);
    return NextResponse.json(
      { error: "שגיאה פנימית. בדוק את הלוגים בשרת." },
      { status: 500 },
    );
  }
}
