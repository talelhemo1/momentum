"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { actions, useAppState } from "@/lib/store";
import { VENDORS } from "@/lib/vendors";
import {
  SAVED_VENDOR_STATUS_LABELS,
  SAVED_VENDOR_STATUS_COLORS,
  VENDOR_TYPE_LABELS,
  type SavedVendorStatus,
  type SavedVendor,
  type Vendor,
} from "@/lib/types";
import { SavedVendorEditModal } from "@/components/SavedVendorEditModal";
import { showToast } from "@/components/Toast";
import { Header } from "@/components/Header";
import { safeHttpUrl } from "@/lib/safeUrl";
import {
  ArrowRight,
  Wallet,
  Calendar,
  Phone,
  ExternalLink,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";

/** Display order — most actionable first, "cancelled" last so it doesn't
 *  drown the user's eye when most rows are still active. */
const STATUS_ORDER: SavedVendorStatus[] = [
  "meeting",
  "signed",
  "paid",
  "contacted",
  "lead",
  "cancelled",
];

interface EnrichedSavedVendor {
  saved: SavedVendor;
  catalog: Vendor | undefined;
}

export default function MyVendorsPage() {
  const { state, hydrated } = useAppState();
  const [editingId, setEditingId] = useState<string | null>(null);

  const enrichedVendors = useMemo<EnrichedSavedVendor[]>(() => {
    return state.savedVendors.map((saved) => ({
      saved,
      catalog: VENDORS.find((v) => v.id === saved.vendorId),
    }));
  }, [state.savedVendors]);

  // Budget summary across saved vendors. Definitions:
  //   total = sum of agreed prices set on any vendor (regardless of status)
  //   paidDeposits = sum of partial deposits across non-paid vendors
  //   fullyPaid = sum of agreed prices on rows whose status is "paid"
  //   remaining = total - fullyPaid - (deposits paid on rows that aren't fully paid yet)
  const summary = useMemo(() => {
    let total = 0;
    let paidDeposits = 0;
    let fullyPaid = 0;
    let depositsTowardRemaining = 0;
    for (const { saved } of enrichedVendors) {
      const price = saved.agreedPrice ?? 0;
      const deposit = saved.depositAmount ?? 0;
      total += price;
      paidDeposits += deposit;
      if (saved.status === "paid") {
        fullyPaid += price;
      } else {
        depositsTowardRemaining += deposit;
      }
    }
    const remaining = Math.max(0, total - fullyPaid - depositsTowardRemaining);
    return { total, paidDeposits, fullyPaid, remaining };
  }, [enrichedVendors]);

  const groupedByStatus = useMemo(() => {
    const groups: Record<SavedVendorStatus, EnrichedSavedVendor[]> = {
      lead: [],
      contacted: [],
      meeting: [],
      signed: [],
      paid: [],
      cancelled: [],
    };
    for (const e of enrichedVendors) groups[e.saved.status].push(e);
    return groups;
  }, [enrichedVendors]);

  const editingVendor = editingId
    ? enrichedVendors.find((e) => e.saved.vendorId === editingId)
    : null;

  // Wait for hydration so we don't flash the empty-state on a returning user.
  if (!hydrated) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-sm" style={{ color: "var(--foreground-muted)" }}>
            טוען...
          </div>
        </main>
      </>
    );
  }

  if (enrichedVendors.length === 0) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-5">
          <div className="card p-8 text-center max-w-md">
            <Wallet size={32} className="mx-auto" style={{ color: "var(--foreground-muted)" }} />
            <h1 className="mt-4 text-xl font-bold">עדיין לא הוספת ספקים לרשימה שלך</h1>
            <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
              עבור לקטלוג, מצא ספקים שמעניינים אותך, ולחץ על &quot;הוסף לרשימה שלי&quot;.
            </p>
            <Link
              href="/vendors"
              className="btn-gold mt-6 inline-flex items-center gap-2"
            >
              <Plus size={16} /> עבור לקטלוג הספקים
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen pb-20 px-5">
        <div className="max-w-3xl mx-auto pt-6">
          <Link
            href="/dashboard"
            className="text-sm inline-flex items-center gap-2"
            style={{ color: "var(--foreground-soft)" }}
          >
            <ArrowRight size={14} /> חזרה לדשבורד
          </Link>

          <div className="mt-6">
            <h1 className="text-3xl font-extrabold gradient-gold">הספקים שלי</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
              {enrichedVendors.length} ספקים ברשימה
            </p>
          </div>

          {/* Budget summary */}
          <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="סה״כ סוכם" value={summary.total} accent />
            <SummaryCard label="שולם במקדמות" value={summary.paidDeposits} />
            <SummaryCard label="שולם במלואו" value={summary.fullyPaid} />
            <SummaryCard label="נותר לתשלום" value={summary.remaining} highlight />
          </section>

          {/* Grouped lists */}
          <section className="mt-8 space-y-6">
            {STATUS_ORDER.map((status) => {
              const items = groupedByStatus[status];
              if (items.length === 0) return null;
              return (
                <div key={status}>
                  <h2 className="text-sm font-bold mb-3 inline-flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${SAVED_VENDOR_STATUS_COLORS[status]}`}
                    >
                      {SAVED_VENDOR_STATUS_LABELS[status]}
                    </span>
                    <span style={{ color: "var(--foreground-muted)" }}>
                      ({items.length})
                    </span>
                  </h2>
                  <div className="grid gap-2.5">
                    {items.map(({ saved, catalog }) => (
                      <SavedVendorRow
                        key={saved.vendorId}
                        saved={saved}
                        catalog={catalog}
                        onEdit={() => setEditingId(saved.vendorId)}
                        onRemove={() => {
                          // window.confirm at the call site keeps the modal logic
                          // simple — list-row delete is destructive enough that a
                          // toast-only undo wouldn't be discoverable.
                          if (confirm("להסיר את הספק מהרשימה?")) {
                            actions.removeSavedVendor(saved.vendorId);
                            showToast("הוסר מהרשימה", "info");
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        </div>

        {editingVendor && editingVendor.catalog && (
          <SavedVendorEditModal
            saved={editingVendor.saved}
            catalog={editingVendor.catalog}
            onClose={() => setEditingId(null)}
          />
        )}
      </main>
    </>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: number;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`${accent ? "card-gold" : "card"} p-3 text-center`}>
      <div
        className="text-[10px] uppercase tracking-wide"
        style={{ color: "var(--foreground-muted)" }}
      >
        {label}
      </div>
      <div className={`mt-1 text-xl font-extrabold ltr-num ${highlight ? "text-amber-400" : ""}`}>
        ₪{value.toLocaleString("he-IL")}
      </div>
    </div>
  );
}

function SavedVendorRow({
  saved,
  catalog,
  onEdit,
  onRemove,
}: {
  saved: SavedVendor;
  catalog: Vendor | undefined;
  onEdit: () => void;
  onRemove: () => void;
}) {
  // Catalog can be missing if the catalog file changed and a saved id no
  // longer resolves. We still let the user remove the row so they don't get
  // stuck with phantom entries.
  if (!catalog) {
    return (
      <div className="card p-4 text-sm flex items-center justify-between gap-3">
        <div style={{ color: "var(--foreground-muted)" }}>
          ספק שהוסר מהקטלוג (id: {saved.vendorId.slice(0, 8)})
        </div>
        <button
          onClick={onRemove}
          className="text-red-400 text-xs underline"
          aria-label="הסר את הספק שאינו בקטלוג"
        >
          הסר
        </button>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">{catalog.name}</h3>
            <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              · {VENDOR_TYPE_LABELS[catalog.type]}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {saved.agreedPrice ? (
              <div>
                <Wallet size={12} className="inline" /> ₪
                {saved.agreedPrice.toLocaleString("he-IL")}
              </div>
            ) : null}
            {saved.meetingDate ? (
              <div>
                <Calendar size={12} className="inline" />{" "}
                {new Date(saved.meetingDate).toLocaleDateString("he-IL", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            ) : null}
            {catalog.phone ? (
              <div className="text-xs" style={{ color: "var(--foreground-soft)" }}>
                <Phone size={11} className="inline" /> {catalog.phone}
              </div>
            ) : null}
            {/* R19 P1#1: filter through safeHttpUrl so a malicious or
                legacy `javascript:` / `data:` URL can never end up in href.
                Returns null for invalid schemes — link silently disappears. */}
            {(() => {
              const safeWebsite = catalog.website ? safeHttpUrl(catalog.website) : null;
              return safeWebsite ? (
                <a
                  href={safeWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline"
                  style={{ color: "var(--accent)" }}
                >
                  <ExternalLink size={11} className="inline" /> אתר
                </a>
              ) : null;
            })()}
          </div>
          {saved.notes ? (
            <p className="mt-2 text-xs" style={{ color: "var(--foreground-soft)" }}>
              📝 {saved.notes}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onEdit}
            aria-label="ערוך פרטים"
            className="p-2 rounded-lg hover:bg-white/5 transition"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onRemove}
            aria-label="הסר מהרשימה"
            className="p-2 rounded-lg hover:bg-red-400/10 transition text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
