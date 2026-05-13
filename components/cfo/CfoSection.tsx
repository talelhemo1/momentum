"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import { buildCashflowForecast } from "@/lib/cfoForecasting";
import {
  RECEIPT_STATUS_LABELS,
  type EventReceipt,
  type PaymentScheduleItem,
} from "@/lib/types";
import type { ExtractedReceipt } from "@/lib/cfoAi";
import {
  Camera,
  Upload,
  Loader2,
  Receipt,
  TrendingUp,
  Check,
  Clock,
  Wallet,
  Sparkles,
} from "lucide-react";

/**
 * Wedding CFO — main tab content (R20 Phase 7).
 *
 * Three sections: hero stats (committed / paid / remaining), upload zone
 * with AI extraction preview, monthly cashflow, and the receipts list.
 * All amounts in the DB are agorot — we divide by 100 for display.
 */

interface ExtractedPreview {
  extracted: ExtractedReceipt;
  dataUrl: string;
}

export function CfoSection({ eventId }: { eventId: string }) {
  const [receipts, setReceipts] = useState<EventReceipt[]>([]);
  const [schedule, setSchedule] = useState<PaymentScheduleItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState<ExtractedPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !eventId) return;
    const [receiptsRes, scheduleRes] = await Promise.all([
      supabase
        .from("event_receipts")
        .select("*")
        .eq("event_id", eventId)
        .order("due_date", { ascending: true }),
      supabase.from("payment_schedule").select("*"),
    ]);
    const r = (receiptsRes as { data: EventReceipt[] | null }).data ?? [];
    const s = (scheduleRes as { data: PaymentScheduleItem[] | null }).data ?? [];
    setReceipts(r);
    // Only schedule rows that belong to *this* event's receipts. The
    // schedule table doesn't carry event_id directly — we filter via the
    // receipt set we just loaded.
    const receiptIds = new Set(r.map((row) => row.id));
    setSchedule(s.filter((row) => receiptIds.has(row.receipt_id)));
  }, [eventId]);

  useEffect(() => {
    // Documented "load-on-mount" pattern — loadData drives setReceipts +
    // setSchedule once the network call resolves. Same pattern used by
    // the manager dashboard and the report page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const handleFileUpload = useCallback(
    (file: File) => {
      setUploading(true);
      const reader = new FileReader();
      reader.onerror = () => {
        showToast("שגיאה בקריאת הקובץ", "error");
        setUploading(false);
      };
      reader.onloadend = async () => {
        try {
          const dataUrl = reader.result;
          if (typeof dataUrl !== "string") {
            showToast("קובץ לא תקין", "error");
            setUploading(false);
            return;
          }
          const supabase = getSupabase();
          if (!supabase) {
            showToast("Supabase לא מוגדר", "error");
            setUploading(false);
            return;
          }
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            showToast("נדרשת התחברות", "error");
            setUploading(false);
            return;
          }
          const res = await fetch("/api/cfo/extract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ imageDataUrl: dataUrl }),
          });
          const body = (await res.json()) as {
            extracted?: ExtractedReceipt;
            error?: string;
          };
          if (!res.ok || body.error || !body.extracted) {
            showToast(body.error ?? "החילוץ נכשל", "error");
            setUploading(false);
            return;
          }
          setExtractedPreview({ extracted: body.extracted, dataUrl });
          setUploading(false);
        } catch (e) {
          console.error("[CfoSection] upload failed", e);
          showToast("שגיאה בהעלאה", "error");
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const saveExtracted = useCallback(async () => {
    if (!extractedPreview) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("נדרשת התחברות", "error");
      return;
    }
    const e = extractedPreview.extracted;

    // R12 §3Q — bail before insert when the AI didn't extract a usable
    // amount. Storing a 0-amount receipt is worse than failing loudly:
    // the cashflow forecast treats it as a real bill due, the CFO tab
    // displays "₪0 התחייבתם" anomalies, and the user can't tell where it
    // came from.
    const parsedAmount = typeof e.total_amount === "number" && Number.isFinite(e.total_amount)
      ? e.total_amount
      : 0;
    if (parsedAmount <= 0) {
      showToast("ה-AI לא זיהה סכום בחשבונית. הזן ידנית או נסה צילום ברור יותר.", "error");
      return;
    }

    const { error } = (await supabase
      .from("event_receipts")
      .insert({
        event_id: eventId,
        user_id: user.id,
        vendor_name: e.vendor_name ?? null,
        category: e.category ?? null,
        total_amount: Math.round(parsedAmount * 100),
        due_date: e.due_date ?? null,
        raw_text: JSON.stringify(e),
        ai_confidence: e.confidence ?? null,
      } as unknown as never)) as { error: { message: string } | null };

    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast("נשמר בהצלחה!", "success");
    setExtractedPreview(null);
    void loadData();
  }, [extractedPreview, eventId, loadData]);

  const cashflow = buildCashflowForecast(receipts, schedule);
  const totalCommitted = receipts.reduce((s, r) => s + r.total_amount, 0) / 100;
  const totalPaid = receipts.reduce((s, r) => s + r.paid_amount, 0) / 100;
  const totalRemaining = totalCommitted - totalPaid;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-3 gap-3">
        <StatCard icon={<Wallet size={20} aria-hidden />} label="סה״כ התחייבתם" value={totalCommitted} color="gold" />
        <StatCard icon={<Check size={20} aria-hidden />} label="שולם" value={totalPaid} color="emerald" />
        <StatCard icon={<Clock size={20} aria-hidden />} label="נותר לשלם" value={totalRemaining} color="amber" />
      </section>

      <section className="card-gold p-7 text-center relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-16 -end-16 w-56 h-56 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(212,176,104,0.25), transparent 70%)" }}
        />
        <div className="relative">
          <Sparkles size={32} className="mx-auto text-[--accent]" aria-hidden />
          <h2 className="mt-3 text-xl font-bold gradient-gold">
            הוסף חשבונית — ה-AI יעשה את העבודה
          </h2>
          <p className="mt-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
            צלם / העלה תמונה. נחלץ ספק, סכום, תאריך, ולוח תשלומים אוטומטית.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-2xl py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}
            >
              {uploading ? (
                <Loader2 className="animate-spin" size={16} aria-hidden />
              ) : (
                <>
                  <Upload size={16} aria-hidden /> תמונה
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-gold inline-flex items-center justify-center gap-2 py-3 disabled:opacity-50"
            >
              <Camera size={16} aria-hidden /> צלם
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
              // Reset value so picking the same file twice still fires.
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {extractedPreview && (
        <section className="card-gold p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={20} className="text-[--accent]" aria-hidden />
            <h3 className="font-bold">חולצו אוטומטית — וודא ושמור</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 ltr-num">
              דיוק: {extractedPreview.extracted.confidence}%
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Field label="שם הספק" value={extractedPreview.extracted.vendor_name} />
            <Field label="קטגוריה" value={extractedPreview.extracted.category} />
            <Field
              label="סכום"
              value={`₪${(extractedPreview.extracted.total_amount ?? 0).toLocaleString("he-IL")}`}
            />
            <Field label="תאריך תשלום" value={extractedPreview.extracted.due_date} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExtractedPreview(null)}
              className="rounded-2xl py-3 text-sm"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
            >
              ביטול
            </button>
            <button type="button" onClick={() => void saveExtracted()} className="btn-gold py-3 text-sm">
              שמור חשבונית
            </button>
          </div>
        </section>
      )}

      {cashflow.length > 0 && (
        <section className="card p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-[--accent]" aria-hidden />
            תזרים מזומנים — חודשים הבאים
          </h3>
          <div className="space-y-3">
            {cashflow.map((month) => (
              <div
                key={month.month}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: "var(--input-bg)" }}
              >
                <div>
                  <div className="font-semibold text-sm">{month.monthLabel}</div>
                  <div
                    className="text-xs mt-0.5 ltr-num"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {month.items.length} תשלומים
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-xl font-extrabold ltr-num gradient-gold">
                    ₪{month.outflows.toLocaleString("he-IL")}
                  </div>
                  <div
                    className="text-xs ltr-num"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    מצטבר: ₪{month.cumulative.toLocaleString("he-IL")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2">
            <Receipt size={20} className="text-[--accent]" aria-hidden />
            כל החשבוניות
          </h3>
          <span className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
            {receipts.length} סה״כ
          </span>
        </div>
        {receipts.length === 0 ? (
          <div
            className="card p-8 text-center text-sm"
            style={{ color: "var(--foreground-muted)" }}
          >
            עדיין לא הועלו חשבוניות
          </div>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <ReceiptRow key={r.id} receipt={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: "gold" | "emerald" | "amber";
}) {
  const colorMap = {
    gold: "gradient-gold",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
  };
  return (
    <div className="card p-4 text-center">
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-2 text-[--accent]"
        style={{
          background: "linear-gradient(135deg, rgba(244,222,169,0.20), rgba(168,136,74,0.10))",
        }}
      >
        {icon}
      </div>
      <div className={`text-xl font-extrabold ltr-num ${colorMap[color]}`}>
        ₪{value.toLocaleString("he-IL")}
      </div>
      <div className="text-[10px] mt-1" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>
        {label}
      </div>
      <div className="font-semibold mt-0.5">
        {value ? String(value) : <span className="opacity-50">לא זוהה</span>}
      </div>
    </div>
  );
}

function ReceiptRow({ receipt }: { receipt: EventReceipt }) {
  const status = RECEIPT_STATUS_LABELS[receipt.status];
  return (
    <div className="card p-4 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{receipt.vendor_name ?? "ספק לא ידוע"}</div>
        <div
          className="text-xs mt-0.5"
          style={{ color: "var(--foreground-muted)" }}
        >
          {receipt.category ?? "ללא קטגוריה"}
          {receipt.due_date &&
            ` · יעד תשלום: ${new Date(receipt.due_date).toLocaleDateString("he-IL")}`}
        </div>
      </div>
      <div className="text-end ms-3">
        <div className="text-lg font-bold ltr-num">
          ₪{(receipt.total_amount / 100).toLocaleString("he-IL")}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${status.color}`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}
