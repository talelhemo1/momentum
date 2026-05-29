"use client";

import { useMemo, useState } from "react";
import { X, Phone, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import type { EventInfo, Guest } from "@/lib/types";
import {
  countVoiceEligible,
  useVoiceCampaign,
  type VoiceCampaignScope,
} from "@/hooks/useVoiceCampaign";

export function VoiceCampaignModal({
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
  const [scope, setScope] = useState<VoiceCampaignScope>("not_confirmed");
  const { busy, last, error, start } = useVoiceCampaign();

  const eligible = useMemo(
    () => countVoiceEligible(guests, scope),
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
        `להתחיל שיחות אוטומטיות ל-${eligible} מוזמנים?\n\nהשיחה תהיה קצרה (~30 שניות) דרך NLPearl. תוצאות יעדכנו את סטטוס ההגעה אוטומטית כשהשיחה מצליחה.`,
      )
    ) {
      return;
    }
    try {
      await start(event, guests, scope);
    } catch (e) {
      console.error("[VoiceCampaignModal]", e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-labelledby="voice-campaign-title"
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
          <div className="w-11 h-11 rounded-full bg-sky-500/20 text-sky-300 inline-flex items-center justify-center">
            <Phone size={22} />
          </div>
          <div>
            <h2 id="voice-campaign-title" className="text-xl font-bold">
              שיחות אוטומטיות (NLPearl)
            </h2>
            <p className="text-sm text-white/55 mt-0.5">
              בדיקת הגעה בשיחה קצרה — ליד שליחת וואטסאפ
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm text-white/70 leading-relaxed">
          השיחה תשאל בקצרה אם מגיעים ל{couple ? ` חתונת ${couple}` : " האירוע"}, כולל
          מספר נפשות כשאפשר. מי שכבר אישר/ה הגעה לא ייכלל (אלא אם תבחרו &quot;כל
          מי שיש לו טלפון&quot;).
        </p>

        <fieldset className="mt-5 space-y-2">
          <legend className="text-sm font-medium text-white/80 mb-2">
            למי לחייג?
          </legend>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="voice-scope"
              checked={scope === "not_confirmed"}
              onChange={() => setScope("not_confirmed")}
            />
            מי שלא אישר/ה הגעה (
            <span className="ltr-num">{countVoiceEligible(guests, "not_confirmed")}</span>
            )
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="voice-scope"
              checked={scope === "all_with_phone"}
              onChange={() => setScope("all_with_phone")}
            />
            כל מי שיש לו טלפון תקין (
            <span className="ltr-num">{countVoiceEligible(guests, "all_with_phone")}</span>
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
              borderColor: last.configured ? "rgba(56,189,248,0.35)" : "rgba(212,176,104,0.35)",
              background: last.configured
                ? "rgba(56,189,248,0.08)"
                : "rgba(212,176,104,0.08)",
            }}
          >
            {!last.configured ? (
              <>
                <p className="font-medium text-amber-200/90">NLPearl עדיין לא מחוכן</p>
                <p className="text-white/65">{last.message}</p>
                <p className="text-white/55">
                  מוזמנים מתאימים לשיחה:{" "}
                  <span className="ltr-num">{last.eligible}</span>
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-emerald-300/90 font-medium">
                  <CheckCircle2 size={16} />
                  קמפיין הופעל
                </p>
                <p className="text-white/70">
                  בתור: <span className="ltr-num">{last.queued ?? 0}</span>
                  {(last.failed ?? 0) > 0 && (
                    <>
                      {" "}
                      · נכשלו: <span className="ltr-num">{last.failed}</span>
                    </>
                  )}
                </p>
                <p className="text-white/55 text-xs">
                  עדכון RSVP אוטומטי יגיע אחרי סיום השיחות (webhook). תא קולי / לא
                  ענה — ללא ניסיון חוזר.
                </p>
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
              <Phone size={18} />
            )}
            {busy ? "מפעיל..." : `התחל שיחות (${eligible})`}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
