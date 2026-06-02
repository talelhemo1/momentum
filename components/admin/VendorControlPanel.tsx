"use client";

/**
 * R130 — Full inline vendor control panel for /admin/dashboard.
 *
 * Owner reported R129's panel showed errors and didn't actually surface
 * the vendor list. R130 rewrites it as a real management surface:
 *
 *   • Lists EVERY approved + live vendor (not just 8).
 *   • Search box filters by name/category instantly.
 *   • Per-row actions, all one-click:
 *       📌 קדם   — pin/unpin to top of catalog
 *       ✎  ערוך  — opens inline modal to edit name/category/city/phone/...
 *       🗑️ מחק   — soft-delete with 8-second undo toast
 *   • All errors surface visibly inside the panel — no more silent
 *     "spinner forever" or empty render.
 *
 * Defensive about the schema: if the `featured_at` column is missing
 * (admin forgot to run the R125 migration), pin operations still get a
 * clear error toast pointing at the migration file instead of a cryptic
 * 500. The list itself doesn't depend on featured_at — it works even
 * without the column applied.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Loader2,
  Pin,
  Trash2,
  Pencil,
  ChevronLeft,
  Search,
  X,
} from "lucide-react";
import { showToast } from "@/components/Toast";
import {
  VENDOR_CATEGORIES,
  type VendorApplicationRecord,
  type VendorCategory,
} from "@/lib/vendorApplication";

export function VendorControlPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<VendorApplicationRecord[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VendorApplicationRecord | null>(
    null,
  );

  // R131 — was a direct supabase.from("vendor_applications").select("*")
  // under the user's anon JWT. That hit "permission denied for table
  // users" via an RLS chain we don't control. The new
  // /api/admin/vendors/list endpoint uses service-role server-side so
  // the load is RLS-immune.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/vendors/list", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            message?: string;
            error?: string;
          };
          console.error(
            "[VendorControlPanel] list endpoint failed:",
            res.status,
            data,
          );
          setError(
            data.message ?? data.error ?? `שגיאה ${res.status} בטעינת ספקים`,
          );
          return;
        }
        const { vendors } = (await res.json()) as {
          vendors: VendorApplicationRecord[];
        };
        if (cancelled) return;
        setRows(vendors ?? []);
      } catch (e) {
        if (cancelled) return;
        console.error("[VendorControlPanel] exception:", e);
        setError(e instanceof Error ? e.message : "שגיאת רשת");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Filter to approved+live, then apply search + sort.
  const visible = useMemo(() => {
    if (!rows) return [];
    const live = rows.filter(
      (r) => r.status === "approved" && !r.deleted_at,
    );
    const term = search.trim().toLowerCase();
    const filtered = term
      ? live.filter((r) => {
          const hay = [
            r.business_name,
            r.contact_name,
            r.city ?? "",
            VENDOR_CATEGORIES.find((c) => c.id === r.category)?.label ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(term);
        })
      : live;
    // Featured first, then most recent.
    return filtered.slice().sort((a, b) => {
      const af = a.featured_at ? new Date(a.featured_at).getTime() : 0;
      const bf = b.featured_at ? new Date(b.featured_at).getTime() : 0;
      if (af !== bf) return bf - af;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [rows, search]);

  const featuredCount = visible.filter((v) => !!v.featured_at).length;

  // ─── Actions ─────────────────────────────────────────────────────

  const togglePin = async (vendor: VendorApplicationRecord) => {
    const nextFeatured = !vendor.featured_at;
    setBusyId(vendor.id);
    try {
      const res = await fetch("/api/admin/vendors/feature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorId: vendor.id, featured: nextFeatured }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        featuredAt?: string | null;
      };
      if (!res.ok) {
        console.error("[VendorControlPanel] pin failed:", res.status, data);
        // The R125 featured_at column is required. If the admin didn't
        // run the migration the server will 500. Give a clear hint.
        if (res.status === 500) {
          showToast(
            "ההצמדה נכשלה. ייתכן שצריך להריץ את ההגירה 2026-05-26-vendor-featured.sql ב-Supabase",
            "error",
          );
        } else {
          showToast(data.message ?? `הפעולה נכשלה (${res.status})`, "error");
        }
        return;
      }
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === vendor.id
            ? {
                ...r,
                featured_at: nextFeatured
                  ? (data.featuredAt ?? new Date().toISOString())
                  : null,
              }
            : r,
        ),
      );
      showToast(
        nextFeatured ? "📌 הוצמד לראש הקטלוג" : "ההצמדה בוטלה",
        "success",
      );
    } catch (e) {
      console.error("[VendorControlPanel] pin exception:", e);
      showToast("שגיאה ברשת", "error");
    } finally {
      setBusyId(null);
    }
  };

  const removeVendor = async (vendor: VendorApplicationRecord) => {
    setBusyId(vendor.id);
    try {
      const res = await fetch("/api/admin/vendors/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorId: vendor.id, reason: "" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        console.error("[VendorControlPanel] delete failed:", res.status, data);
        showToast(data.message ?? `המחיקה נכשלה (${res.status})`, "error");
        return;
      }
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === vendor.id
            ? { ...r, deleted_at: new Date().toISOString() }
            : r,
        ),
      );
      showToast(`✓ ${vendor.business_name} הוסר מהקטלוג`, "success", {
        duration: 8000,
        action: {
          label: "בטל",
          onClick: () => void restoreVendor(vendor),
        },
      });
    } catch (e) {
      console.error("[VendorControlPanel] delete exception:", e);
      showToast("שגיאה ברשת", "error");
    } finally {
      setBusyId(null);
    }
  };

  const restoreVendor = async (vendor: VendorApplicationRecord) => {
    setBusyId(vendor.id);
    try {
      const res = await fetch("/api/admin/vendors/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorId: vendor.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        showToast(data.message ?? "השחזור נכשל", "error");
        return;
      }
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === vendor.id ? { ...r, deleted_at: null } : r,
        ),
      );
      showToast(`✓ ${vendor.business_name} שוחזר`, "success");
    } catch (e) {
      console.error("[VendorControlPanel] restore exception:", e);
      showToast("שגיאה ברשת", "error");
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (
    vendor: VendorApplicationRecord,
    patch: Partial<VendorApplicationRecord>,
  ) => {
    setBusyId(vendor.id);
    try {
      const res = await fetch("/api/admin/vendors/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorId: vendor.id, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        console.error("[VendorControlPanel] update failed:", res.status, data);
        showToast(data.message ?? `העדכון נכשל (${res.status})`, "error");
        return false;
      }
      setRows((prev) =>
        (prev ?? []).map((r) =>
          r.id === vendor.id ? { ...r, ...patch } : r,
        ),
      );
      showToast("✓ נשמר", "success");
      return true;
    } catch (e) {
      console.error("[VendorControlPanel] update exception:", e);
      showToast("שגיאה ברשת", "error");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card p-5 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Briefcase size={20} className="text-[--accent]" aria-hidden />
          שליטה בספקים
          {rows && (
            <span
              className="text-xs font-normal ltr-num"
              style={{ color: "var(--foreground-muted)" }}
            >
              ({visible.length}
              {featuredCount > 0 && ` · ${featuredCount} מוצמדים`})
            </span>
          )}
        </h2>
        <Link
          href="/admin/vendors"
          className="text-xs inline-flex items-center gap-1 transition hover:translate-y-[-1px]"
          style={{ color: "var(--accent)" }}
        >
          ניהול מתקדם
          <ChevronLeft size={13} />
        </Link>
      </div>

      {/* Search */}
      {rows && rows.length > 0 && (
        <div className="relative mb-4">
          <Search
            size={14}
            className="absolute top-1/2 -translate-y-1/2 end-3"
            style={{ color: "var(--foreground-muted)" }}
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם / קטגוריה / עיר…"
            className="input pe-9 !py-2 text-sm w-full"
            aria-label="חיפוש ספק"
          />
        </div>
      )}

      {/* Loading */}
      {rows === null && !error && (
        <div className="flex justify-center py-8">
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: "var(--accent)" }}
            aria-label="טוען"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="text-sm rounded-xl px-3 py-2.5"
          style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "rgb(252,165,165)",
          }}
        >
          {error}
        </div>
      )}

      {/* Empty */}
      {rows && rows.length === 0 && !error && (
        <div
          className="text-sm text-center py-8 rounded-xl"
          style={{
            background: "var(--input-bg)",
            color: "var(--foreground-muted)",
          }}
        >
          עדיין אין ספקים במערכת. ספקים שיירשמו דרך /vendors/join יופיעו
          כאן באופן אוטומטי.
        </div>
      )}

      {/* No results from search */}
      {rows && rows.length > 0 && visible.length === 0 && !error && (
        <div
          className="text-sm text-center py-6 rounded-xl"
          style={{
            background: "var(--input-bg)",
            color: "var(--foreground-muted)",
          }}
        >
          אין ספקים שתואמים לחיפוש &ldquo;{search}&rdquo;
        </div>
      )}

      {/* List */}
      {visible.length > 0 && (
        <div className="space-y-2 max-h-[640px] overflow-y-auto pe-1">
          {visible.map((vendor) => (
            <VendorRow
              key={vendor.id}
              vendor={vendor}
              busy={busyId === vendor.id}
              onPin={() => void togglePin(vendor)}
              onEdit={() => setEditing(vendor)}
              onRemove={() => void removeVendor(vendor)}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <EditVendorModal
          vendor={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const ok = await saveEdit(editing, patch);
            if (ok) setEditing(null);
          }}
        />
      )}
    </section>
  );
}

// ───────────────────────── Row ────────────────────────────────────

function VendorRow({
  vendor,
  busy,
  onPin,
  onEdit,
  onRemove,
}: {
  vendor: VendorApplicationRecord;
  busy: boolean;
  onPin: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const cat = VENDOR_CATEGORIES.find((c) => c.id === vendor.category);
  const isFeatured = !!vendor.featured_at;
  return (
    <div
      className="rounded-xl p-3 flex items-center justify-between gap-3 transition"
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--border)",
        ...(isFeatured
          ? {
              borderInlineStartWidth: 3,
              borderInlineStartStyle: "solid",
              borderInlineStartColor: "var(--accent)",
              background:
                "linear-gradient(90deg, rgba(212,176,104,0.06), var(--input-bg) 60%)",
            }
          : null),
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span aria-hidden>{cat?.emoji}</span>
          <span className="font-semibold truncate">{vendor.business_name}</span>
          {isFeatured && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
              style={{
                background: "rgba(212,176,104,0.18)",
                color: "var(--accent)",
                border: "1px solid var(--border-gold)",
              }}
              title="מוצמד לראש הקטלוג"
            >
              📌
            </span>
          )}
        </div>
        <div
          className="text-xs truncate mt-0.5"
          style={{ color: "var(--foreground-muted)" }}
        >
          {cat?.label}
          {vendor.city ? ` · ${vendor.city}` : ""}
          {vendor.phone ? ` · ${vendor.phone}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <ActionButton
          onClick={onPin}
          disabled={busy}
          ariaLabel={isFeatured ? "בטל הצמדה" : "קדם לראש הקטלוג"}
          label={isFeatured ? "בטל" : "קדם"}
          tone={isFeatured ? "gold-active" : "gold"}
          icon={<Pin size={13} fill={isFeatured ? "currentColor" : "none"} />}
        />
        <ActionButton
          onClick={onEdit}
          disabled={busy}
          ariaLabel="ערוך פרטי ספק"
          label="ערוך"
          tone="neutral"
          icon={<Pencil size={13} />}
        />
        <ActionButton
          onClick={onRemove}
          disabled={busy}
          ariaLabel="מחק מהקטלוג"
          label="מחק"
          tone="danger"
          icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        />
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  ariaLabel,
  label,
  tone,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  label: string;
  tone: "gold" | "gold-active" | "neutral" | "danger";
  icon: React.ReactNode;
}) {
  const styleByTone = {
    gold: {
      border: "1px solid var(--border-gold)",
      color: "var(--accent)",
      background: "rgba(212,176,104,0.05)",
    },
    "gold-active": {
      background:
        "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
      color: "var(--gold-button-text)",
      border: "none",
    },
    neutral: {
      border: "1px solid var(--border)",
      color: "var(--foreground-soft)",
      background: "transparent",
    },
    danger: {
      border: "1px solid rgba(248,113,113,0.4)",
      color: "rgb(252,165,165)",
      background: "rgba(248,113,113,0.06)",
    },
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="h-8 rounded-full inline-flex items-center justify-center gap-1.5 px-2.5 text-xs font-semibold transition disabled:opacity-50"
      style={styleByTone[tone]}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

// ───────────────────────── Edit modal ─────────────────────────────

function EditVendorModal({
  vendor,
  busy,
  onClose,
  onSave,
}: {
  vendor: VendorApplicationRecord;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Partial<VendorApplicationRecord>) => void | Promise<void>;
}) {
  const [businessName, setBusinessName] = useState(vendor.business_name);
  const [category, setCategory] = useState<string>(vendor.category);
  const [city, setCity] = useState(vendor.city ?? "");
  const [phone, setPhone] = useState(vendor.phone ?? "");
  const [website, setWebsite] = useState(vendor.website ?? "");
  const [instagram, setInstagram] = useState(vendor.instagram ?? "");
  const [facebook, setFacebook] = useState(vendor.facebook ?? "");
  const [about, setAbout] = useState(vendor.about ?? "");

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    // R157 — send only the fields that actually changed, using the
    // trimmed value (empty string when cleared). The old code sent
    // `value || undefined`, so clearing a field dropped it from the
    // JSON entirely and the server never nulled it — making it
    // impossible to remove a vendor's city / website / etc. An empty
    // string survives JSON.stringify and the update route maps it to
    // null. Diffing against the original also keeps the audit log's
    // `changed_fields` accurate instead of always listing all eight.
    const patch: Partial<VendorApplicationRecord> = {};
    if (businessName.trim() !== vendor.business_name)
      patch.business_name = businessName.trim();
    if (category !== vendor.category)
      patch.category = category as VendorCategory;
    if (city.trim() !== (vendor.city ?? "")) patch.city = city.trim();
    if (phone.trim() !== (vendor.phone ?? "")) patch.phone = phone.trim();
    if (website.trim() !== (vendor.website ?? ""))
      patch.website = website.trim();
    if (instagram.trim() !== (vendor.instagram ?? ""))
      patch.instagram = instagram.trim();
    if (facebook.trim() !== (vendor.facebook ?? ""))
      patch.facebook = facebook.trim();
    if (about.trim() !== (vendor.about ?? "")) patch.about = about.trim();

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    void onSave(patch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card glass-strong w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between p-5 border-b sticky top-0 z-10"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface-1)",
          }}
        >
          <h3 className="text-lg font-bold inline-flex items-center gap-2">
            <Pencil size={16} className="text-[--accent]" aria-hidden />
            עריכת ספק
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="p-1.5 rounded-full hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <Field label="שם העסק">
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input w-full"
              maxLength={200}
              required
            />
          </Field>

          <Field label="קטגוריה">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input w-full"
            >
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="עיר">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input w-full"
                maxLength={100}
              />
            </Field>
            <Field label="טלפון">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input w-full ltr-num"
                inputMode="tel"
                maxLength={30}
              />
            </Field>
          </div>

          <Field label="אתר">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="input w-full ltr-num"
              maxLength={500}
              placeholder="https://"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Instagram">
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="input w-full ltr-num"
                maxLength={100}
                placeholder="@user"
              />
            </Field>
            <Field label="Facebook">
              <input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                className="input w-full ltr-num"
                maxLength={100}
              />
            </Field>
          </div>

          <Field label="תיאור">
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, 1500))}
              className="input w-full min-h-[80px] resize-y"
              maxLength={1500}
              rows={4}
            />
            <span
              className="text-[10px] mt-1 block ltr-num"
              style={{ color: "var(--foreground-muted)" }}
            >
              {about.length}/1500
            </span>
          </Field>
        </div>

        <footer
          className="flex items-center justify-end gap-2 p-5 border-t sticky bottom-0"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface-1)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-secondary text-sm py-2 px-4"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !businessName.trim()}
            className="btn-gold text-sm py-2 px-5 inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : null}
            שמור
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="text-xs mb-1.5 block"
        style={{ color: "var(--foreground-soft)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
