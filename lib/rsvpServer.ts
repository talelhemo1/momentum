import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { GuestStatus } from "@/lib/types";

/**
 * Server-side RSVP upsert (service role) — used by NLPearl webhooks so
 * the host dashboard picks up changes via Supabase realtime.
 */
export async function upsertRsvpFromServer(input: {
  eventId: string;
  guestId: string;
  status: GuestStatus;
  attendingCount: number;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, error: "supabase_not_configured" };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("rsvps").upsert(
    {
      event_id: input.eventId,
      guest_id: input.guestId,
      status: input.status,
      attending_count: input.attendingCount,
      notes: input.notes ?? null,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "guest_id" },
  );

  if (error) {
    console.error("[rsvpServer] upsert failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
