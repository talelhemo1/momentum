import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEventReminderWhatsApp } from "@/lib/event-reminders";
import { hasEventUpdateTemplate } from "@/lib/whatsapp-templates";
import { buildRsvpUrl } from "@/lib/rsvpLinks";
import { formatEventDate } from "@/lib/format";
import type { EventInfo, Guest } from "@/lib/types";

/**
 * R94 — GET /api/cron/event-reminders
 *
 * Vercel Cron pings this daily (see vercel.json crons). It sends WhatsApp
 * reminders to guests who have ALREADY CONFIRMED, on two cadences:
 *   • reminder_7d — fired once when the event is ~a week out (2-7 days).
 *   • reminder_1d — fired once when the event is imminent (0-1 days).
 *
 * Architecture notes (spec adaptation):
 *   The spec assumed normalized `events` + `guests` tables. This project
 *   stores the whole user state as a JSON blob in `app_states.payload`,
 *   so we:
 *     1. Filter candidate rows in SQL by the event date window
 *        (`payload->event->>date`) so we don't scan every user.
 *     2. Iterate `payload.guests` in JS.
 *     3. NEVER write back to app_states (that would race the user's own
 *        edits — see lib/sync.ts). Idempotency lives in the append-only
 *        `reminder_log` table (see supabase/migrations/2026-05-29-...).
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` when the env
 * var is present (same gate as /api/send-scheduled).
 */

type ReminderKind = "reminder_7d" | "reminder_1d";

// Cap sends per invocation so a single run can't blow the function
// timeout on a huge confirmed list. The date windows span multiple days
// and reminder_log makes every send idempotent, so anything not reached
// this run is picked up tomorrow without duplication.
const SEND_BUDGET = 300;
const THROTTLE_MS = 120; // ~8 sends/sec — polite, well under Twilio's cap.

// maxDuration (60s) is declared in vercel.json's `functions` block, matching
// the /api/send-scheduled cron — kept there as the single source of truth.

interface PayloadEvent {
  id?: unknown;
  signingKey?: unknown;
  hostName?: unknown;
  partnerName?: unknown;
  synagogue?: unknown;
  city?: unknown;
  date?: unknown;
}
interface PayloadGuest {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  status?: unknown;
  rsvpToken?: unknown;
}
interface Payload {
  event?: PayloadEvent | null;
  guests?: PayloadGuest[] | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** YYYY-MM-DD for `d` in UTC (matches how event.date is stored). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from today (UTC) until the event date. */
function daysUntil(eventDate: string): number | null {
  const ev = new Date(eventDate);
  if (Number.isNaN(ev.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const evUtc = Date.UTC(ev.getUTCFullYear(), ev.getUTCMonth(), ev.getUTCDate());
  return Math.round((evUtc - todayUtc) / 86_400_000);
}

/** Which reminder applies for a given days-until, or null if none.
 *  Windows (not single days) so a missed cron run still catches up;
 *  reminder_log keeps each kind one-shot per guest. */
function kindFor(days: number): ReminderKind | null {
  if (days >= 0 && days <= 1) return "reminder_1d";
  if (days >= 2 && days <= 7) return "reminder_7d";
  return null;
}

export async function GET(req: NextRequest) {
  // 1. Auth.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
  }

  // 2. Nothing to do without an approved template — WhatsApp would drop
  // every out-of-window message silently. Bail clearly so the run is a
  // cheap no-op rather than 300 "failed" tallies.
  if (!hasEventUpdateTemplate()) {
    return NextResponse.json({ ok: true, skipped: "template_not_configured" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 503 },
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://moomentum.events").replace(
    /\/+$/,
    "",
  );

  // 3. Pull only users whose event date is within the next 7 days. ISO
  // "YYYY-MM-DD" strings sort lexicographically, so a string range works.
  const now = new Date();
  const minDate = ymd(now);
  const maxDate = ymd(new Date(now.getTime() + 7 * 86_400_000));

  const { data: rows, error } = (await admin
    .from("app_states")
    .select("user_id, payload")
    .gte("payload->event->>date", minDate)
    .lte("payload->event->>date", maxDate)
    .limit(2000)) as {
    data: { user_id: string; payload: Payload | null }[] | null;
    error: { message: string } | null;
  };

  if (error) {
    console.error("[cron/event-reminders] select failed:", error.message);
    return NextResponse.json({ error: "select_failed" }, { status: 500 });
  }

  const candidates = rows ?? [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let processedUsers = 0;

  for (const row of candidates) {
    if (sent >= SEND_BUDGET) break;

    const payload = row.payload;
    const ev = payload?.event;
    const guests = payload?.guests;
    if (!ev || !Array.isArray(guests)) continue;

    const dateStr = str(ev.date);
    const days = daysUntil(dateStr);
    if (days === null) continue;
    const kind = kindFor(days);
    if (!kind) continue;

    // Confirmed guests with a phone are the only reminder targets.
    const targets = guests.filter(
      (g) => g && g.status === "confirmed" && str(g.phone),
    );
    if (targets.length === 0) continue;

    processedUsers++;

    // Which of THIS user's guests already got THIS kind? One query per
    // in-window user (most users are filtered out before we get here).
    const { data: logRows } = (await admin
      .from("reminder_log")
      .select("guest_id")
      .eq("user_id", row.user_id)
      .eq("kind", kind)) as { data: { guest_id: string }[] | null };
    const alreadySent = new Set((logRows ?? []).map((r) => r.guest_id));

    const eventId = str(ev.id);
    const signingKey = str(ev.signingKey) || undefined;
    const hostName = str(ev.hostName);
    const hostNames = str(ev.partnerName)
      ? `${hostName} ו${str(ev.partnerName)}`
      : hostName;
    const venue =
      [str(ev.synagogue), str(ev.city)].filter(Boolean).join(" · ") || "פרטים בלינק";
    const dateText = formatEventDate(dateStr) || "פרטים בלינק";

    for (const g of targets) {
      if (sent >= SEND_BUDGET) break;
      const guestId = str(g.id);
      if (!guestId || alreadySent.has(guestId)) continue;

      let rsvpUrl = origin;
      try {
        rsvpUrl = await buildRsvpUrl(
          origin,
          { id: eventId, signingKey },
          { id: guestId, rsvpToken: str(g.rsvpToken) || undefined },
        );
      } catch {
        // Bad origin/event shape — fall back to the bare site URL so the
        // message still has a usable link rather than skipping the guest.
      }

      const result = await sendEventReminderWhatsApp({
        guestPhone: str(g.phone),
        guestName: str(g.name),
        hostNames,
        date: dateText,
        venue,
        rsvpUrl,
      });

      if (result.status === "sent") {
        sent++;
        // Record AFTER a confirmed accept so a failed send can retry
        // tomorrow. ON CONFLICT keeps it safe against a double run.
        await admin
          .from("reminder_log")
          .upsert(
            { user_id: row.user_id, guest_id: guestId, kind },
            { onConflict: "user_id,guest_id,kind", ignoreDuplicates: true },
          );
      } else if (result.status === "skip") {
        skipped++;
      } else {
        failed++;
        console.error(
          `[cron/event-reminders] send failed user=${row.user_id} guest=${guestId} kind=${kind}: ${result.detail ?? ""}`,
        );
      }

      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  return NextResponse.json({
    ok: true,
    inWindow: candidates.length,
    processedUsers,
    sent,
    failed,
    skipped,
  });
}
