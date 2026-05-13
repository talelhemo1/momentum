"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Shield,
} from "lucide-react";
import {
  VENDOR_CATEGORIES,
  type VendorApplicationRecord,
} from "@/lib/vendorApplication";
import { safeHttpUrl } from "@/lib/safeUrl";

export default function AdminVendorsPage() {
  const [apps, setApps] = useState<VendorApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        if (!cancelled) {
          setAuthorized(false);
          setLoading(false);
        }
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        if (!cancelled) {
          setAuthorized(false);
          setLoading(false);
        }
        return;
      }
      const { data: adminRow } = await supabase
        .from("admin_emails")
        .select("email")
        .eq("email", user.email)
        .single();
      if (cancelled) return;
      if (!adminRow) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);
      const { data } = await supabase
        .from("vendor_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setApps((data as VendorApplicationRecord[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const decide = async (
    id: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) => {
    setDecidingId(id);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("Supabase לא מוגדר", "error");
        setDecidingId(null);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showToast("צריך להתחבר", "error");
        setDecidingId(null);
        return;
      }
      const res = await fetch("/api/vendors/admin/decide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          applicationId: id,
          decision,
          rejectionReason: reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "פעולה נכשלה", "error");
        setDecidingId(null);
        return;
      }
      showToast(decision === "approved" ? "אושר" : "נדחה", "success");
      setApps((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: decision } : a)),
      );
    } catch {
      showToast("שגיאה", "error");
    }
    setDecidingId(null);
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <Shield size={32} className="mx-auto" style={{ color: "var(--foreground-muted)" }} />
          <h1 className="mt-4 text-xl font-bold">הדף הזה למנהלי המערכת בלבד</h1>
        </div>
      </main>
    );
  }

  const pending = apps.filter((a) => a.status === "pending");
  const reviewed = apps.filter((a) => a.status !== "pending");
  // R6 #7 — Approved applications that aren't yet linked to a real catalog
  // row. Today this is *all* approved rows because the catalog (lib/vendors.ts)
  // is a static TS array and the decide route can't insert into it. Once a
  // `vendors` Supabase table exists, the route will stamp `approved_vendor_id`
  // on insert and the list below will drain naturally.
  const approvedNotSynced = apps.filter(
    (a) => a.status === "approved" && !a.approved_vendor_id,
  );

  return (
    <main className="min-h-screen pb-20 px-5">
      <div className="max-w-3xl mx-auto pt-6">
        <Link
          href="/"
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--foreground-soft)" }}
        >
          <ArrowLeft size={14} /> חזרה
        </Link>

        <h1 className="mt-6 text-3xl font-extrabold gradient-gold">בקשות ספקים</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
          {pending.length} ממתינות · {reviewed.length} נסקרו
        </p>

        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">ממתינות לאישור</h2>
          {pending.length === 0 ? (
            <div
              className="card p-6 text-center text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              אין בקשות ממתינות
            </div>
          ) : (
            <div className="grid gap-3">
              {pending.map((app) => (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  onApprove={() => decide(app.id, "approved")}
                  onReject={(reason) => decide(app.id, "rejected", reason)}
                  busy={decidingId === app.id}
                />
              ))}
            </div>
          )}
        </section>

        {approvedNotSynced.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold mb-2 text-amber-400">
              ⚠️ ספקים מאושרים שעדיין לא בקטלוג ({approvedNotSynced.length})
            </h2>
            <p className="text-sm mb-3" style={{ color: "var(--foreground-soft)" }}>
              אישרת אותם, אבל הם לא מופיעים עדיין למשתמשים. כרגע הקטלוג סטטי
              (<code style={{ color: "var(--accent)" }}>lib/vendors.ts</code>)
              — הוסף ידנית, או המתן ל-self-service catalog בסבב הבא.
            </p>
            <div className="grid gap-2">
              {approvedNotSynced.map((app) => (
                <div
                  key={app.id}
                  className="card p-3 flex items-center justify-between text-sm"
                  style={{ borderColor: "rgba(251,191,36,0.4)" }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{app.business_name}</div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {VENDOR_CATEGORIES.find((c) => c.id === app.category)?.label}
                      {" · "}
                      {app.contact_name}
                      {" · "}
                      {app.phone}
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded-full bg-amber-400/10 text-amber-400 shrink-0"
                  >
                    מחכה לסנכרון
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {reviewed.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold mb-3">היסטוריה</h2>
            <div className="grid gap-2">
              {reviewed.map((app) => (
                <div
                  key={app.id}
                  className="card p-3 flex items-center justify-between text-sm"
                >
                  <div>
                    <div className="font-semibold">{app.business_name}</div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--foreground-muted)" }}
                    >
                      {VENDOR_CATEGORIES.find((c) => c.id === app.category)?.label}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      app.status === "approved"
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-red-400/10 text-red-400"
                    }`}
                  >
                    {app.status === "approved" ? "✓ אושר" : "✗ נדחה"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ApplicationCard({
  app,
  onApprove,
  onReject,
  busy,
}: {
  app: VendorApplicationRecord;
  onApprove: () => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [reason, setReason] = useState("");
  const cat = VENDOR_CATEGORIES.find((c) => c.id === app.category);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{cat?.emoji}</span>
            <h3 className="font-bold text-lg">{app.business_name}</h3>
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--foreground-muted)" }}>
            {cat?.label} · {app.city ?? "ללא עיר"}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
            <div>👤 {app.contact_name}</div>
            <div>📞 {app.phone}</div>
            <div>📧 {app.email}</div>
            <div>⏳ {app.years_in_field} שנים</div>
            <div>🆔 {app.business_id}</div>
          </div>
          {app.about && (
            <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
              {app.about}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {/* Defense in depth: even though /api/vendors/apply rejects
                non-http(s) URLs, an old row inserted before that guard
                landed could still carry "javascript:..." here. safeHttpUrl
                strips it; instagram/facebook usernames are escaped through
                encodeURIComponent so a name like "evil/?onerror=..." can't
                break out of the path segment. */}
            {(() => {
              const sampleUrl = safeHttpUrl(app.sample_work_url);
              return sampleUrl ? (
                <a
                  href={sampleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                  style={{ background: "var(--input-bg)" }}
                >
                  <ExternalLink size={11} /> דוגמה
                </a>
              ) : null;
            })()}
            {app.website && (() => {
              const siteUrl = safeHttpUrl(app.website);
              return siteUrl ? (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                  style={{ background: "var(--input-bg)" }}
                >
                  🌐 אתר
                </a>
              ) : null;
            })()}
            {app.instagram && (
              <a
                href={`https://instagram.com/${encodeURIComponent(app.instagram.replace(/^@/, ""))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: "var(--input-bg)" }}
              >
                📸 IG
              </a>
            )}
            {app.facebook && (
              <a
                href={`https://facebook.com/${encodeURIComponent(app.facebook)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: "var(--input-bg)" }}
              >
                📘 FB
              </a>
            )}
          </div>
        </div>
      </div>

      {showRejectInput ? (
        <div className="mt-4 grid gap-2">
          <textarea
            placeholder="סיבת הדחייה (אופציונלי, יישלח לספק)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="input"
            style={{ resize: "none" }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowRejectInput(false)}
              className="rounded-2xl py-2 text-sm"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
            >
              בטל
            </button>
            <button
              onClick={() => onReject(reason)}
              disabled={busy}
              className="rounded-2xl py-2 text-sm font-bold bg-red-500 text-white disabled:opacity-50"
            >
              דחה
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowRejectInput(true)}
            disabled={busy}
            className="rounded-2xl py-2.5 text-sm inline-flex items-center justify-center gap-1.5"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
              color: "var(--foreground-soft)",
            }}
          >
            <XCircle size={14} /> דחה
          </button>
          <button
            onClick={onApprove}
            disabled={busy}
            className="rounded-2xl py-2.5 text-sm font-bold bg-emerald-500 text-black inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <>
                <CheckCircle2 size={14} /> אשר
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
