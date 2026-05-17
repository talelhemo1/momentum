"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, SkipForward, Pause, Play, RotateCcw, MessageCircle, Loader2 } from "lucide-react";
import type { EventInfo, Guest, GuestGroup } from "@/lib/types";
import { GUEST_GROUP_LABELS } from "@/lib/types";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { fireConfetti } from "@/lib/confetti";
import { useExpressSend } from "@/hooks/useExpressSend";

const GROUPS: GuestGroup[] = ["friends", "family", "work", "neighbors"];
const AVG_SEC = 8;

export function ExpressSendModal({
  open,
  onClose,
  guests,
  event,
  origin,
}: {
  open: boolean;
  onClose: () => void;
  guests: Guest[];
  event: EventInfo | null;
  origin: string;
}) {
  const ex = useExpressSend(origin, event);
  const [selected, setSelected] = useState<Set<GuestGroup>>(new Set());
  const confettiFired = useRef(false);

  // Base eligibility: still pending + a valid Israeli phone.
  const base = useMemo(
    () =>
      guests.filter(
        (g) =>
          g.status === "pending" && normalizeIsraeliPhone(g.phone).valid,
      ),
    [guests],
  );
  const filtered = useMemo(
    () =>
      selected.size === 0
        ? base
        : base.filter((g) => g.group && selected.has(g.group)),
    [base, selected],
  );

  const resumable = useMemo(
    () => (open ? ex.peekResumable(guests) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, guests],
  );

  const completedN = ex.completedIds.length;
  const skippedN = ex.skippedIds.length;
  const isFinished =
    ex.isActive &&
    !ex.current &&
    ex.queueCount === 0 &&
    completedN + skippedN > 0;

  useEffect(() => {
    if (isFinished && !confettiFired.current) {
      confettiFired.current = true;
      fireConfetti(1800);
    }
    if (!ex.isActive) confettiFired.current = false;
  }, [isFinished, ex.isActive]);

  if (!open) return null;

  const close = () => {
    if (ex.isActive && !isFinished && completedN + ex.queueCount > 0) {
      if (
        !window.confirm("לעצור את השליחה? ההתקדמות תישמר ותוכל להמשיך אחר כך.")
      )
        return;
      ex.stop();
    }
    onClose();
  };

  const toggleGroup = (g: GuestGroup) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center md:p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full h-full md:h-auto md:max-h-[88vh] md:w-[860px] md:rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-gold)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-2xl md:text-3xl font-extrabold gradient-gold">
            🚀 שליחה מהירה
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="סגור"
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--input-bg)", color: "var(--foreground-soft)" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Step 0: group filter / resume ── */}
        {!ex.isActive && (
          <div className="flex-1 overflow-y-auto px-6 py-8">
            {resumable && (
              <div
                className="card-gold p-5 mb-6 text-center"
                role="status"
              >
                <div className="font-bold text-lg">המשך מאיפה שהפסקת?</div>
                <div
                  className="text-sm mt-1 ltr-num"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  {resumable.completed}/{resumable.total} כבר נשלחו
                </div>
                <button
                  type="button"
                  onClick={() => ex.resumeSaved(guests)}
                  className="btn-gold mt-4 w-full"
                >
                  המשך שליחה
                </button>
              </div>
            )}

            <div className="text-center">
              <h3 className="text-xl font-bold">למי לשלוח?</h3>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--foreground-soft)" }}
              >
                רק מי שעדיין &quot;ממתין&quot; ויש לו טלפון תקין.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{
                  background:
                    selected.size === 0
                      ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
                      : "var(--input-bg)",
                  color:
                    selected.size === 0
                      ? "var(--gold-button-text)"
                      : "var(--foreground-soft)",
                  border: "1px solid var(--border)",
                }}
              >
                כולם
              </button>
              {GROUPS.map((g) => {
                const on = selected.has(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGroup(g)}
                    className="rounded-full px-4 py-2 text-sm font-semibold"
                    style={{
                      background: on
                        ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
                        : "var(--input-bg)",
                      color: on
                        ? "var(--gold-button-text)"
                        : "var(--foreground-soft)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {GUEST_GROUP_LABELS[g]}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <div className="text-5xl font-extrabold ltr-num gradient-gold">
                {filtered.length}
              </div>
              <div
                className="text-sm mt-1"
                style={{ color: "var(--foreground-muted)" }}
              >
                מוזמנים בתור
              </div>
              <button
                type="button"
                disabled={filtered.length === 0}
                onClick={() => {
                  confettiFired.current = false;
                  ex.start(filtered);
                }}
                className="btn-gold mt-6 w-full max-w-sm mx-auto py-4 text-lg disabled:opacity-40"
              >
                התחל שליחה ({filtered.length})
              </button>
            </div>
          </div>
        )}

        {/* ── Finish screen ── */}
        {ex.isActive && isFinished && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
            <div className="text-7xl">🎉</div>
            <h3 className="mt-5 text-3xl font-extrabold gradient-gold">
              <span className="ltr-num">{completedN}</span> הזמנות נשלחו!
            </h3>
            {skippedN > 0 && (
              <p
                className="mt-2 text-sm ltr-num"
                style={{ color: "var(--foreground-soft)" }}
              >
                {skippedN} דולגו
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                ex.reset();
                onClose();
              }}
              className="btn-gold mt-8 px-10"
            >
              סגור
            </button>
          </div>
        )}

        {/* ── Active sending ── */}
        {ex.isActive && !isFinished && ex.current && (
          <>
            <div className="px-5 pt-4 shrink-0">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--input-bg)" }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${
                      ex.total > 0
                        ? Math.round((completedN / ex.total) * 100)
                        : 0
                    }%`,
                    background:
                      "linear-gradient(90deg, var(--gold-500), var(--gold-100))",
                  }}
                />
              </div>
              <div
                className="mt-2 text-xs ltr-num text-center"
                style={{ color: "var(--foreground-muted)" }}
              >
                {completedN} מתוך {ex.total} נשלחו
              </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center text-center px-6 py-8">
              <div className="text-4xl md:text-5xl font-extrabold gradient-gold leading-tight">
                {ex.current.name}
              </div>
              <div
                className="mt-2 text-base ltr-num"
                style={{ color: "var(--foreground-muted)" }}
              >
                {ex.current.phone}
              </div>

              <button
                type="button"
                onClick={ex.sendCurrent}
                disabled={!ex.currentUrl}
                className="mt-8 w-full max-w-sm mx-auto rounded-2xl font-extrabold text-lg inline-flex items-center justify-center gap-3 disabled:opacity-50"
                style={{
                  minHeight: 64,
                  background:
                    "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                  color: "var(--gold-button-text)",
                  boxShadow: "0 14px 34px -12px var(--accent-glow)",
                }}
              >
                {ex.currentUrl ? (
                  <>
                    <MessageCircle size={22} /> פתח WhatsApp
                  </>
                ) : (
                  <>
                    <Loader2 size={20} className="animate-spin" /> מכין קישור…
                  </>
                )}
              </button>
              <p
                className="mt-3 text-xs"
                style={{ color: "var(--foreground-muted)" }}
              >
                ✨ אחרי שתשלח — חזור הנה והבא ייפתח אוטומטית
              </p>

              {/* Sidebar stats — horizontal chips (mobile-friendly) */}
              <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs">
                <Chip>✅ {completedN} הושלמו</Chip>
                <Chip>⏭️ {skippedN} דולגו</Chip>
                <Chip>⏳ {ex.queueCount} ממתינים</Chip>
                <Chip>
                  🕐 ~{Math.ceil((ex.queueCount * AVG_SEC) / 60)} דק׳ נותרו
                </Chip>
              </div>
            </div>

            {/* Bottom controls */}
            <div
              className="grid grid-cols-3 gap-2 px-4 py-3 shrink-0"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Ctrl
                onClick={ex.isPaused ? ex.resume : ex.pause}
                icon={
                  ex.isPaused ? <Play size={16} /> : <Pause size={16} />
                }
                label={ex.isPaused ? "המשך" : "השהיה"}
              />
              <Ctrl
                onClick={ex.skip}
                icon={<SkipForward size={16} />}
                label="דלג"
              />
              <Ctrl
                onClick={() => ex.goBack(guests)}
                icon={<RotateCcw size={16} />}
                label="הקודם"
                disabled={completedN === 0}
              />
            </div>
          </>
        )}

        {/* Auto-open countdown overlay */}
        {ex.autoOpenIn != null && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          >
            <div className="card-gold p-7 text-center mx-5">
              <div className="text-lg font-bold">
                פתיחת המוזמן הבא תוך{" "}
                <span className="ltr-num gradient-gold text-2xl">
                  {ex.autoOpenIn}
                </span>
              </div>
              <button
                type="button"
                onClick={ex.cancelAutoOpen}
                className="mt-4 text-sm rounded-full px-5 py-2"
                style={{
                  background: "var(--input-bg)",
                  color: "var(--foreground-soft)",
                  border: "1px solid var(--border)",
                }}
              >
                ❌ בטל פתיחה אוטומטית
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-3 py-1.5"
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
        color: "var(--foreground-soft)",
      }}
    >
      {children}
    </span>
  );
}

function Ctrl({
  onClick,
  icon,
  label,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl py-3 inline-flex flex-col items-center justify-center gap-1 text-xs font-semibold disabled:opacity-40"
      style={{
        minHeight: 56,
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
        color: "var(--foreground-soft)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
