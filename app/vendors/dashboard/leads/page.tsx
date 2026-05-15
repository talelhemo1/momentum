"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Phone,
  Mail,
  Send,
  Filter,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";
import { showToast } from "@/components/Toast";
import { VendorNav } from "@/components/vendors/VendorNav";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { useVendorContext } from "@/lib/useVendorContext";
import {
  VENDOR_LEAD_STATUS_LABELS,
  VENDOR_LEAD_SOURCE_LABELS,
  type VendorLead,
  type VendorLeadStatus,
} from "@/lib/types";

/**
 * Vendor → Leads page. Lists every couple that contacted this vendor,
 * with quick-action buttons to mark contacted / send a quote / mark
 * won / mark lost. Filters by status + source + date range.
 *
 * Send-quote opens a small modal — amount + valid_until + terms — that
 * POSTs to /api/vendors/quote (TODO Phase 2; the row is inserted
 * client-side here for now since vendor_quotes INSERT is allowed by RLS).
 */

const STATUS_FILTERS: ReadonlyArray<{ id: VendorLeadStatus | "all"; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "pending", label: "ממתינים" },
  { id: "contacted", label: "יצרתי קשר" },
  { id: "quoted", label: "נשלחה הצעה" },
  { id: "won", label: "זכייה" },
  { id: "lost", label: "הפסד" },
];

export default function VendorLeadsPage() {
  const { isVendor, vendorLanding, isLoading: ctxLoading } = useVendorContext();
  const [leads, setLeads] = useState<VendorLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VendorLeadStatus | "all">("all");
  const [quotingLead, setQuotingLead] = useState<VendorLead | null>(null);

  // React 19's compiler insists the dep array match the actual values
  // read — referencing `vendorLanding?.slug` here makes the compiler see
  // `vendorLanding` as the dep. Lift the slug to a local so the
  // dependency is just the slug string.
  const vendorSlug = vendorLanding?.slug ?? null;
  const loadLeads = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !vendorSlug) return;
    const { data, error: e } = (await supabase
      .from("vendor_leads")
      .select("*")
      .eq("vendor_id", vendorSlug)
      .order("created_at", { ascending: false })) as {
      data: VendorLead[] | null;
      error: { message: string } | null;
    };
    if (e) {
      setError(e.message);
      return;
    }
    setLeads(data ?? []);
  }, [vendorSlug]);

  useEffect(() => {
    if (ctxLoading) return;
    if (!isVendor || !vendorLanding) {
      // Documented "load on mount" — fires once when context resolves
      // to "no vendor". The early flag flip is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    const hardTimeout = window.setTimeout(() => {
      setError("הטעינה לוקחת יותר מהרגיל.");
      setLoading(false);
    }, 12000);
    (async () => {
      try {
        await loadLeads();
      } catch (e) {
        console.error("[vendors/leads]", e);
        setError(e instanceof Error ? e.message : "שגיאה");
      } finally {
        window.clearTimeout(hardTimeout);
        setLoading(false);
      }
    })();
    return () => {
      window.clearTimeout(hardTimeout);
    };
  }, [ctxLoading, isVendor, vendorLanding, loadLeads]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return leads;
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  const updateStatus = async (lead: VendorLead, status: VendorLeadStatus) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: e } = (await supabase
      .from("vendor_leads")
      .update({ status } as unknown as never)
      .eq("id", lead.id)) as { error: { message: string } | null };
    if (e) {
      showToast(e.message, "error");
      return;
    }
    showToast("עודכן", "success");
    void loadLeads();
  };

  if (ctxLoading || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (!isVendor) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center">
          <p>אזור הספקים בלבד.</p>
          <Link href="/" className="text-xs underline mt-3 inline-block" style={{ color: "var(--foreground-muted)" }}>
            חזרה
          </Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle size={32} className="mx-auto text-amber-400" aria-hidden />
          <p className="mt-4 text-sm" style={{ color: "var(--foreground-soft)" }}>
            {error}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen pb-24 md:pb-20 md:pe-64"
      style={{ background: "var(--surface-0)" }}
    >
      <VendorNav publicSlug={vendorLanding?.slug ?? null} />

      <header
        className="sticky top-0 z-30 backdrop-blur-md border-b"
        style={{ background: "rgba(20,16,12,0.92)", borderColor: "var(--border)" }}
      >
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link
            href="/vendors/dashboard"
            aria-label="חזרה לדשבורד"
            className="p-2 rounded-lg hover:bg-white/5"
          >
            <ArrowRight size={20} aria-hidden />
          </Link>
          <Logo size={20} />
          <div className="flex-1">
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--foreground-muted)" }}
            >
              לידים
            </div>
            <div className="font-bold text-sm">
              <span className="ltr-num">{leads.length}</span> לידים סה״כ
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 pt-6 space-y-4">
        {/* Status filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Filter size={14} className="shrink-0 text-[--accent]" aria-hidden />
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.id;
            const count =
              f.id === "all" ? leads.length : leads.filter((l) => l.status === f.id).length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition"
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                        color: "#1A1310",
                      }
                    : {
                        background: "var(--input-bg)",
                        border: "1px solid var(--border)",
                        color: "var(--foreground-soft)",
                      }
                }
              >
                {f.label} <span className="ltr-num">({count})</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<MessageCircle size={28} aria-hidden />}
            title="אין לידים כרגע"
            description="ברגע שזוג ילחץ 'שלח התעניינות' בעמוד הנחיתה שלך — הליד יופיע כאן."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                onUpdate={(s) => void updateStatus(lead, s)}
                onQuote={() => setQuotingLead(lead)}
              />
            ))}
          </div>
        )}
      </div>

      {quotingLead && (
        <QuoteModal
          lead={quotingLead}
          onClose={() => setQuotingLead(null)}
          onSent={() => {
            setQuotingLead(null);
            void loadLeads();
          }}
        />
      )}
    </main>
  );
}

function LeadRow({
  lead,
  onUpdate,
  onQuote,
}: {
  lead: VendorLead;
  onUpdate: (s: VendorLeadStatus) => void;
  onQuote: () => void;
}) {
  const status = VENDOR_LEAD_STATUS_LABELS[lead.status];
  const sourceLabel = lead.source ? VENDOR_LEAD_SOURCE_LABELS[lead.source] : null;
  const created = new Date(lead.created_at).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <article className="card p-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold">{lead.couple_name ?? "זוג"}</div>
          <div
            className="text-xs mt-0.5 flex items-center gap-3 flex-wrap ltr-num"
            style={{ color: "var(--foreground-muted)" }}
          >
            {lead.couple_phone && (
              <a
                href={`tel:${lead.couple_phone}`}
                className="inline-flex items-center gap-1 hover:text-[--accent]"
              >
                <Phone size={11} aria-hidden /> {lead.couple_phone}
              </a>
            )}
            {lead.couple_email && (
              <a
                href={`mailto:${lead.couple_email}`}
                className="inline-flex items-center gap-1 hover:text-[--accent]"
              >
                <Mail size={11} aria-hidden /> {lead.couple_email}
              </a>
            )}
            <span>{created}</span>
            {sourceLabel && (
              <span>
                · <span style={{ color: "var(--foreground-soft)" }}>{sourceLabel}</span>
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${status.color}`}
        >
          {status.label}
        </span>
      </header>

      {lead.message && (
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--foreground-soft)" }}
        >
          {lead.message}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap gap-2">
        {lead.status === "pending" && (
          <button
            type="button"
            onClick={() => onUpdate("contacted")}
            className="text-xs px-3 py-1.5 rounded-full bg-sky-400/15 text-sky-300 border border-sky-400/30 inline-flex items-center gap-1.5"
          >
            <CheckCircle2 size={12} aria-hidden /> סמן צרתי קשר
          </button>
        )}
        {(lead.status === "pending" || lead.status === "contacted") && (
          <button
            type="button"
            onClick={onQuote}
            className="text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
            style={{
              background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
              color: "#1A1310",
            }}
          >
            <Send size={12} aria-hidden /> שלח הצעת מחיר
          </button>
        )}
        {lead.status !== "won" && lead.status !== "lost" && (
          <>
            <button
              type="button"
              onClick={() => onUpdate("won")}
              className="text-xs px-3 py-1.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 inline-flex items-center gap-1.5"
            >
              <CheckCircle2 size={12} aria-hidden /> זכייה
            </button>
            <button
              type="button"
              onClick={() => onUpdate("lost")}
              className="text-xs px-3 py-1.5 rounded-full bg-red-400/10 text-red-300 border border-red-400/30 inline-flex items-center gap-1.5"
            >
              <XCircle size={12} aria-hidden /> הפסד
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

function QuoteModal({
  lead,
  onClose,
  onSent,
}: {
  lead: VendorLead;
  onClose: () => void;
  onSent: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [terms, setTerms] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (sending) return;
    const cleaned = amount.replace(/[,\s]/g, "");
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      showToast("הזן סכום תקין בש״ח", "error");
      return;
    }
    setSending(true);
    const supabase = getSupabase();
    if (!supabase) {
      showToast("השירות לא זמין", "error");
      setSending(false);
      return;
    }
    const { error } = (await supabase
      .from("vendor_quotes")
      .insert({
        lead_id: lead.id,
        amount_agorot: Math.round(n * 100),
        valid_until: validUntil || null,
        terms: terms.trim() || null,
      } as unknown as never)) as { error: { message: string } | null };
    if (error) {
      showToast(error.message, "error");
      setSending(false);
      return;
    }
    // Bump the lead status to quoted so the dashboard reflects it.
    await supabase
      .from("vendor_leads")
      .update({ status: "quoted" } as unknown as never)
      .eq("id", lead.id);
    showToast("ההצעה נשלחה", "success");
    onSent();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="card glass-strong p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-1">שלח הצעת מחיר</h3>
        <p className="text-xs mb-5" style={{ color: "var(--foreground-muted)" }}>
          ל-{lead.couple_name ?? "זוג"}
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              סכום
            </span>
            {/* R18 §L — shared MoneyInput (fixed ₪ chip + comma parser). */}
            <MoneyInput value={amount} onChange={setAmount} ariaLabel="סכום ההצעה בשקלים" />
          </label>
          <label className="block">
            <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              תוקף ההצעה (אופציונלי)
            </span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              הערות / תנאים
            </span>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              className="input"
              placeholder="כולל כל החבילה, 50% מקדמה..."
            />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl py-3 text-sm"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending}
            className="btn-gold py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="animate-spin" size={14} aria-hidden />
            ) : (
              <>
                <Send size={14} aria-hidden /> שלח
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
