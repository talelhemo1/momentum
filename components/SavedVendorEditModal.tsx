"use client";

import { useState, useEffect } from "react";
import { X, Save, Star } from "lucide-react";
import { actions } from "@/lib/store";
import { showToast } from "@/components/Toast";
import {
  SAVED_VENDOR_STATUS_LABELS,
  type SavedVendor,
  type SavedVendorStatus,
  type Vendor,
} from "@/lib/types";

interface Props {
  saved: SavedVendor;
  catalog: Vendor;
  onClose: () => void;
}

/**
 * Edit dialog for a single saved vendor — status, agreed price, deposit,
 * meeting, rating, free-form notes. Saves go straight to the store via
 * `actions.updateSavedVendor` which only touches the SavedVendor row (the
 * legacy `selectedVendors` id list and budget links are untouched).
 */
export function SavedVendorEditModal({ saved, catalog, onClose }: Props) {
  const [status, setStatus] = useState<SavedVendorStatus>(saved.status);
  const [agreedPrice, setAgreedPrice] = useState(saved.agreedPrice?.toString() ?? "");
  const [depositAmount, setDepositAmount] = useState(saved.depositAmount?.toString() ?? "");
  // <input type="date"> wants YYYY-MM-DD; ISO string keeps the time. Strip.
  const [depositDate, setDepositDate] = useState(saved.depositDate?.slice(0, 10) ?? "");
  // <input type="datetime-local"> wants YYYY-MM-DDTHH:mm. Same trim.
  const [meetingDate, setMeetingDate] = useState(saved.meetingDate?.slice(0, 16) ?? "");
  const [meetingLocation, setMeetingLocation] = useState(saved.meetingLocation ?? "");
  const [notes, setNotes] = useState(saved.notes ?? "");
  const [rating, setRating] = useState(saved.rating ?? 0);

  // Esc-to-close — matches the rest of the app's modal convention.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    // Numeric fields: empty string → undefined (clears the value), Number()
    // for non-empty. We deliberately don't NaN-guard here — `<input type=number>`
    // already rejects letters at the browser level; a user pasting "abc" would
    // see an empty value, which we treat as "no price set".
    actions.updateSavedVendor(saved.vendorId, {
      status,
      agreedPrice: agreedPrice ? Number(agreedPrice) : undefined,
      depositAmount: depositAmount ? Number(depositAmount) : undefined,
      depositDate: depositDate || undefined,
      meetingDate: meetingDate ? new Date(meetingDate).toISOString() : undefined,
      meetingLocation: meetingLocation.trim() || undefined,
      notes: notes.trim() || undefined,
      rating: rating || undefined,
    });
    showToast("הפרטים נשמרו", "success");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="edit-vendor-title"
    >
      <div
        className="w-full max-w-lg rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              {catalog.type}
            </div>
            <h2 id="edit-vendor-title" className="text-xl font-bold mt-0.5">
              {catalog.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4">
          {/* Status pills — radio group, all 6 statuses fit in a 3×2 grid. */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              סטטוס
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(SAVED_VENDOR_STATUS_LABELS) as SavedVendorStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  aria-pressed={status === s}
                  className="text-xs py-2 rounded-xl transition"
                  style={{
                    background: status === s ? "rgba(212,176,104,0.18)" : "var(--input-bg)",
                    border: `1px solid ${status === s ? "var(--border-gold)" : "var(--border)"}`,
                    color: status === s ? "var(--accent)" : "var(--foreground-soft)",
                  }}
                >
                  {SAVED_VENDOR_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Money */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="מחיר סוכם (₪)"
              type="number"
              value={agreedPrice}
              onChange={setAgreedPrice}
              placeholder="לדוגמה: 8000"
            />
            <Field
              label="מקדמה ששולמה (₪)"
              type="number"
              value={depositAmount}
              onChange={setDepositAmount}
              placeholder="לדוגמה: 2000"
            />
          </div>
          <Field
            label="תאריך תשלום מקדמה"
            type="date"
            value={depositDate}
            onChange={setDepositDate}
          />

          {/* Meeting */}
          <Field
            label="מועד פגישה"
            type="datetime-local"
            value={meetingDate}
            onChange={setMeetingDate}
          />
          <Field
            label="מקום פגישה"
            type="text"
            value={meetingLocation}
            onChange={setMeetingLocation}
            placeholder="כתובת, Zoom, או WhatsApp"
          />

          {/* Rating */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              הדירוג שלך
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  // Click on the current rating clears it — common pattern for
                  // radio-style star pickers, lets the user "un-rate".
                  onClick={() => setRating(n === rating ? 0 : n)}
                  aria-label={`${n} כוכבים`}
                  aria-pressed={n <= rating}
                  className="p-1"
                >
                  <Star
                    size={22}
                    fill={n <= rating ? "var(--accent)" : "transparent"}
                    color={n <= rating ? "var(--accent)" : "var(--foreground-muted)"}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              הערות
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="התרשמתי, נושאים לבירור, פרטים..."
              className="input"
              style={{ resize: "none" }}
            />
            <div
              className="text-[10px] text-end mt-1 ltr-num"
              style={{ color: "var(--foreground-muted)" }}
            >
              {notes.length}/1000
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-2xl py-3 text-sm font-semibold"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            className="btn-gold inline-flex items-center justify-center gap-2 py-3"
          >
            <Save size={16} /> שמור
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </label>
  );
}
