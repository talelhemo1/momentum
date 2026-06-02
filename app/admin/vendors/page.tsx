"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { isFounderEmail } from "@/lib/constants";
import { showToast } from "@/components/Toast";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Shield,
  Trash2,
  RotateCcw,
  Pin,
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
  // R127 — confirm modal removed. Delete is one-click + undo. The
  // `pendingDelete` + `deleteReason` slots from R67 went with it.
  const [busyVendorId, setBusyVendorId] = useState<string | null>(null);

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
      // R64 (R79) — founder bypass before the admin_emails query so
      // the page is reachable even if the DB row has been wiped.
      let ok = isFounderEmail(user.email);
      if (!ok) {
        const { data: adminRow } = await supabase
          .from("admin_emails")
          .select("email")
          .eq("email", user.email)
          .maybeSingle();
        if (cancelled) return;
        ok = !!adminRow;
      }
      if (cancelled) return;
      if (!ok) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);
      // R157 — load the full vendor list through the service-role
      // /api/admin/vendors/list endpoint. A direct anon-JWT
      // select on vendor_applications is gated by the "admin reads
      // applications" RLS policy, which only matches emails in
      // `admin_emails`. The founder is admin by code (isFounderEmail)
      // and may not be in that table, so the direct read returned an
      // empty list. The endpoint uses service-role + requireAdmin
      // (founder-only) so it's RLS-immune and matches the UI gate.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const res = session
        ? await fetch("/api/admin/vendors/list", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        : null;
      if (cancelled) return;
      const json = res
        ? ((await res.json().catch(() => ({}))) as {
            vendors?: VendorApplicationRecord[];
          })
        : {};
      setApps(json.vendors ?? []);
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

  // R67 (R84) — delete / restore handlers. Both go through the
  // service-role-backed admin APIs (requireAdmin gate + audit log).
  // We optimistically update the local state and roll back on error
  // so the UI never feels stuck.
  // R127 — `deleteVendor` returns true/false so the caller can chain
  // its own success toast (with undo action). The function only
  // surfaces a toast on FAILURE — success messaging is the caller's
  // responsibility now that the call site needs to attach an
  // action button.
  const deleteVendor = async (
    vendorId: string,
    reason: string,
  ): Promise<boolean> => {
    setBusyVendorId(vendorId);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("Supabase לא מוגדר", "error");
        return false;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showToast("צריך להתחבר", "error");
        return false;
      }
      const res = await fetch("/api/admin/vendors/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ vendorId, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        console.error("[admin-vendors-delete]", res.status, data);
        showToast(
          data.message ?? `מחיקה נכשלה (${res.status})`,
          "error",
        );
        return false;
      }
      setApps((prev) =>
        prev.map((a) =>
          a.id === vendorId
            ? {
                ...a,
                deleted_at: new Date().toISOString(),
                deletion_reason: reason || null,
              }
            : a,
        ),
      );
      return true;
    } catch (e) {
      console.error("[admin-vendors-delete] network/exception:", e);
      showToast("שגיאה ברשת — בדוק consol", "error");
      return false;
    } finally {
      setBusyVendorId(null);
    }
  };

  const restoreVendor = async (vendorId: string) => {
    setBusyVendorId(vendorId);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("Supabase לא מוגדר", "error");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showToast("צריך להתחבר", "error");
        return;
      }
      const res = await fetch("/api/admin/vendors/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ vendorId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        showToast(data.message ?? "שחזור נכשל", "error");
        return;
      }
      setApps((prev) =>
        prev.map((a) =>
          a.id === vendorId
            ? {
                ...a,
                deleted_at: null,
                deleted_by_email: null,
                deletion_reason: null,
              }
            : a,
        ),
      );
      showToast("✓ הספק שוחזר לקטלוג", "success");
    } catch {
      showToast("שגיאה ברשת", "error");
    } finally {
      setBusyVendorId(null);
    }
  };

  // R125 — pin/unpin a vendor at the top of the catalog. Optimistic
  // update + rollback on error, just like delete/restore. The catalog
  // RPC sorts by featured_at desc nulls last, so the moment this
  // round-trips successfully the vendor jumps to the top of /vendors.
  const featureVendor = async (vendorId: string, featured: boolean) => {
    setBusyVendorId(vendorId);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("Supabase לא מוגדר", "error");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showToast("צריך להתחבר", "error");
        return;
      }
      const res = await fetch("/api/admin/vendors/feature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ vendorId, featured }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        featuredAt?: string | null;
      };
      if (!res.ok) {
        showToast(data.message ?? "הפעולה נכשלה", "error");
        return;
      }
      setApps((prev) =>
        prev.map((a) =>
          a.id === vendorId
            ? {
                ...a,
                featured_at: featured
                  ? (data.featuredAt ?? new Date().toISOString())
                  : null,
                featured_rank: featured ? a.featured_rank ?? null : null,
              }
            : a,
        ),
      );
      showToast(
        featured ? "📌 הספק מוצמד לראש הקטלוג" : "הספק חוזר לסדר הרגיל",
        "success",
      );
    } catch {
      showToast("שגיאה ברשת", "error");
    } finally {
      setBusyVendorId(null);
    }
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
  // R67 (R84) — three sub-buckets now:
  //   • approvedLive — visible in the public catalog
  //   • approvedDeleted — soft-deleted, hidden from catalog, can be restored
  //   • rejected — history only
  const approvedLive = apps.filter(
    (a) => a.status === "approved" && !a.deleted_at,
  );
  const approvedDeleted = apps.filter(
    (a) => a.status === "approved" && !!a.deleted_at,
  );
  const rejected = apps.filter((a) => a.status === "rejected");

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
          {pending.length} ממתינות · {approvedLive.length} פעילים בקטלוג ·{" "}
          {approvedDeleted.length} מושעים · {rejected.length} נדחו
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

        {/* R67 (R84) — Live approved vendors with delete affordance. */}
        {approvedLive.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-lg font-semibold">
                פעילים בקטלוג
                <span
                  className="text-xs font-normal ms-2"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  ({approvedLive.length})
                </span>
              </h2>
              {/* R125 — pinned count badge so the admin sees at a glance
                  how many vendors are currently boosted. */}
              {approvedLive.some((a) => !!a.featured_at) && (
                <span
                  className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                  style={{
                    background: "rgba(212,176,104,0.12)",
                    border: "1px solid var(--border-gold)",
                    color: "var(--accent)",
                  }}
                >
                  📌{" "}
                  <span className="ltr-num">
                    {approvedLive.filter((a) => !!a.featured_at).length}
                  </span>{" "}
                  מוצמדים לראש
                </span>
              )}
            </div>
            <div className="grid gap-2">
              {/* R125 — sort by featured_at desc so the same order the
                  catalog uses also appears here. The admin sees their
                  pinned vendors at the top of the admin panel too. */}
              {[...approvedLive]
                .sort((a, b) => {
                  const af = a.featured_at ? new Date(a.featured_at).getTime() : 0;
                  const bf = b.featured_at ? new Date(b.featured_at).getTime() : 0;
                  if (af !== bf) return bf - af;
                  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
                })
                .map((app) => (
                  <ApprovedVendorRow
                    key={app.id}
                    app={app}
                    busy={busyVendorId === app.id}
                    // R127 — one-click delete (no modal). The toast
                    // surfaces an "בטל" button that calls restoreVendor
                    // so an accidental click is reversible without
                    // hunting through the "מושעים" section.
                    onDeleteClick={() => {
                      const name = app.business_name;
                      void deleteVendor(app.id, "").then((ok) => {
                        if (!ok) return;
                        showToast(`✓ ${name} הוסר מהקטלוג`, "success", {
                          duration: 8000,
                          action: {
                            label: "בטל",
                            onClick: () => {
                              void restoreVendor(app.id);
                            },
                          },
                        });
                      });
                    }}
                    onFeatureToggle={() =>
                      featureVendor(app.id, !app.featured_at)
                    }
                  />
                ))}
            </div>
          </section>
        )}

        {approvedDeleted.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold mb-3 text-amber-400">
              מושעים מהקטלוג ({approvedDeleted.length})
            </h2>
            <p
              className="text-sm mb-3"
              style={{ color: "var(--foreground-soft)" }}
            >
              לא מופיעים ב-/vendors. אפשר לשחזר כל אחד בכפתור למטה.
            </p>
            <div className="grid gap-2">
              {approvedDeleted.map((app) => (
                <SuspendedVendorRow
                  key={app.id}
                  app={app}
                  busy={busyVendorId === app.id}
                  onRestore={() => restoreVendor(app.id)}
                />
              ))}
            </div>
          </section>
        )}

        {rejected.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold mb-3">נדחו</h2>
            <div className="grid gap-2">
              {rejected.map((app) => (
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
                  <span className="text-xs px-2 py-1 rounded-full bg-red-400/10 text-red-400">
                    ✗ נדחה
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* R127 — delete confirmation modal removed. Delete is now
          one-click directly from the row, with an 8-second "בטל" undo
          inside the success toast. Modal-driven confirm-then-delete
          required 3-4 clicks per removal which the owner explicitly
          asked to eliminate. */}
    </main>
  );
}

/** Approved + live row with a "..." action menu (currently: delete). */
function ApprovedVendorRow({
  app,
  busy,
  onDeleteClick,
  onFeatureToggle,
}: {
  app: VendorApplicationRecord;
  busy: boolean;
  onDeleteClick: () => void;
  /** R125 — toggle featured_at on/off. The parent decides which value
   *  to send based on the current row's state. */
  onFeatureToggle: () => void;
}) {
  // R126 — pin + delete are now visible bordered buttons on every row
  // (no menu). Owner couldn't find the "..." menu, so direct action
  // wins. menuOpen/ref state from R125 was removed in the same pass.
  const cat = VENDOR_CATEGORIES.find((c) => c.id === app.category);
  const isFeatured = !!app.featured_at;

  return (
    <div
      className="card p-3 flex items-center justify-between text-sm gap-3 transition"
      // R125 — pinned rows get a subtle gold left-border accent so the
      // admin sees the boost at a glance without reading the badge.
      style={
        isFeatured
          ? {
              borderInlineStartWidth: 3,
              borderInlineStartStyle: "solid",
              borderInlineStartColor: "var(--accent)",
              background:
                "linear-gradient(90deg, rgba(212,176,104,0.06), transparent 60%)",
            }
          : undefined
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span aria-hidden>{cat?.emoji}</span>
          <span className="font-semibold truncate">{app.business_name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 shrink-0">
            פעיל
          </span>
          {isFeatured && (
            <span
              className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
              style={{
                background: "rgba(212,176,104,0.18)",
                color: "var(--accent)",
                border: "1px solid var(--border-gold)",
              }}
              title="מוצמד לראש הקטלוג"
            >
              📌 מוצמד
            </span>
          )}
        </div>
        <div
          className="text-xs truncate mt-0.5"
          style={{ color: "var(--foreground-muted)" }}
        >
          {cat?.label} · {app.contact_name} · {app.phone}
        </div>
      </div>
      {/* R126 — direct action row. R125 hid the delete behind a "..."
          menu and the owner couldn't find it. Now both pin and delete
          are visible bordered buttons on every row — single click on
          either, no menu to discover. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onFeatureToggle}
          disabled={busy}
          aria-label={isFeatured ? "בטל הצמדה" : "הצמד לראש הקטלוג"}
          title={isFeatured ? "בטל הצמדה" : "הצמד לראש הקטלוג"}
          className="h-9 rounded-full inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold transition disabled:opacity-50"
          style={
            isFeatured
              ? {
                  background:
                    "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                  color: "var(--gold-button-text)",
                }
              : {
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                  background: "rgba(212,176,104,0.05)",
                }
          }
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Pin
              size={14}
              aria-hidden
              fill={isFeatured ? "currentColor" : "none"}
            />
          )}
          <span className="hidden sm:inline">
            {isFeatured ? "בטל" : "הצמד"}
          </span>
        </button>
        <button
          type="button"
          onClick={onDeleteClick}
          disabled={busy}
          aria-label="הסר מהקטלוג"
          title="הסר את הספק מהקטלוג"
          className="h-9 rounded-full inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold transition disabled:opacity-50"
          style={{
            border: "1px solid rgba(248,113,113,0.4)",
            color: "rgb(252,165,165)",
            background: "rgba(248,113,113,0.06)",
          }}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Trash2 size={14} aria-hidden />
          )}
          <span className="hidden sm:inline">הסר</span>
        </button>
      </div>
    </div>
  );
}

/** Suspended (soft-deleted) row with a one-click restore button. */
function SuspendedVendorRow({
  app,
  busy,
  onRestore,
}: {
  app: VendorApplicationRecord;
  busy: boolean;
  onRestore: () => void;
}) {
  const cat = VENDOR_CATEGORIES.find((c) => c.id === app.category);
  return (
    <div
      className="card p-3 flex items-center justify-between text-sm gap-3"
      style={{ borderColor: "rgba(251,191,36,0.4)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden>{cat?.emoji}</span>
          <span className="font-semibold truncate">{app.business_name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 shrink-0">
            מושעה
          </span>
        </div>
        <div
          className="text-xs truncate mt-0.5"
          style={{ color: "var(--foreground-muted)" }}
        >
          {cat?.label} · {app.contact_name}
          {app.deletion_reason ? ` · ${app.deletion_reason}` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-full transition disabled:opacity-50"
        style={{
          border: "1px solid var(--border-gold)",
          color: "var(--accent)",
        }}
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" aria-hidden />
        ) : (
          <RotateCcw size={12} aria-hidden />
        )}
        שחזר
      </button>
    </div>
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
