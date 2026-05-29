"use client";

import { useCallback, useState } from "react";
import type { EventInfo, Guest, SeatingTable } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

export function useWhatsAppSeating() {
  const [busy, setBusy] = useState(false);

  const sendSeating = useCallback(
    async (
      event: EventInfo,
      guests: Guest[],
      tables: SeatingTable[],
      seatAssignments: Record<string, string>,
    ) => {
      setBusy(true);
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

        const tableById = new Map(tables.map((t) => [t.id, t]));
        const payload = guests
          .filter((g) => g.status === "confirmed" && seatAssignments[g.id])
          .map((g) => {
            const tableId = seatAssignments[g.id]!;
            const table = tableById.get(tableId);
            const num =
              table?.number ??
              (table ? tables.findIndex((t) => t.id === tableId) + 1 : 0);
            const label = table?.name
              ? `שולחן ${num} — ${table.name}`
              : `שולחן ${num}`;
            return {
              id: g.id,
              name: g.name,
              phone: g.phone,
              tableLabel: label,
            };
          });

        if (payload.length === 0) {
          return { ok: false, error: "no_confirmed_seated" as const };
        }

        const res = await fetch("/api/whatsapp/send-seating", {
          method: "POST",
          headers,
          body: JSON.stringify({ eventId: event.id, guests: payload }),
        });

        const data = (await res.json()) as {
          configured?: boolean;
          sent?: number;
          failed?: number;
          message?: string;
          error?: string;
        };

        if (!res.ok) {
          return { ok: false, error: data.error ?? `http_${res.status}` };
        }

        return {
          ok: true,
          configured: data.configured !== false,
          sent: data.sent ?? 0,
          failed: data.failed ?? 0,
          message: data.message,
        };
      } catch (e) {
        console.error("[useWhatsAppSeating]", e);
        return { ok: false, error: "network" };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, sendSeating };
}
