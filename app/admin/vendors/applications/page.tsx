"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Modal } from "@/components/Modal";
import { AdminGuard, useAdminToken } from "@/components/admin/AdminGuard";
import { showToast } from "@/components/Toast";
import {
  VENDOR_CATEGORIES,
  type VendorApplicationRecord,
} from "@/lib/vendorApplication";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  Eye,
  Check,
  X,
  ExternalLink,
  Wrench,
} from "lucide-react";

export default function AdminVendorApplicationsPage() {
  return (
    <AdminGuard returnTo="/admin/vendors/applications">
      <Inner />
    </AdminGuard>
  );
}

function catLabel(id: string): string {
  return VENDOR_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function Inner() {
  const token = useAdminToken();
  const [apps, setApps] = useState<VendorApplicationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<VendorApplicationRecord | null>(null);
  const [rejecting, setRejecting] = useState<VendorApplicationRecord | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  // R122 — admin can sweep every approved-but-landing-less vendor in
  // one click. Repairs the "דפוס אומן" case (approved → no landing →
  // dashboard shows nothing) caused by the pre-fix listUsers() page
  // limit. Idempotent: vendors who already have landings are skipped.
  const runBackfill = async () => {
    if (
      !confirm(
        "לסרוק את כל הספקים שכבר אושרו ולוודא שלכולם יש דף נחיתה?\n\nתיקון אוטומטי לספקים תקועים. בטוח להריץ — לא יוצר כפילויות.",
      )
    ) {
      return;
    }
    setBackfilling(true);
    try {
      const res = await fetch("/api/admin/vendors/backfill-landing", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        summary?: {
          total: number;
          created: number;
          alreadyExists: number;
          noAuthUser: number;
          insertFailed: number;
        };
        error?: string;
      };
      if (!res.ok || !j.summary) {
        showToast(j.error ?? "התיקון נכשל.", "error");
        return;
      }
      const s = j.summary;
      const parts: string[] = [];
      if (s.created > 0) parts.push(`✓ ${s.created} ספקים תוקנו`);
      if (s.alreadyExists > 0)
        parts.push(`${s.alreadyExists} כבר היו תקינים`);
      if (s.noAuthUser > 0)
        parts.push(`${s.noAuthUser} עוד לא נרשמו`);
      if (s.insertFailed > 0)
        parts.push(`⚠ ${s.insertFailed} נכשלו (ראה logs)`);
      showToast(parts.join(" · ") || "אין מה לתקן.", "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאת רשת בתיקון.", "error");
    } finally {
      setBackfilling(false);
    }
  };

  // R157 — read pending applications through the service-role
  // /api/admin/vendors/list endpoint instead of a direct anon-JWT
  // query. The "admin reads applications" RLS policy only grants SELECT
  // to emails present in `admin_emails`, but the founder is admin
  // BY CODE (isFounderEmail) and isn't necessarily a row in that table.
  // The old direct query therefore returned an empty list for the
  // founder — the same silent-empty bug R131 fixed for the dashboard
  // panel. Filtering to `pending` happens client-side now.
  useEffect(() => {
    const c = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/admin/vendors/list", {
          headers: { Authorization: `Bearer ${token}` },
          signal: c.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          vendors?: VendorApplicationRecord[];
          message?: string;
          error?: string;
        };
        if (!res.ok) {
          setError(data.message ?? data.error ?? "שגיאה בטעינת הבקשות.");
          return;
        }
        const pending = (data.vendors ?? [])
          .filter((v) => v.status === "pending")
          .sort((a, b) =>
            (b.created_at ?? "").localeCompare(a.created_at ?? ""),
          );
        setApps(pending);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("שגיאה בטעינת הבקשות.");
      }
    })();
    return () => c.abort();
  }, [token]);

  const decide = async (
    id: string,
    decision: "approved" | "rejected",
    rejectionReason?: string,
  ) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/vendors/admin/decide", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ applicationId: id, decision, rejectionReason }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "הפעולה נכשלה.");
        return;
      }
      // R122 — surface the landing-creation outcome the decide route
      // now returns. The admin sees exactly what happened ("created" /
      // "no-auth-user" / "insert-failed") instead of the silent
      // "approved but invisible" state that left דפוס אומן stuck.
      const j = (await res.json().catch(() => ({}))) as {
        landingStatus?:
          | "created"
          | "already-exists"
          | "no-auth-user"
          | "insert-failed"
          | "exception";
        landingError?: string | null;
      };
      setApps((prev) => (prev ?? []).filter((a) => a.id !== id));
      setView(null);
      setRejecting(null);
      setReason("");
      if (decision === "approved") {
        if (j.landingStatus === "created" || j.landingStatus === "already-exists") {
          showToast("✓ אושר + הדף נוצר. הספק יראה את הדשבורד בכניסה הבאה.", "success");
        } else if (j.landingStatus === "no-auth-user") {
          showToast(
            "אושר — אבל הספק עוד לא נרשם לאפליקציה. הדף ייווצר אוטומטית כשהוא יירשם.",
            "success",
          );
        } else {
          showToast(
            "אושר — אך יצירת הדף נכשלה. הרץ \"תיקון ספקים תקועים\" למעלה.",
            "error",
          );
        }
      } else {
        showToast("הבקשה נדחתה.", "success");
      }
    } catch {
      setError("הפעולה נכשלה.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
        <Link
          href="/admin"
          className="text-sm inline-flex items-center gap-1.5"
          style={{ color: "var(--foreground-muted)" }}
        >
          <ArrowRight size={14} /> חזרה ללוח הבקרה
        </Link>
        <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold gradient-text">בקשות ספקים</h1>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              {apps ? `${apps.length} ממתינות לאישור` : "טוען…"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* R122 — repair stuck approvals. Surface the button next
                to "view catalog" so an admin who notices a vendor
                missing from the catalog has the fix one click away. */}
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfilling}
              className="text-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition disabled:opacity-50"
              style={{
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
                background: "rgba(212,176,104,0.08)",
              }}
              title="סרוק את כל המאושרים — ייצור דפי נחיתה לכל מי שתקוע"
            >
              {backfilling ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wrench size={13} />
              )}
              תיקון ספקים תקועים
            </button>
            {/* R82 — quick jump to the catalog with filter-cache reset. */}
            <Link
              href="/vendors?refresh=1"
              className="text-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition hover:bg-[var(--secondary-button-bg)]"
              style={{
                border: "1px solid var(--border-gold)",
                color: "var(--accent)",
              }}
            >
              צפה בקטלוג <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {error && (
          <div
            className="mt-6 card p-4 flex items-center gap-3"
            style={{ border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertCircle size={18} className="text-red-300 shrink-0" />
            <span style={{ color: "var(--foreground-soft)" }}>{error}</span>
          </div>
        )}

        {!apps && !error && (
          <div className="flex justify-center py-20">
            <Loader2
              className="animate-spin"
              size={26}
              style={{ color: "var(--accent)" }}
            />
          </div>
        )}

        {apps && apps.length === 0 && (
          <div
            className="card p-10 mt-6 text-center text-sm"
            style={{ color: "var(--foreground-muted)" }}
          >
            אין בקשות ממתינות. הכול מטופל ✨
          </div>
        )}

        {apps && apps.length > 0 && (
          <div className="mt-6 space-y-2">
            {apps.map((a) => (
              <div key={a.id} className="card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {a.business_name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    {catLabel(a.category)} · {a.years_in_field} שנות ניסיון ·{" "}
                    <span className="ltr-num">{a.phone}</span>
                  </div>
                </div>
                <button
                  onClick={() => setView(a)}
                  aria-label="צפייה"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <Eye size={15} />
                </button>
                <button
                  onClick={() => decide(a.id, "approved")}
                  disabled={busyId === a.id}
                  aria-label="אישור"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition disabled:opacity-50"
                  style={{
                    border: "1px solid var(--border-gold)",
                    color: "rgb(110,200,150)",
                  }}
                >
                  {busyId === a.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Check size={15} />
                  )}
                </button>
                <button
                  onClick={() => {
                    setReason("");
                    setRejecting(a);
                  }}
                  aria-label="דחייה"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition"
                  style={{
                    border: "1px solid var(--border)",
                    color: "rgb(239,120,120)",
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {view && (
        <Modal onClose={() => setView(null)} title={view.business_name} maxWidthClass="max-w-lg">
          <div className="space-y-2 text-sm">
            <Detail k="תחום" v={catLabel(view.category)} />
            <Detail k="איש קשר" v={view.contact_name} />
            <Detail k="טלפון" v={view.phone} ltr />
            <Detail k="מייל" v={view.email} ltr />
            {view.city && <Detail k="עיר" v={view.city} />}
            <Detail k="ח.פ / ע.מ" v={view.business_id} ltr />
            <Detail k="ותק" v={`${view.years_in_field} שנים`} />
            {view.about && <Detail k="תיאור" v={view.about} />}
            {view.sample_work_url && (
              <a
                href={view.sample_work_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm mt-2"
                style={{ color: "var(--accent)" }}
              >
                <ExternalLink size={14} /> דוגמת עבודה
              </a>
            )}
          </div>
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => decide(view.id, "approved")}
              disabled={busyId === view.id}
              className="btn-gold flex-1 inline-flex items-center justify-center gap-2"
            >
              <Check size={16} /> אישור
            </button>
            <button
              onClick={() => {
                setReason("");
                setRejecting(view);
              }}
              className="btn-secondary flex-1"
            >
              דחייה
            </button>
          </div>
        </Modal>
      )}

      {rejecting && (
        <Modal
          onClose={() => setRejecting(null)}
          title="סיבת דחייה"
          maxWidthClass="max-w-md"
        >
          <p
            className="text-sm mb-3"
            style={{ color: "var(--foreground-soft)" }}
          >
            הסיבה תישלח לספק במייל. נסחו בכבוד וברור.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="input w-full text-sm"
            placeholder="לדוגמה: דוגמת העבודה לא נגישה / חסרים פרטי אימות…"
          />
          <button
            onClick={() => decide(rejecting.id, "rejected", reason.trim())}
            disabled={!reason.trim() || busyId === rejecting.id}
            className="btn-gold w-full mt-4 inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busyId === rejecting.id ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "שלח דחייה"
            )}
          </button>
        </Modal>
      )}
    </>
  );
}

function Detail({ k, v, ltr }: { k: string; v: string; ltr?: boolean }) {
  return (
    <div className="flex gap-3">
      <span
        className="shrink-0 w-24"
        style={{ color: "var(--foreground-muted)" }}
      >
        {k}
      </span>
      <span className={`flex-1 ${ltr ? "ltr-num" : ""}`}>{v}</span>
    </div>
  );
}
