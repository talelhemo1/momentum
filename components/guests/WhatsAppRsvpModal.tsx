"use client";

import { useMemo, useState } from "react";
import { X, MessageCircle, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import type { EventInfo, Guest } from "@/lib/types";
import {
  countWhatsAppRsvpEligible,
  useWhatsAppRsvp,
  type WhatsAppRsvpScope,
} from "@/hooks/useWhatsAppRsvp";

export function WhatsAppRsvpModal({
  open,
  onClose,
  guests,
  event,
}: {
  open: boolean;
  onClose: () => void;
  guests: Guest[];
  event: EventInfo;
}) {
  const [scope, setScope] = useState<WhatsAppRsvpScope>("not_confirmed");
  const { busy, last, error, send } = useWhatsAppRsvp();

  const eligible = useMemo(
    () => countWhatsAppRsvpEligible(guests, scope),
    [guests, scope],
  );

  if (!open) return null;

  const couple =
    event.partnerName?.trim()
      ? `${event.hostName} ו${event.partnerName}`
      : event.hostName;

  const run = async () => {
    if (eligible === 0) return;
    if (
      !window.confirm(
        `לשלוח הודעות WhatsApp רשמיות עם כפתורי תגובה ל-${eligible} מוזמנים?\n\nנדרש תבנית מאושרת ב-Meta. תשובות יעדכנו את הרשימה בזמן אמת.`,
      )
    ) {
      return;
    }
    try {
      await send(event, guests, scope);
    } catch (e) {
      console.error("[WhatsAppRsvpModal]", e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-labelledby="wa-rsvp-title"
    >
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 w-9 h-9 rounded-full border border-white/15 hover:bg-white/5 inline-flex items-center justify-center"
          aria-label="סגור"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mt-1">
          <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-300 inline-flex items-center justify-center">
            <MessageCircle size={22} />
          </div>
          <div>
            <h2 id="wa-rsvp-title" className="text-xl font-bold">
              שלח אישורי הגעה (WhatsApp)
            </h2>
            <p className="text-sm text-white/55 mt-0.5">
              תבנית רשמית עם 3 כפתורי תגובה — מגיע / לא / עדיין לא החלטתי
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm text-white/70 leading-relaxed">
          המערכת שולחת הודעה אוטומטית ל{couple ? ` חתונת ${couple}` : " האירוע"}.
          תשובת המוזמן מעדכנת את הדשבורד מיד (דרך webhook).
        </p>

        <fieldset className="mt-5 space-y-2">
          <legend className="text-sm font-medium text-white/80 mb-2">
            למי לשלוח?
          </legend>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="wa-rsvp-scope"
              checked={scope === "not_confirmed"}
              onChange={() => setScope("not_confirmed")}
            />
            מי שלא אישר/ה הגעה (
            <span className="ltr-num">{countWhatsAppRsvpEligible(guests, "not_confirmed")}</span>
            )
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="wa-rsvp-scope"
              checked={scope === "all_with_phone"}
              onChange={() => setScope("all_with_phone")}
            />
            כל מי שיש לו טלפון תקין (
            <span className="ltr-num">{countWhatsAppRsvpEligible(guests, "all_with_phone")}</span>
            )
          </label>
        </fieldset>

        {error && (
          <p className="mt-4 text-sm text-red-300 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {last && (
          <div
            className="mt-4 p-4 rounded-2xl border text-sm space-y-2"
            style={{
              borderColor: last.configured ? "rgba(52,211,153,0.35)" : "rgba(212,176,104,0.35)",
              background: last.configured
                ? "rgba(52,211,153,0.08)"
                : "rgba(212,176,104,0.08)",
            }}
          >
            {!last.configured ? (
              <>
                <p className="font-medium text-amber-200/90">WhatsApp Business לא מחובר</p>
                <p className="text-white/65">{last.message}</p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-emerald-300/90 font-medium">
                  <CheckCircle2 size={16} />
                  נשלחו {last.sent} הודעות
                </p>
                {(last.failed ?? 0) > 0 && (
                  <p className="text-white/55">
                    נכשלו: <span className="ltr-num">{last.failed}</span>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={run}
            disabled={busy || eligible === 0}
            className="btn-gold inline-flex items-center gap-2 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <MessageCircle size={18} />
            )}
            {busy ? "שולח..." : `שלח אישורי הגעה (${eligible})`}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
