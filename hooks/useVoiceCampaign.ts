"use client";

import { useCallback, useState } from "react";
import type { EventInfo, Guest } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import {
  isGuestEligibleForVoiceCall,
  type VoiceCampaignScope,
} from "@/lib/voiceRsvpFromCall";
import { normalizeIsraeliPhone } from "@/lib/phone";

export type { VoiceCampaignScope };

export interface VoiceCampaignResult {
  guestId: string;
  ok: boolean;
  error?: string;
  callId?: string;
}

export interface VoiceCampaignResponse {
  configured: boolean;
  message?: string;
  eligible: number;
  queued: number;
  failed: number;
  results: VoiceCampaignResult[];
}

function readErrorMessage(data: unknown, status: number): string {
  if (!data || typeof data !== "object") return `שגיאה ${status}`;
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message.trim()) return d.message;
  if (typeof d.error === "string") return d.error;
  if (typeof d.error === "object" && d.error !== null) {
    const nested = d.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return `שגיאה ${status}`;
}

function normalizeResponse(data: unknown): VoiceCampaignResponse {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    configured: d.configured === true,
    message: typeof d.message === "string" ? d.message : undefined,
    eligible: typeof d.eligible === "number" ? d.eligible : 0,
    queued: typeof d.queued === "number" ? d.queued : 0,
    failed: typeof d.failed === "number" ? d.failed : 0,
    results: Array.isArray(d.results) ? (d.results as VoiceCampaignResult[]) : [],
  };
}

export function useVoiceCampaign() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<VoiceCampaignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (
      event: EventInfo,
      guests: Guest[],
      scope: VoiceCampaignScope = "not_confirmed",
    ): Promise<VoiceCampaignResponse | null> => {
      setBusy(true);
      setError(null);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data: sessionData, error: sessionErr } =
              await supabase.auth.getSession();
            if (sessionErr) {
              console.warn("[useVoiceCampaign] getSession:", sessionErr.message);
            }
            const token = sessionData.session?.access_token;
            if (token) headers.Authorization = `Bearer ${token}`;
          }
        } catch (authErr) {
          console.warn("[useVoiceCampaign] auth read failed:", authErr);
        }

        const res = await fetch("/api/guests/voice-campaign/start", {
          method: "POST",
          headers,
          body: JSON.stringify({
            eventId: event.id,
            scope,
            event: {
              hostName: event.hostName ?? "",
              partnerName: event.partnerName,
              date: event.date,
              type: event.type,
            },
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
          setError(readErrorMessage(raw, res.status));
          setLast(null);
          return null;
        }

        setLast(data);
        return data;
      } catch (e) {
        console.error("[useVoiceCampaign]", e);
        setError("בעיית רשת — נסה שוב");
        setLast(null);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, last, error, start };
}

export function countVoiceEligible(
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
