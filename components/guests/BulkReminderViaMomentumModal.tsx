"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { actions } from "@/lib/store";
import { showToast } from "@/components/Toast";
import { getSupabase } from "@/lib/supabase";
import { buildRsvpUrl, buildWhatsAppMessage } from "@/lib/rsvpLinks";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send-client";
import { sendSmsMessage } from "@/lib/sms-send-client";
import {
  EVENT_UPDATE_TEMPLATE_SID,
  buildEventUpdateVariables,
  hasEventUpdateTemplate,
} from "@/lib/whatsapp-templates";
import { formatEventDate } from "@/lib/format";
import type { EventInfo, Guest } from "@/lib/types";

/**
 * R94 — manual bulk reminder to guests who have ALREADY CONFIRMED.
 *
 * Sibling of BulkSendViaMomentumModal (the invite path). Kept as a
 * SEPARATE component on purpose: the invite modal targets *pending*
 * guests with the *invitation* template and marks `invited`; this one
 * targets *confirmed* guests with the *event_update* template and
 * stamps `reminderSentAt`. Folding them into one would tangle two
 * working flows for no real reuse win.
 *
 * The automatic 7-day / 1-day reminders go out from the daily cron
 * (app/api/cron/event-reminders) using the same event_update template;
 * this modal is the host's manual "nudge everyone now" button. They
 * share the template + variable shape so a guest sees a consistent
 * message regardless of which path fired.
 *
 * Per-guest strategy (same ladder as the invite modal):
 *   A. approved event_update template  — works any time (best path)
 *   B. WhatsApp free-form               — only inside the 24h window
 *   C. SMS                              — deterministic fallback
 * First success wins; on success we stamp `reminderSentAt` so the UI
 * can show "reminded" and avoid accidental double-nudges.
 */

interface Props {
  origin: string;
  event: EventInfo;
  /** Already filtered: status === "confirmed", has phone. */
  candidates: Guest[];
  onClose: () => void;
}

type GuestOutcome =
  | { status: "queued"; guest: Guest }
  | { status: "ok"; guest: Guest }
  | { status: "fail"; guest: Guest; reason: string };

const THROTTLE_MS = 200; // ~5 sends/sec — well below Twilio's 80/sec cap.

export function BulkReminderViaMomentumModal({
  origin,
  event,
  candidates,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<"confirm" | "sending" | "done">("confirm");
  const [outcomes, setOutcomes] = useState<GuestOutcome[]>(() =>
    candidates.map((g) => ({ status: "queued", guest: g })),
  );
  const cancelRef = useRef(false);

  // Pre-flight diagnostics — mirror the invite modal. Either config
  // silently breaks delivery for guests outside the 24h window:
  //   • sandbox     — Twilio shared sender; only joined phones get msgs.
  //   • !templateOk — no approved event_update template; free-form is
  //                   dropped by Meta outside the window.
  // SMS (Strategy C) still catches everyone, so this is a soft warning.
  const [sandbox, setSandbox] = useState(false);
  const [templateOk, setTemplateOk] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/whatsapp/status?limit=1", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => ({}))) as {
          sandbox?: boolean;
          templateConfigured?: boolean;
        };
        if (!cancelled) {
          setSandbox(!!body.sandbox);
          setTemplateOk(body.templateConfigured !== false);
        }
      } catch {
        /* offline / 503 — fall through to default (no banner) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const willWarn = sandbox || !templateOk;

  // Esc / click-out close (only when not mid-send) + body scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "sending") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, phase]);

  const sentCount = outcomes.filter((o) => o.status === "ok").length;
  const failedCount = outcomes.filter((o) => o.status === "fail").length;
  const remaining = outcomes.filter((o) => o.status === "queued").length;

  const handleSend = async () => {
    setPhase("sending");
    cancelRef.current = false;

    const templateAvailable = hasEventUpdateTemplate();
    const hostNames = event.partnerName
      ? `${event.hostName} ו${event.partnerName}`
      : event.hostName;
    const venue = [event.synagogue, event.city].filter(Boolean).join(" · ");
    const dateText = formatEventDate(event.date);

    // Local counters — `outcomes` state is stale inside the loop closure.
    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (cancelRef.current) break;
      const guest = candidates[i];

      let okResult = false;
      let failReason = "";

      // Build the RSVP link + reminder body ONCE (reused by all three
      // strategies). The "reminder" kind gives confirmed guests a warm
      // "see you soon" nudge with the details link rather than an "are
      // you coming?" ask. rsvpUrl feeds the template's {{5}} variable;
      // messageText is the free-form / SMS body (same link inside).
      let rsvpUrl = "";
      let messageText = "";
      try {
        rsvpUrl = await buildRsvpUrl(origin, event, guest);
      } catch {
        /* bad origin/event shape — Strategy A skipped, B/C still try */
      }
      try {
        const built = await buildWhatsAppMessage(origin, event, guest, {
          kind: "reminder",
        });
        messageText = built.text;
      } catch {
        /* leave empty — Strategies B/C tolerate this */
      }

      // Strategy A: approved event_update template (works any time).
      if (templateAvailable && rsvpUrl) {
        const res = await sendWhatsAppMessage({
          phone: guest.phone,
          templateSid: EVENT_UPDATE_TEMPLATE_SID,
          variables: buildEventUpdateVariables({
            guestName: guest.name,
            hostNames,
            date: dateText,
            venue: venue || "פרטים בלינק",
            rsvpUrl,
          }),
        });
        if (res.ok) okResult = true;
      }

      // Strategy B: WhatsApp free-form (only inside the 24h window).
      if (!okResult && messageText) {
        const res = await sendWhatsAppMessage({
          phone: guest.phone,
          message: messageText,
        });
        if (res.ok) okResult = true;
      }

      // Strategy C: SMS — deterministic safety net, no Meta approval.
      if (!okResult && messageText) {
        const res = await sendSmsMessage({
          phone: guest.phone,
          message: messageText,
        });
        if (res.ok) {
          okResult = true;
        } else {
          failReason =
            res.error === "not_configured"
              ? "WhatsApp ו-SMS שניהם לא זמינים — שלח דרך הכפתור הירוק"
              : (res.hebrewHint ?? "שליחה נכשלה (גם WhatsApp וגם SMS)");
        }
      } else if (!okResult && !messageText) {
        failReason = "בניית הלינק נכשלה";
      }

      if (okResult) {
        okCount++;
        actions.updateGuest(guest.id, {
          reminderSentAt: new Date().toISOString(),
        });
        setOutcomes((prev) =>
          prev.map((o) =>
            o.guest.id === guest.id ? { status: "ok", guest } : o,
          ),
        );
      } else {
        failCount++;
        setOutcomes((prev) =>
          prev.map((o) =>
            o.guest.id === guest.id
              ? { status: "fail", guest, reason: failReason || "שגיאה" }
              : o,
          ),
        );
      }

      if (i < candidates.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    setPhase("done");
    showToast(
      cancelRef.current
        ? `הופסק — ${okCount} נשלחו, ${failCount} נכשלו`
        : `✓ סיימנו — ${okCount} תזכורות נשלחו${failCount ? `, ${failCount} נכשלו` : ""}`,
      okCount > 0 ? "success" : "info",
    );
  };

  const handleStop = () => {
    cancelRef.current = true;
  };

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={phase === "sending" ? undefined : onClose}
      role="dialog"
      aria-modal
      aria-labelledby="bulk-reminder-title"
    >
      <div className="flex min-h-full items-start justify-center p-4 pt-6 md:pt-12">
        <div
          className="card glass-strong w-full max-w-lg scale-in flex flex-col"
          onClick={(e) => e.stopPropagation()}
          style={{
            border: "1px solid var(--border-gold)",
            maxHeight: "calc(100vh - 2rem)",
          }}
        >
          {/* Header */}
          <div
            className="px-6 pt-6 pb-4 flex items-start justify-between gap-3 shrink-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(212,176,104,0.08), transparent)",
              borderBottom: "1px solid var(--border-gold)",
            }}
          >
            <div>
              <div
                className="text-xs uppercase tracking-widest"
                style={{ color: "var(--accent)" }}
              >
                תזכורת מ-Momentum
              </div>
              <h2
                id="bulk-reminder-title"
                className="mt-1 font-bold text-lg leading-tight"
              >
                {phase === "confirm" &&
                  `שלח תזכורת ל-${candidates.length} אורחים שאישרו`}
                {phase === "sending" &&
                  `שולח... ${sentCount + failedCount}/${candidates.length}`}
                {phase === "done" && "סיימנו!"}
              </h2>
            </div>
            {phase !== "sending" && (
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="w-9 h-9 rounded-full inline-flex items-center justify-center transition hover:bg-white/10 shrink-0"
                style={{ color: "var(--foreground-muted)" }}
              >
                <X size={16} aria-hidden />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
            {phase === "confirm" && (
              <>
                {willWarn && (
                  <div
                    className="rounded-2xl p-3 text-sm leading-relaxed flex items-start gap-2.5"
                    style={{
                      background: "rgba(248,113,113,0.10)",
                      border: "1px solid rgba(248,113,113,0.4)",
                      color: "rgb(252,165,165)",
                    }}
                    role="alert"
                  >
                    <AlertTriangle
                      size={18}
                      className="shrink-0 mt-0.5"
                      aria-hidden
                    />
                    <div>
                      {sandbox ? (
                        <>
                          <div className="font-bold mb-1">
                            ⚠️ Twilio במצב Sandbox
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: "rgba(252,165,165,0.95)" }}
                          >
                            רק טלפונים שביצעו &quot;join&quot; ידני מקבלים
                            הודעות WhatsApp ב-Sandbox. אבל אל דאגה — מי
                            שלא יקבל ב-WhatsApp יקבל SMS אוטומטית.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-bold mb-1">
                            ⚠️ אין תבנית WhatsApp מאושרת
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: "rgba(252,165,165,0.95)" }}
                          >
                            בלי תבנית מאושרת מ-Meta, תזכורת WhatsApp מחוץ
                            לחלון 24 השעות נשלחת כ-free-form ועלולה ליפול
                            בשקט. <strong>גיבוי:</strong> מי שלא יקבל
                            ב-WhatsApp יקבל את התזכורת כ-SMS אוטומטית.
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  תזכורת חמה תישלח לכל מי שכבר אישר הגעה, ישירות מהמספר
                  העסקי של Momentum (
                  <span className="ltr-num font-semibold">
                    +972 53-362-5007
                  </span>
                  ). ההודעה כוללת את פרטי האירוע ולינק לפרטים מלאים.
                </div>
                <ul
                  className="text-sm space-y-1.5 px-3 py-3 rounded-2xl"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground-soft)",
                  }}
                >
                  <li>✅ רק לאורחים שאישרו הגעה</li>
                  <li>📱 רק לאלה עם מספר טלפון</li>
                  <li>⏱ ~5 הודעות בשנייה — סבלנות 30-60 שניות</li>
                  <li>🔁 אם WhatsApp נכשל — נשלח SMS אוטומטית כגיבוי</li>
                </ul>
              </>
            )}

            {(phase === "sending" || phase === "done") && (
              <>
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--foreground-muted)" }}>
                      התקדמות
                    </span>
                    <span
                      className="ltr-num font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {sentCount + failedCount}/{candidates.length}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--input-bg)" }}
                  >
                    <div
                      className="h-full transition-all duration-300 ease-out"
                      style={{
                        width: `${candidates.length > 0 ? ((sentCount + failedCount) / candidates.length) * 100 : 0}%`,
                        background:
                          "linear-gradient(90deg, var(--gold-100), var(--gold-500))",
                      }}
                    />
                  </div>
                </div>

                {/* Counts */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Counter
                    label="נשלחו"
                    value={sentCount}
                    color="rgb(110,231,183)"
                  />
                  <Counter
                    label="נכשלו"
                    value={failedCount}
                    color={failedCount > 0 ? "rgb(252,165,165)" : undefined}
                  />
                  <Counter label="נותרו" value={remaining} />
                </div>

                {/* Failure list */}
                {failedCount > 0 && phase === "done" && (
                  <details
                    className="text-xs rounded-2xl"
                    style={{
                      background: "rgba(248,113,113,0.06)",
                      border: "1px solid rgba(248,113,113,0.2)",
                    }}
                  >
                    <summary
                      className="px-3 py-2 cursor-pointer font-semibold"
                      style={{ color: "rgb(252,165,165)" }}
                    >
                      הצג {failedCount} כשלים
                    </summary>
                    <div className="px-3 pb-3 space-y-1">
                      {outcomes
                        .filter((o) => o.status === "fail")
                        .map(
                          (o) =>
                            o.status === "fail" && (
                              <div
                                key={o.guest.id}
                                className="flex justify-between gap-2 leading-relaxed"
                                style={{ color: "var(--foreground-soft)" }}
                              >
                                <span className="truncate">{o.guest.name}</span>
                                <span
                                  className="text-end shrink-0"
                                  style={{ color: "var(--foreground-muted)" }}
                                >
                                  {o.reason}
                                </span>
                              </div>
                            ),
                        )}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-4 grid grid-cols-2 gap-2 shrink-0"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            {phase === "confirm" && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="action-btn"
                  style={{ minHeight: 48 }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  className="btn-gold inline-flex items-center justify-center gap-2"
                  style={{ minHeight: 48 }}
                >
                  <Bell size={15} />
                  שלח תזכורת לכולם
                </button>
              </>
            )}
            {phase === "sending" && (
              <>
                <span
                  className="inline-flex items-center justify-center gap-2 text-sm"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  <Loader2 size={15} className="animate-spin" />
                  אל תסגור את הדף
                </span>
                <button
                  type="button"
                  onClick={handleStop}
                  className="action-btn"
                  style={{ minHeight: 48, color: "rgb(252,165,165)" }}
                >
                  עצור
                </button>
              </>
            )}
            {phase === "done" && (
              <>
                <span />
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-gold inline-flex items-center justify-center gap-2"
                  style={{ minHeight: 48 }}
                >
                  <Check size={15} />
                  סיום
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
      <div
        className="text-xl font-extrabold ltr-num mt-0.5"
        style={{ color: color ?? "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}
