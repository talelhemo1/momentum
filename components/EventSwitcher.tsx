"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEventSlots } from "@/lib/eventSlots";
import { useNow, daysUntil } from "@/lib/useNow";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ChevronDown, Plus, Calendar, Trash2, Check, Sparkles } from "lucide-react";

/**
 * Header dropdown that lets the user switch between saved events,
 * create a new one, or delete an existing one.
 */
export function EventSwitcher() {
  const router = useRouter();
  const { slots, activeId, switchTo, createNew, deleteSlot } = useEventSlots();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // useNow returns null during SSR/before mount so we don't compute days until
  // the client takes over — avoids hydration drift.
  const now = useNow();

  // Trap Tab/Shift+Tab inside the popover, close on Esc, restore focus on close.
  useFocusTrap({ containerRef: popoverRef, active: open, onClose: () => setOpen(false) });

  // Memoize the sorted list — without this we allocate a fresh array (and
  // re-run sort) on every parent render, which forces every <li> to think
  // its props changed and re-render even when nothing meaningful did.
  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [slots],
  );

  // Don't render if there's nothing to switch yet (no active event AND no other slots).
  const activeSlot = slots.find((s) => s.id === activeId);
  if (!activeSlot && slots.length === 0) return null;

  const label = activeSlot?.label ?? "אירוע ללא שם";

  const onSwitch = (id: string) => {
    switchTo(id);
    setOpen(false);
    router.push("/dashboard");
  };

  const onCreateNew = () => {
    createNew();
    setOpen(false);
    router.push("/onboarding");
  };

  const onDelete = (id: string) => {
    if (confirmingDelete === id) {
      deleteSlot(id);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(id);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="hidden sm:flex items-center gap-2 rounded-full ps-3 pe-2 py-1.5 text-sm transition max-w-[220px]"
        style={{ border: "1px solid var(--border-strong)", color: "var(--foreground-soft)" }}
        title="החלף בין אירועים"
      >
        <Calendar size={14} className="text-[--accent] shrink-0" />
        <span className="truncate font-medium">{label}</span>
        <ChevronDown size={14} className={`transition shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <button onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" aria-hidden />
          <div
            ref={popoverRef}
            role="menu"
            aria-label="החלפת אירוע"
            className="absolute end-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto glass-strong rounded-2xl py-2 z-50 scale-in"
            style={{ border: "1px solid var(--border-strong)" }}
          >
            <div className="px-4 py-2 text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
              האירועים שלך · {slots.length}
            </div>

            {slots.length === 0 && (
              <div className="px-4 py-3 text-sm" style={{ color: "var(--foreground-muted)" }}>
                אין אירועים שמורים
              </div>
            )}

            {sortedSlots.map((s) => {
                const isActive = s.id === activeId;
                const eventDate = s.snapshot.event?.date;
                const days = eventDate ? daysUntil(eventDate, now) : null;
                return (
                  <div
                    key={s.id}
                    className={`mx-2 my-1 rounded-xl flex items-center gap-3 px-3 py-2.5 transition ${
                      isActive ? "" : "hover:bg-[var(--secondary-button-bg)]"
                    }`}
                    style={isActive ? { background: "rgba(212,176,104,0.08)", border: "1px solid var(--border-gold)" } : undefined}
                  >
                    <button onClick={() => !isActive && onSwitch(s.id)} className="flex-1 text-start min-w-0" disabled={isActive}>
                      <div className="flex items-center gap-2">
                        {isActive && <Check size={14} className="text-[--accent] shrink-0" />}
                        <div className="font-semibold truncate">{s.label}</div>
                      </div>
                      {days !== null && (
                        <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>
                          {days === 0 ? "היום!" : `עוד ${days} ימים`}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      className="p-1.5 rounded-lg transition shrink-0"
                      style={{
                        color: confirmingDelete === s.id ? "rgb(252 165 165)" : "var(--foreground-muted)",
                        background: confirmingDelete === s.id ? "rgba(248,113,113,0.1)" : undefined,
                      }}
                      title={confirmingDelete === s.id ? "לחץ שוב לאישור" : "מחק אירוע"}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}

            <div className="border-t mx-2 mt-2 pt-2" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={onCreateNew}
                className="w-full rounded-xl flex items-center gap-3 px-3 py-2.5 text-start transition hover:bg-[var(--secondary-button-bg)]"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black flex items-center justify-center">
                  <Plus size={14} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">אירוע חדש</div>
                  <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>יצירת תכנון נוסף במקביל</div>
                </div>
                <Sparkles size={14} className="text-[--accent]" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
