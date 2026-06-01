"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Phone, Loader2, AlertCircle, CheckCircle2, FlaskConical } from "lucide-react";
import type { EventInfo, Guest } from "@/lib/types";
import {
  countVoiceEligible,
  countVoiceTestEligible,
  fetchVoiceCampaignConfig,
  useVoiceCampaign,
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
  const { busy, last, error, start } = useVoiceCampaign();
  const [testBypassAvailable, setTestBypassAvailable] = useState(false);

  const eligible = useMemo(() => countVoiceEligible(guests), [guests]);
  const testEligible = useMemo(() => countVoiceTestEligible(guests), [guests]);

  useEffect(() => {
    if (!open) return;
    void fetchVoiceCampaignConfig().then((c) =>
      setTestBypassAvailable(c.testBypassAvailable),
    );
  }, [open]);

  if (!open) return null;

  const couple =
    event.partnerName?.trim()
      ? `${event.hostName} ו${event.partnerName}`
      : event.hostName;

  const run = async (testBypass: boolean) => {
    const count = testBypass ? testEligible : eligible;
    if (count === 0) return;
    const limitNote = testBypass
      ? "\n\nמצב בדיקה: שיחה אחת למוזמן הראשון ברשימה (ללא דרישת 2 הודעות וואטסאפ)."
      : "";
    if (
      !window.confirm(
        testBypass
          ? `לבצע בדיקת שיחה אחת ל-${count} מוזמנים מתאימים?${limitNote}`
          : `להתחיל שיחות אוטומטיות ל-${count} מוזמנים?\n\nהשיחה תהיה קצרה (~30 שניות) דרך NLPearl. תוצאות יעדכנו את סטטוס ההגעה אוטומטית כשהשיחה מצליחה.`,
      )
    ) {
      return;
    }
    try {
      await start(event, guests, testBypass ? { testBypass: true } : undefined);
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
          מספר נפשות כשאפשר.
        </p>

        <div className="mt-5 p-3 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white/70 leading-relaxed">
          <div className="font-medium text-white/85 mb-1">למי מתקשרים? (שגרה)</div>
          רק למוזמנים ש<strong>עדיין לא ענו</strong> אחרי שכבר נשלחו אליהם
          לפחות 2 הודעות WhatsApp דרך Momentum (הזמנה + תזכורת / תבנית RSVP).
          <div className="mt-2 text-white/85">
            מתאימים כעת לשיחה:{" "}
            <span className="ltr-num font-bold">{eligible}</span>
          </div>
        </div>

        {testBypassAvailable && (
          <div
            className="mt-4 p-3 rounded-2xl border text-sm leading-relaxed"
            style={{
              borderColor: "rgba(168,85,247,0.35)",
              background: "rgba(168,85,247,0.08)",
            }}
          >
            <div className="font-medium text-purple-200/95 mb-1 flex items-center gap-2">
              <FlaskConical size={16} />
              בדיקה (ללא תנאי וואטסאפ)
            </div>
            <p className="text-white/65">
              לבדיקת NLPearl בלבד: מתקשר למוזמן אחד עם טלפון תקין שעדיין לא אישר/ה,
              בלי לשלוח קודם 2 הודעות. לא לשימוש ביום האירוע.
            </p>
            <p className="mt-2 text-white/85">
              זמינים לבדיקה:{" "}
              <span className="ltr-num font-bold">{testEligible}</span>
            </p>
          </div>
        )}

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
                  {last.testBypass ? "בדיקת שיחה הופעלה" : "קמפיין הופעל"}
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
                {(last.failed ?? 0) > 0 &&
                  last.results?.filter((r) => !r.ok).length > 0 && (
                    <ul className="text-xs text-red-200/90 list-disc pr-4 space-y-1">
                      {last.results
                        .filter((r) => !r.ok)
                        .slice(0, 5)
                        .map((r) => (
                          <li key={r.guestId}>
                            {r.error === "nlpearl_401" || r.error === "nlpearl_403"
                              ? "מפתח API שגוי ב-Vercel (NLPEARL_API_KEY)"
                              : r.error === "nlpearl_404"
                                ? "מזהה Pearl שגוי (NLPEARL_OUTBOUND_ID)"
                                : r.error === "nlpearl_not_configured"
                                  ? "NLPearl לא מוגדר בשרת"
                                  : r.error === "nlpearl_network"
                                    ? "שגיאת רשת ל-NLPearl"
                                    : r.error ?? "שגיאה לא ידועה"}
                          </li>
                        ))}
                    </ul>
                  )}
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
            onClick={() => run(false)}
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
          {testBypassAvailable && (
            <button
              type="button"
              onClick={() => run(true)}
              disabled={busy || testEligible === 0}
              className="btn-secondary inline-flex items-center gap-2 disabled:opacity-40 border-purple-400/30"
              title="בדיקת NLPearl — שיחה אחת, בלי דרישת 2 הודעות וואטסאפ"
            >
              <FlaskConical size={18} />
              {busy ? "מפעיל..." : `בדיקת שיחה (${testEligible})`}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
