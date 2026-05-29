"use client";

import { useCallback, useState } from "react";
import type { EventInfo, Guest } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { actions } from "@/lib/store";
import {
  isGuestEligibleForVoiceCall,
  type VoiceCampaignScope,
} from "@/lib/voiceRsvpFromCall";
import { normalizeIsraeliPhone } from "@/lib/phone";

export type { VoiceCampaignScope as WhatsAppRsvpScope };

export interface WhatsAppRsvpResult {
  guestId: string;
  ok: boolean;
  error?: string;
}

export interface WhatsAppRsvpResponse {
  configured: boolean;
  message?: string;
  eligible: number;
  sent: number;
  failed: number;
  results: WhatsAppRsvpResult[];
}

function normalizeResponse(data: unknown): WhatsAppRsvpResponse {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    configured: d.configured === true,
    message: typeof d.message === "string" ? d.message : undefined,
    eligible: typeof d.eligible === "number" ? d.eligible : 0,
    sent: typeof d.sent === "number" ? d.sent : 0,
    failed: typeof d.failed === "number" ? d.failed : 0,
    results: Array.isArray(d.results) ? (d.results as WhatsAppRsvpResult[]) : [],
  };
}

export function useWhatsAppRsvp() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<WhatsAppRsvpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (
      event: EventInfo,
      guests: Guest[],
      scope: VoiceCampaignScope = "not_confirmed",
    ): Promise<WhatsAppRsvpResponse | null> => {
      setBusy(true);
      setError(null);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const supabase = getSupabase();
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) headers.Authorization = `Bearer ${token}`;
        }

        const coupleNames =
          event.partnerName?.trim()
            ? `${event.hostName} ו${event.partnerName}`
            : event.hostName;

        const res = await fetch("/api/whatsapp/send-rsvp", {
          method: "POST",
          headers,
          body: JSON.stringify({
            eventId: event.id,
            scope,
            coupleNames,
            guests: guests.map((g) => ({
              id: g.id,
              name: g.name,
              phone: g.phone,
              status: g.status,
            })),
          }),
        });

        let raw: unknown;
        try {
          raw = await res.json();
        } catch {
          raw = null;
        }

        const data = normalizeResponse(raw);

        if (!res.ok) {
          const errObj = raw as Record<string, unknown> | null;
          const msg =
            typeof errObj?.message === "string"
              ? errObj.message
              : typeof errObj?.error === "string"
                ? errObj.error
                : `שגיאה ${res.status}`;
          setError(msg);
          setLast(null);
          return null;
        }

        const sentIds = data.results.filter((r) => r.ok).map((r) => r.guestId);
        if (sentIds.length > 0) {
          actions.markWhatsAppRsvpSent(sentIds);
        }

        setLast(data);
        return data;
      } catch (e) {
        console.error("[useWhatsAppRsvp]", e);
        setError("בעיית רשת — נסה שוב");
        setLast(null);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, last, error, send };
}

export function countWhatsAppRsvpEligible(
  guests: Guest[],
  scope: VoiceCampaignScope,
): number {
  return guests.filter((g) => {
    const { valid } = normalizeIsraeliPhone(g.phone);
    if (!valid) return false;
    if (scope === "all_with_phone") return true;
    return isGuestEligibleForVoiceCall(g.status);
  }).length;
}
