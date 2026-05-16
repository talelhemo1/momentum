"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * R32 — live invitation-open feed for the couple's dashboard.
 *
 * Initial fetch (latest 100) + a realtime INSERT subscription filtered
 * to this event. New rows are prepended so the newest open is first.
 * No-ops gracefully when Supabase isn't configured (returns []).
 */
export interface InvitationView {
  id: string;
  event_id: string;
  short_id: string | null;
  guest_id: string | null;
  guest_name: string | null;
  viewed_at: string;
  user_agent: string | null;
  ip_hash: string | null;
}

export function useInvitationViews(
  eventId: string | undefined,
): InvitationView[] {
  const [views, setViews] = useState<InvitationView[]>([]);

  useEffect(() => {
    if (!eventId) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from("invitation_views")
        .select("*")
        .eq("event_id", eventId)
        .order("viewed_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      setViews((data ?? []) as InvitationView[]);
    })();

    const channel = supabase
      .channel(`event-${eventId}-views`)
      .on(
        // invitation_views isn't in a generated Database type — same
        // `as never` cast LiveModeView uses for guest_arrivals.
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "invitation_views",
          filter: `event_id=eq.${eventId}`,
        } as never,
        (payload: { new: InvitationView }) => {
          setViews((prev) => {
            // Realtime can re-deliver; dedupe by id.
            if (prev.some((v) => v.id === payload.new.id)) return prev;
            return [payload.new, ...prev].slice(0, 100);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  return views;
}
