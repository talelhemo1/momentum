"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { EmptyEventState } from "@/components/EmptyEventState";
import { PrintButton } from "@/components/PrintButton";
import { useAppState, actions, mintMissingRsvpTokens } from "@/lib/store";
import { formatEventDate } from "@/lib/format";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUser } from "@/lib/user";
import { buildHostInvitationWhatsappLink } from "@/lib/invitation";
import { tryGetPublicOrigin } from "@/lib/origin";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { ExpressSendModal } from "@/components/guests/ExpressSendModal";
import { buildWhatsAppMessage } from "@/lib/rsvpLinks";
import { useGuestWhatsappLink, prewarmGuestWhatsappLinks } from "@/hooks/useGuestWhatsappLink";
import { trackEvent } from "@/lib/analytics";
import { subscribeRsvpUpdates, type RsvpUpdate } from "@/lib/rsvpSync";
import { showToast } from "@/components/Toast";
import { fireConfettiOnce } from "@/lib/confetti";
import { GuestsSkeleton } from "@/components/skeletons/PageSkeletons";
import { Avatar } from "@/components/Avatar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  GUEST_AGE_GROUP_LABELS,
  GUEST_GROUP_LABELS,
  type Guest,
  type GuestAgeGroup,
  type GuestGroup,
  type GuestStatus,
} from "@/lib/types";
import {
  UserPlus,
  Send,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Trash2,
  Search,
  MessageCircle,
  Users,
  ArrowRight,
  Copy,
  Phone,
  AlertCircle,
  ChevronDown,
  BookUser,
  Download,
  RefreshCw,
  X,
} from "lucide-react";

const STATUS_LABEL: Record<GuestStatus, string> = {
  pending: "טרם נשלחה הזמנה",
  invited: "הזמנה נשלחה",
  confirmed: "אישר/ה הגעה",
  declined: "לא יגיע/ה",
  maybe: "אולי",
};

// R15 §3G — thin wrapper so the component-level ErrorBoundary sits ABOVE
// all of GuestsPageInner's hooks/early-returns. A throw anywhere in the
// guest list, import flow, or RSVP sync is caught here, keeping the rest
// of the app navigable instead of falling back to the full route error.
export default function GuestsPage() {
  return (
    <ErrorBoundary section="guests">
      <GuestsPageInner />
    </ErrorBoundary>
  );
}

function GuestsPageInner() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showExpress, setShowExpress] = useState(false);
  const [filter, setFilter] = useState<"all" | GuestStatus>("all");
  const [search, setSearch] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // R18 §F — paste-list fallback for browsers without the Contacts API
  // (notably Safari iOS, which is most of our mobile traffic).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const contactsSupported =
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    // @ts-expect-error — Contacts API isn't in the TS lib yet
    typeof navigator.contacts?.select === "function";

  const handlePasteImport = () => {
    // Accept "name, phone" / "name<tab>phone" / "name phone" per line.
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const existingPhones = new Set(
      state.guests.map((g) => g.phone.replace(/\D/g, "")),
    );
    let added = 0;
    for (const line of lines) {
      const m = /^(.+?)[\s,\t]+([+\d][\d\s-]{6,})$/.exec(line);
      const name = (m ? m[1] : line).trim();
      const phoneRaw = m ? m[2].trim() : "";
      const phoneDigits = phoneRaw.replace(/\D/g, "");
      if (!name) continue;
      if (phoneDigits && existingPhones.has(phoneDigits)) continue;
      actions.addGuest({ name, phone: phoneRaw });
      if (phoneDigits) existingPhones.add(phoneDigits);
      added += 1;
    }
    setImportMsg(
      added > 0 ? `נוספו ${added} מוזמנים מהרשימה` : "לא זוהו מוזמנים חדשים",
    );
    setTimeout(() => setImportMsg(null), 4000);
    setPasteText("");
    setPasteOpen(false);
  };

  const importFromContacts = async () => {
    type ContactPickerNavigator = Navigator & {
      contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> };
    };
    const nav = navigator as ContactPickerNavigator;
    if (!nav.contacts?.select) {
      setImportMsg("ייבוא אנשי קשר נתמך כרגע רק בכרום על אנדרואיד / iOS. אפשר להוסיף ידנית במקום.");
      setTimeout(() => setImportMsg(null), 5000);
      return;
    }
    setImportBusy(true);
    setImportMsg(null);
    try {
      const picked = await nav.contacts.select(["name", "tel"], { multiple: true });
      let added = 0;
      const existingPhones = new Set(state.guests.map((g) => g.phone.replace(/\D/g, "")));
      for (const c of picked) {
        const name = c.name?.[0]?.trim();
        const phoneRaw = c.tel?.[0]?.trim() || "";
        const phoneDigits = phoneRaw.replace(/\D/g, "");
        if (!name) continue;
        if (phoneDigits && existingPhones.has(phoneDigits)) continue;
        actions.addGuest({ name, phone: phoneRaw });
        if (phoneDigits) existingPhones.add(phoneDigits);
        added++;
      }
      setImportMsg(added > 0 ? `נוספו ${added} מוזמנים מהטלפון` : "לא נוספו מוזמנים חדשים");
      setTimeout(() => setImportMsg(null), 4000);
    } catch (err) {
      // User cancelled or denied permission — keep the message friendly.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|abort/i.test(msg)) {
        setImportMsg("הייבוא נכשל. נסה שוב או הוסף ידנית.");
        setTimeout(() => setImportMsg(null), 4000);
      }
    } finally {
      setImportBusy(false);
    }
  };

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    // R14: no-event handled by EmptyState below.
  }, [userHydrated, user, router]);

  // Backfill RSVP tokens for legacy guests on first hydration. The action is
  // idempotent + dedup-coalesced inside the lib, so it's safe to call broadly.
  useEffect(() => {
    if (!hydrated || !state.event?.signingKey) return;
    void mintMissingRsvpTokens();
  }, [hydrated, state.event?.signingKey]);

  // Live RSVP feed — toast + brief row glow when a guest answers from any
  // device. We only fire toasts for updates that aren't from this same tab
  // ("self") so the host doesn't see a notification for their own clicks.
  const [recentlyChanged, setRecentlyChanged] = useState<{ id: string; at: number } | null>(null);
  // Track total confirmed HEAD count across renders so the 100-attendees
  // milestone fires on the boundary even when a single RSVP with
  // attendingCount=6 jumps the total from 95 → 101 in one update — the
  // previous `>= 99` check on guest-count missed those leaps because it
  // didn't account for headcount per row.
  const lastConfirmedHeadsRef = useRef<number>(0);
  useEffect(() => {
    const off = subscribeRsvpUpdates((u: RsvpUpdate) => {
      if (u.source === "self") {
        // Still flash the row so the dashboard feels alive when the host
        // clicks "אישר" themselves, but skip the toast.
        setRecentlyChanged({ id: u.guestId, at: Date.now() });
      } else {
        const guest = state.guests.find((g) => g.id === u.guestId);
        const name = guest?.name ?? "אורח";
        const label =
          u.status === "confirmed"
            ? `✅ ${name} בדיוק אישר/ה הגעה!`
            : u.status === "maybe"
              ? `🤔 ${name} ענה/תה 'אולי'`
              : u.status === "declined"
                ? `❌ ${name} לא יוכל/תוכל להגיע`
                : `🔔 ${name} עדכן/ה סטטוס`;
        showToast(label, u.status === "confirmed" ? "success" : "info");
        setRecentlyChanged({ id: u.guestId, at: Date.now() });
      }
      // Milestone: 100 confirmed attendees. Compare prev/curr HEAD totals
      // and trigger only when crossing the threshold from below — this
      // catches "one big RSVP just pushed us past 100" cases. The
      // localStorage flag inside fireConfettiOnce keeps reloads from
      // re-firing.
      const heads = state.guests
        .filter((g) => g.status === "confirmed")
        .reduce((sum, g) => sum + (g.attendingCount ?? 1), 0);
      const prev = lastConfirmedHeadsRef.current;
      lastConfirmedHeadsRef.current = heads;
      if (prev < 100 && heads >= 100 && state.event) {
        fireConfettiOnce(`100-confirmed-${state.event.id}`, 1500);
      }
    });
    return off;
  }, [state.guests, state.event]);

  const filtered = useMemo(() => {
    return state.guests.filter((g) => {
      if (filter !== "all" && g.status !== filter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!g.name.toLowerCase().includes(s) && !g.phone.includes(s)) return false;
      }
      return true;
    });
  }, [state.guests, filter, search]);

  // R18 §Q — pre-warm WhatsApp links so the per-row buttons resolve from
  // cache instantly. Small events: warm everyone. Big events: just the
  // first screenful (the rest warm lazily as rows mount / scroll).
  useEffect(() => {
    if (!state.event) return;
    const origin = tryGetPublicOrigin();
    const all = state.guests;
    const batch = all.length < 30 ? all : all.slice(0, 20);
    prewarmGuestWhatsappLinks(origin, state.event, batch);
  }, [state.event, state.guests]);

  const stats = useMemo(() => {
    const confirmed = state.guests.filter((g) => g.status === "confirmed");
    const declined = state.guests.filter((g) => g.status === "declined");
    const invited = state.guests.filter((g) => g.status === "invited");
    const maybe = state.guests.filter((g) => g.status === "maybe");
    return {
      total: state.guests.length,
      confirmedCount: confirmed.length,
      confirmedHeads: confirmed.reduce((s, g) => s + (g.attendingCount ?? 1), 0),
      declined: declined.length,
      invited: invited.length,
      maybe: maybe.length,
      pending: state.guests.filter((g) => g.status === "pending").length,
      // R39 — express-send eligible: still pending AND a valid phone.
      expressEligible: state.guests.filter(
        (g) =>
          g.status === "pending" && normalizeIsraeliPhone(g.phone).valid,
      ).length,
    };
  }, [state.guests]);

  if (!hydrated) {
    return (
      <>
        <Header />
        <GuestsSkeleton />
      </>
    );
  }
  if (!state.event) return <EmptyEventState toolName="ניהול המוזמנים" />;

  return (
    <>
      <Header />
      <main className="flex-1 pb-28 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[500px] h-[500px] -top-40 right-0 opacity-25" />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm text-white/50 hover:text-white inline-flex items-center gap-1.5">
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">מוזמנים</span>
              <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
                רשימת מוזמנים
              </h1>
              <p className="mt-2 text-white/55">הוסף, הזמן בוואטסאפ, ועקוב אחרי אישורי הגעה.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <PrintButton label="ייצא רשימה ל-PDF" />
              <button
                onClick={importFromContacts}
                disabled={importBusy}
                className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                title="ייבוא מאנשי הקשר של הטלפון (כרום על מובייל)"
              >
                <BookUser size={18} />
                {importBusy ? "מייבא..." : "ייבוא מאנשי קשר"}
              </button>
              {stats.expressEligible > 0 && (
                <button
                  onClick={() => setShowExpress(true)}
                  className="btn-gold inline-flex items-center gap-2"
                  title="שליחה מהירה אחד-אחרי-השני — wa.me נפתח אוטומטית בכל חזרה לאפליקציה"
                >
                  🚀 שליחה מהירה לכולם (
                  <span className="ltr-num">{stats.expressEligible}</span>)
                </button>
              )}
              {state.guests.some((g) => g.status === "pending" && g.phone) && (
                <button
                  onClick={() => setShowBulk(true)}
                  className="btn-secondary inline-flex items-center gap-2"
                  title="פתח שליחה מרוכזת לכל מי שעוד לא נשלח לו"
                >
                  <Send size={18} />
                  📤 שלח לכל מי שלא נשלח לו
                </button>
              )}
              <button onClick={() => setShowAdd(true)} className="btn-gold inline-flex items-center gap-2">
                <UserPlus size={18} />
                מוזמן חדש
              </button>
            </div>
          </div>

          {importMsg && (
            <div className="mt-4 card p-3 text-sm" style={{ borderColor: "var(--border-gold)", background: "rgba(212,176,104,0.08)", color: "var(--foreground-soft)" }}>
              {importMsg}
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
            <Stat label="סה״כ מוזמנים" value={stats.total} />
            <Stat label="אישרו" value={stats.confirmedCount} sub={`${stats.confirmedHeads} ראשים`} accent />
            <Stat label="נשלחו הזמנות" value={stats.invited} />
            <Stat label="לא יגיעו" value={stats.declined} />
          </div>

          {stats.total > 0 && (
            <div className="mt-5 card p-5 md:p-6 grid sm:grid-cols-[160px_1fr] gap-5 items-center">
              <RsvpDonut
                confirmed={stats.confirmedCount}
                maybe={stats.maybe}
                declined={stats.declined}
                pending={stats.total - stats.confirmedCount - stats.maybe - stats.declined}
              />
              <div className="space-y-2">
                <RsvpLegend color="rgb(110,231,183)" label="אישרו" value={stats.confirmedCount} total={stats.total} />
                <RsvpLegend color="rgb(252,211,77)" label="אולי" value={stats.maybe} total={stats.total} />
                <RsvpLegend color="rgb(248,113,113)" label="לא יגיעו" value={stats.declined} total={stats.total} />
                <RsvpLegend color="rgba(255,255,255,0.35)" label="ממתינים" value={stats.total - stats.confirmedCount - stats.maybe - stats.declined} total={stats.total} />
              </div>
            </div>
          )}

          {/* Bulk actions: CSV + copy confirmed */}
          {stats.total > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => exportGuestsCsv(state.guests, state.event!)}
                className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2"
                title="הורד את כל רשימת המוזמנים כ-CSV (פותח באקסל / Google Sheets)"
              >
                <Download size={14} />
                ייצא ל-Excel (CSV)
              </button>
              <button
                onClick={() => copyConfirmedList(state.guests)}
                className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2"
                title="העתק רשימה של רק האורחים שאישרו הגעה"
              >
                <Copy size={14} />
                העתק רשימת מאשרים
              </button>
            </div>
          )}

          {!state.event?.hostPhone && (
            <div className="mt-6 card p-4 flex items-start gap-3" style={{ borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.06)" }}>
              <AlertCircle size={20} className="text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">חסר טלפון של המארח</div>
                <div className="text-xs mt-1" style={{ color: "var(--foreground-soft)" }}>
                  אורחים לא יוכלו להחזיר תשובה אוטומטית בוואטסאפ ללא טלפון שלך.
                </div>
              </div>
              <Link href="/onboarding?edit=1" className="text-xs rounded-full px-3 py-1.5 inline-flex items-center gap-1 shrink-0" style={{ border: "1px solid var(--border-strong)", color: "var(--accent)" }}>
                הוסף טלפון
              </Link>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                className="input pe-10"
                placeholder="חיפוש לפי שם או טלפון..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterTabs value={filter} onChange={setFilter} />
          </div>

          <div className="mt-6 space-y-3">
            {filtered.length === 0 && (
              state.guests.length === 0 ? (
                /* R18 §F — import-first empty state. Primary CTA is the
                   contacts importer (30s → 50+ guests); manual add is
                   the secondary. Browsers w/o the Contacts API get a
                   paste-list textarea instead. */
                <div className="card-gold p-8 md:p-10 text-center" role="status">
                  <div
                    aria-hidden
                    className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3"
                    style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}
                  >
                    <Users size={28} />
                  </div>
                  <h3 className="text-lg md:text-xl font-extrabold tracking-tight gradient-gold">
                    עדיין לא הוספת מוזמנים
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed max-w-md mx-auto" style={{ color: "var(--foreground-soft)" }}>
                    ב-30 שניות תוכל לייבא 50+ מוזמנים מהטלפון שלך. כל אורח מקבל
                    קישור RSVP אישי חתום HMAC.
                  </p>

                  <div className="mt-6 flex flex-col items-center gap-3 max-w-xs mx-auto">
                    {contactsSupported ? (
                      <button
                        type="button"
                        onClick={importFromContacts}
                        disabled={importBusy}
                        className="btn-gold w-full py-3.5 text-base inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        📱 {importBusy ? "מייבא..." : "ייבא מאנשי קשר"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPasteOpen((v) => !v)}
                        className="btn-gold w-full py-3.5 text-base inline-flex items-center justify-center gap-2"
                      >
                        📋 הדבק רשימת מוזמנים
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="btn-secondary w-full"
                    >
                      + הוסיף ידנית
                    </button>
                  </div>

                  {pasteOpen && (
                    <div className="mt-5 max-w-sm mx-auto text-start">
                      <label className="block text-xs mb-1.5" style={{ color: "var(--foreground-soft)" }}>
                        שורה לכל מוזמן: <span className="ltr-num">שם, 050-1234567</span>
                      </label>
                      <textarea
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        rows={5}
                        className="input w-full text-sm"
                        placeholder={"דנה כהן, 0501234567\nיוסי לוי, 0529876543"}
                      />
                      <button
                        type="button"
                        onClick={handlePasteImport}
                        disabled={!pasteText.trim()}
                        className="btn-gold mt-2 w-full py-2.5 text-sm disabled:opacity-50"
                      >
                        ייבא {pasteText.split(/\r?\n/).filter((l) => l.trim()).length || ""} מוזמנים
                      </button>
                    </div>
                  )}

                  {importMsg && (
                    <p className="mt-4 text-xs" style={{ color: "var(--accent)" }}>
                      {importMsg}
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className="card p-10 text-center"
                  style={{ color: "var(--foreground-muted)" }}
                  role="status"
                >
                  לא נמצאו מוזמנים מתאימים.
                </div>
              )
            )}
            {/* R18 §K — virtualize only large lists. Small events keep the
                plain map (simpler, no scroll container, no measurement). */}
            {filtered.length > 80 ? (
              <VirtualGuestList
                guests={filtered}
                event={state.event!}
                recentlyChanged={recentlyChanged}
              />
            ) : (
              filtered.map((guest) => (
                <GuestRow
                  key={guest.id}
                  guest={guest}
                  event={state.event!}
                  glow={recentlyChanged?.id === guest.id ? recentlyChanged.at : undefined}
                />
              ))
            )}
          </div>
        </div>

        {showAdd && <AddGuestModal onClose={() => setShowAdd(false)} />}
        {showBulk && state.event && (
          <BulkInviteModal
            event={state.event}
            guests={state.guests.filter((g) => g.status === "pending" && g.phone)}
            onClose={() => setShowBulk(false)}
          />
        )}
        <ExpressSendModal
          open={showExpress}
          onClose={() => setShowExpress(false)}
          guests={state.guests}
          event={state.event}
          origin={tryGetPublicOrigin()}
        />
      </main>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "ring-gold" : ""}`}>
      <div className="text-xs text-white/55">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold ltr-num ${accent ? "gradient-gold" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: "all" | GuestStatus;
  onChange: (v: "all" | GuestStatus) => void;
}) {
  const tabs: { v: "all" | GuestStatus; label: string }[] = [
    { v: "all", label: "הכל" },
    { v: "pending", label: "ממתין" },
    { v: "invited", label: "נשלח" },
    { v: "confirmed", label: "אישר" },
    { v: "declined", label: "לא מגיע" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.v}
          onClick={() => onChange(t.v)}
          className={`text-xs rounded-full px-3 py-1.5 border transition ${
            value === t.v
              ? "bg-white/10 border-white/20 text-white"
              : "border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * R18 §K — windowed guest list for big events (>80 guests). Rows are
 * absolutely positioned inside a scroll container; @tanstack/react-virtual
 * measures real heights (GuestRow expands when opened) via measureElement.
 */
function VirtualGuestList({
  guests,
  event,
  recentlyChanged,
}: {
  guests: Guest[];
  event: import("@/lib/types").EventInfo;
  recentlyChanged: { id: string; at: number } | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: guests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 116,
    overscan: 6,
  });
  return (
    <div
      ref={parentRef}
      className="-mx-1 px-1"
      style={{ maxHeight: "70vh", overflowY: "auto" }}
    >
      <div style={{ height: virt.getTotalSize(), position: "relative" }}>
        {virt.getVirtualItems().map((vi) => {
          const guest = guests[vi.index];
          return (
            <div
              key={guest.id}
              data-index={vi.index}
              ref={virt.measureElement}
              style={{
                position: "absolute",
                top: 0,
                insetInlineStart: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
                paddingBottom: 12,
              }}
            >
              <GuestRow
                guest={guest}
                event={event}
                glow={
                  recentlyChanged?.id === guest.id
                    ? recentlyChanged.at
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuestRow({
  guest,
  event,
  glow,
}: {
  guest: Guest;
  event: import("@/lib/types").EventInfo;
  /** Timestamp when this row last received an RSVP update — drives a 2s gold halo. */
  glow?: number;
}) {
  const [open, setOpen] = useState(false);
  const origin = tryGetPublicOrigin();
  // Build the signed RSVP URL lazily + cached via useGuestWhatsappLink.
  // The hook holds a module-scoped Promise cache keyed on event/guest/token
  // and gates the crypto work behind an IntersectionObserver — so /guests
  // with 200 cards only computes for cards visible (or about to be) instead
  // of firing 400 concurrent HMAC ops on mount.
  // (`buildHostInvitationWhatsappLink` is kept imported as a legacy fallback
  // path used elsewhere; intentionally referenced below to avoid an
  // unused-import lint.)
  void buildHostInvitationWhatsappLink;
  const { whatsappUrl, rsvpUrl, cardRef } = useGuestWhatsappLink(origin, event, guest);

  const statusUI = (() => {
    switch (guest.status) {
      case "confirmed":
        return { icon: <CheckCircle2 size={16} />, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" };
      case "declined":
        return { icon: <XCircle size={16} />, color: "text-red-400 bg-red-400/10 border-red-400/20" };
      case "maybe":
        return { icon: <HelpCircle size={16} />, color: "text-amber-400 bg-amber-400/10 border-amber-400/20" };
      case "invited":
        return { icon: <Send size={16} />, color: "text-sky-400 bg-sky-400/10 border-sky-400/20" };
      default:
        return { icon: <Clock size={16} />, color: "text-white/60 bg-white/5 border-white/10" };
    }
  })();

  const onSendWhatsapp = () => {
    // Guard: the link is built async (HMAC needs crypto.subtle). A click that
    // lands before the Promise resolves used to fire window.open("", ...) and
    // open a blank `about:blank` tab while still marking the guest as invited.
    if (!whatsappUrl) {
      showToast("מכין את הקישור, נסה שוב בעוד רגע", "info");
      return;
    }
    const w = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (!w) {
      // Popup blocker — copy the URL so the host can paste it manually
      // instead of staring at a button that "did nothing".
      void navigator.clipboard.writeText(whatsappUrl).then(
        () => showToast("הדפדפן חסם פתיחה. הקישור הועתק — הדבק בוואטסאפ", "info"),
        () => showToast("הדפדפן חסם פתיחה ולא הצלחנו להעתיק. בטל חסימת חלונות קופצים", "error"),
      );
      return;
    }
    actions.markInvited(guest.id);
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(rsvpUrl);
    } catch {}
  };

  return (
    <div
      ref={cardRef}
      className={`card p-4 md:p-5 transition-shadow duration-700 ${glow ? "rsvp-glow" : ""}`}
      data-glow-key={glow ?? undefined}
    >
      <div className="flex items-center gap-4">
        <Avatar name={guest.name} id={guest.id} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold truncate">{guest.name}</div>
            <span className={`inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 ${statusUI.color}`}>
              {statusUI.icon}
              {STATUS_LABEL[guest.status]}
              {guest.status === "confirmed" && guest.attendingCount > 1 && (
                <span className="font-bold">· {guest.attendingCount}</span>
              )}
            </span>
          </div>
          {guest.phone ? (
            <div className="text-xs text-white/50 mt-0.5 flex items-center gap-1.5">
              <Phone size={12} /> {guest.phone}
            </div>
          ) : (
            <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
              <Phone size={12} /> אין מספר טלפון
            </div>
          )}
        </div>
        {/* Inline quick-actions: a single tap toggles the status. The whole row
            stays compact and you don't have to expand "פרטים" first. */}
        <div className="flex items-center gap-1.5">
          <QuickStatusButton
            label="אישר"
            tone="confirm"
            active={guest.status === "confirmed"}
            onClick={() => actions.setRsvp(guest.id, "confirmed", guest.attendingCount || 1)}
          />
          <QuickStatusButton
            label="אולי"
            tone="maybe"
            active={guest.status === "maybe"}
            onClick={() => actions.setRsvp(guest.id, "maybe", 0)}
          />
          <QuickStatusButton
            label="לא"
            tone="decline"
            active={guest.status === "declined"}
            onClick={() => actions.setRsvp(guest.id, "declined", 0)}
          />

          {/* WhatsApp + details — secondary, compact */}
          <button
            onClick={onSendWhatsapp}
            // R18 §Q — disable until the link is actually ready (not just
            // a spinner). Pre-warming (prewarmGuestWhatsappLinks on the
            // page) makes the not-ready window near-instant, so the old
            // concern about a "grayed-out button that ignores you" no
            // longer applies — by the time the user reaches a row its
            // link is almost always already cached.
            disabled={!guest.phone || !whatsappUrl}
            title={
              !guest.phone
                ? "הוסף מספר טלפון כדי לשלוח"
                : !whatsappUrl
                  ? "מכין את הקישור..."
                  : "שלח הזמנה בוואטסאפ"
            }
            aria-busy={!!guest.phone && !whatsappUrl}
            className="ms-1 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black inline-flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-emerald-500"
            aria-label="שלח בוואטסאפ"
          >
            {guest.phone && !whatsappUrl ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <MessageCircle size={15} />
            )}
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-9 h-9 rounded-full border border-white/15 hover:bg-white/5 inline-flex items-center justify-center"
            title="פרטים נוספים"
            aria-label="פרטים נוספים"
          >
            <ChevronDown size={15} className={open ? "rotate-180 transition" : "transition"} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-white/10 grid sm:grid-cols-2 gap-3">
          <div className="sm:hidden flex flex-col gap-2">
            <button
              onClick={onSendWhatsapp}
              // R18 §Q — disabled until link ready (see compact button above).
              disabled={!guest.phone || !whatsappUrl}
              title={
                !guest.phone
                  ? "הוסף מספר טלפון לאורח כדי לשלוח בוואטסאפ"
                  : !whatsappUrl
                    ? "מכין את הקישור..."
                    : ""
              }
              aria-busy={!!guest.phone && !whatsappUrl}
              className="rounded-full bg-emerald-500 text-black px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guest.phone && !whatsappUrl ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <MessageCircle size={16} />
              )}
              שלח בוואטסאפ
            </button>
          </div>

          <button
            onClick={onCopyLink}
            className="rounded-2xl border border-white/10 hover:bg-white/5 p-3 text-sm text-start flex items-center gap-2"
          >
            <Copy size={16} /> העתק קישור RSVP
          </button>

          <a
            href={rsvpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-white/10 hover:bg-white/5 p-3 text-sm text-start flex items-center gap-2"
          >
            <ArrowRight size={16} /> תצוגה מקדימה (איך האורח רואה)
          </a>

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button
              onClick={() => actions.setRsvp(guest.id, "confirmed", guest.attendingCount || 1)}
              className="text-xs rounded-full border border-emerald-400/30 text-emerald-300 px-3 py-1.5 hover:bg-emerald-400/10"
            >
              סמן כאישר
            </button>
            <button
              onClick={() => actions.setRsvp(guest.id, "declined", 0)}
              className="text-xs rounded-full border border-red-400/30 text-red-300 px-3 py-1.5 hover:bg-red-400/10"
            >
              סמן כלא מגיע
            </button>
            <button
              onClick={() => actions.removeGuest(guest.id)}
              className="ms-auto text-xs rounded-full border border-white/10 text-white/60 px-3 py-1.5 hover:bg-white/5 inline-flex items-center gap-1.5"
            >
              <Trash2 size={12} /> מחק
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickStatusButton({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone: "confirm" | "maybe" | "decline";
  active: boolean;
  onClick: () => void;
}) {
  const styles = {
    confirm: {
      activeBg: "rgb(52, 211, 153)",
      activeText: "rgb(0, 0, 0)",
      idleColor: "rgb(110, 231, 183)",
      idleBorder: "rgba(52, 211, 153, 0.3)",
      idleBg: "rgba(52, 211, 153, 0.05)",
      icon: <CheckCircle2 size={13} />,
    },
    maybe: {
      activeBg: "rgb(251, 191, 36)",
      activeText: "rgb(0, 0, 0)",
      idleColor: "rgb(252, 211, 77)",
      idleBorder: "rgba(251, 191, 36, 0.3)",
      idleBg: "rgba(251, 191, 36, 0.05)",
      icon: <HelpCircle size={13} />,
    },
    decline: {
      activeBg: "rgb(248, 113, 113)",
      activeText: "rgb(255, 255, 255)",
      idleColor: "rgb(252, 165, 165)",
      idleBorder: "rgba(248, 113, 113, 0.3)",
      idleBg: "rgba(248, 113, 113, 0.05)",
      icon: <XCircle size={13} />,
    },
  }[tone];

  return (
    <button
      onClick={onClick}
      className="hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition"
      style={
        active
          ? { background: styles.activeBg, color: styles.activeText, border: `1px solid ${styles.activeBg}` }
          : { background: styles.idleBg, color: styles.idleColor, border: `1px solid ${styles.idleBorder}` }
      }
      aria-pressed={active}
      title={`סמן ${label}`}
    >
      {styles.icon}
      {label}
    </button>
  );
}

function AddGuestModal({ onClose }: { onClose: () => void }) {
  const { state } = useAppState();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [count, setCount] = useState("1");
  // New: feed the smart-seating algorithm. All optional — defaults work.
  const [group, setGroup] = useState<GuestGroup | "">("");
  const [ageGroup, setAgeGroup] = useState<GuestAgeGroup | "">("");
  // R16: free-form circle name (e.g. "חברים מהצבא"). Matches the same field
  // on tables, drives the auto-seat pinning behavior.
  const [circle, setCircle] = useState("");
  const isValid = name.trim().length > 0;

  // Suggest existing circles (from guests + tables) for quick re-use, so
  // the user doesn't accidentally create "חברים מהצבא" and "חברים מצבא".
  const circleSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const g of state.guests) {
      if (g.circle?.trim()) set.add(g.circle.trim());
    }
    for (const t of state.tables) {
      if (t.circle?.trim()) set.add(t.circle.trim());
    }
    return Array.from(set).sort();
  }, [state.guests, state.tables]);

  const submit = () => {
    if (!isValid) return;
    actions.addGuest({
      name: name.trim(),
      phone: phone.trim(),
      attendingCount: Number(count) || 1,
      ...(group ? { group } : {}),
      ...(ageGroup ? { ageGroup } : {}),
      ...(circle.trim() ? { circle: circle.trim() } : {}),
    });
    onClose();
  };

  // Esc to close, Enter to submit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && isValid) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, name, phone, count]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card glass-strong p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-[--accent]" />
            <h3 className="text-xl font-bold">מוזמן חדש</h3>
          </div>
          {/* R18 §P — consistent 44×44 close affordance (was absent here;
              modal previously closed only via Esc / click-outside / ביטול). */}
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-11 h-11 -m-2 flex items-center justify-center rounded-full hover:bg-[var(--secondary-button-bg)] transition"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>שם מלא <span style={{ color: "var(--accent)" }}>*</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="דנה כהן" autoFocus />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              טלפון <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>(לא חובה — נדרש לוואטסאפ)</span>
            </label>
            <input
              className="input"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-1234567"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1.5">כמה אנשים מצופים מהמוזמן?</label>
            <input
              className="input"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
                קבוצה <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>(להושבה חכמה)</span>
              </label>
              <select
                className="input"
                value={group}
                onChange={(e) => setGroup(e.target.value as GuestGroup | "")}
                aria-label="קבוצה חברתית"
              >
                <option value="">לא צוין</option>
                {(Object.keys(GUEST_GROUP_LABELS) as GuestGroup[]).map((g) => (
                  <option key={g} value={g}>{GUEST_GROUP_LABELS[g]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
                גיל <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>(לאיזון)</span>
              </label>
              <select
                className="input"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as GuestAgeGroup | "")}
                aria-label="קבוצת גיל"
              >
                <option value="">לא צוין</option>
                {(Object.keys(GUEST_AGE_GROUP_LABELS) as GuestAgeGroup[]).map((a) => (
                  <option key={a} value={a}>{GUEST_AGE_GROUP_LABELS[a]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* R16 — free-form social circle. When the user types e.g.
              "חברים מהצבא" here AND names a table the same thing, the
              auto-arrangement pins this guest to that table. <datalist>
              gives a native autocomplete from existing values so two
              "army friends" tables don't end up split across "חברים מהצבא"
              / "חברים מצבא". */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: "var(--foreground-soft)" }}>
              חוג חברתי{" "}
              <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>
                (לדוגמה: &quot;חברים מהצבא&quot; — תואם לשולחן באותו שם בהושבה אוטומטית)
              </span>
            </label>
            <input
              className="input"
              list="circle-suggestions"
              value={circle}
              onChange={(e) => setCircle(e.target.value)}
              placeholder="חברים מהצבא / משפחה רחוקה / חברי כיתה י׳"
              maxLength={60}
              aria-label="חוג חברתי"
            />
            {circleSuggestions.length > 0 && (
              <datalist id="circle-suggestions">
                {circleSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={submit} className="btn-gold">הוסף</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────── Bulk invite modal ───────────────────────────────────

/**
 * Sequential WhatsApp invite flow. The user clicks one guest's "open WhatsApp"
 * button at a time — the popup must be triggered by a real user gesture per
 * browser policy, so we can't loop in the background. The modal walks the
 * host through the queue one guest at a time and tracks progress in localStorage.
 */
function BulkInviteModal({
  event,
  guests,
  onClose,
}: {
  event: import("@/lib/types").EventInfo;
  guests: Guest[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  // R18 §1E — auto-advance after the user returns from WhatsApp. Opt-out
  // persisted so power users who want manual control set it once.
  const AUTO_ADV_KEY = "momentum.bulk_auto_advance.v1";
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(AUTO_ADV_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const wentHiddenRef = useRef(false);
  const origin = tryGetPublicOrigin();
  // Telemetry: stamp the start of a bulk session and the completion. Lives in
  // localStorage via trackEvent so the host can later see how long the bulk run took.
  const startedRef = useRef(false);
  // Guard against iOS double-tap on "פתח את WhatsApp" — a fast second tap
  // would fire markInvited + telemetry twice. We track the most recent guest
  // id we've already opened for; advance() clears it so the next guest is
  // openable.
  const lastOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent("bulk_send_started", {
      eventId: event.id,
      queueSize: guests.length,
    });
  }, [event.id, guests.length]);

  const total = guests.length;
  const remaining = guests.slice(index);
  const current = remaining[0] ?? null;

  // Pre-build the WhatsApp link for the current guest. Async crypto means we
  // need state; recompute when `current` changes. If `current` becomes null
  // (queue exhausted), the BulkDoneScreen replaces this whole subtree so we
  // don't need to clear the URL here — letting it stay avoids a sync setState
  // inside the effect, which the lint rule rightfully objects to.
  const [waUrl, setWaUrl] = useState<string>("");
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    void buildWhatsAppMessage(origin, event, current).then((m) => {
      if (!cancelled) setWaUrl(m.url);
    });
    return () => { cancelled = true; };
  }, [current, event, origin]);

  // Esc to close. Convenience.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // R18 §1E — auto-advance. When the user opens WhatsApp the tab goes
  // hidden; when they come back (visible) AND the current guest's link
  // was actually opened, wait 2s (in case they're still finishing up)
  // then move to the next guest automatically.
  const currentId = current?.id ?? null;
  const currentOpened = currentId ? opened.has(currentId) : false;
  useEffect(() => {
    if (!autoAdvance || !currentOpened) return;
    let timer: number | null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        wentHiddenRef.current = true;
      } else if (
        document.visibilityState === "visible" &&
        wentHiddenRef.current
      ) {
        wentHiddenRef.current = false;
        timer = window.setTimeout(() => {
          lastOpenedRef.current = null;
          setIndex((i) => i + 1);
        }, 2000);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timer) window.clearTimeout(timer);
    };
  }, [autoAdvance, currentOpened, currentId]);

  const toggleAutoAdvance = () => {
    setAutoAdvance((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(AUTO_ADV_KEY, next ? "1" : "0");
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  };

  if (!current) {
    // Queue exhausted — show a "all done" panel before letting the user close.
    return (
      <BulkDoneScreen
        eventId={event.id}
        opened={opened.size}
        total={total}
        onClose={onClose}
      />
    );
  }

  // The "open WhatsApp" action is wired directly on the <a> element below so
  // the click stays a real user gesture (browsers block window.open from any
  // async chain, so we deliberately avoid `window.open` here in JS).
  const advance = () => {
    lastOpenedRef.current = null;
    setIndex((i) => i + 1);
  };
  const skip = () => {
    lastOpenedRef.current = null;
    setIndex((i) => i + 1);
  };

  const wasOpened = opened.has(current.id);
  const sentSoFar = opened.size;
  const pct = total === 0 ? 0 : Math.round((sentSoFar / total) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="bulk-invite-title"
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl scale-in"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 flex items-start justify-between gap-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <span className="pill pill-gold">
              <Send size={11} /> שליחת הזמנות
            </span>
            <h2 id="bulk-invite-title" className="mt-2 text-xl font-extrabold tracking-tight gradient-gold">
              שליחה מרוכזת בוואטסאפ
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--foreground-soft)" }}>
              נפתח לך את הצ׳אט עם כל אורח בנפרד — שולחים, חוזרים לכאן, ולוחצים &quot;הבא&quot;.
            </p>
          </div>
          {/* R18 §P — bumped 32→44px to match AddGuestModal + WCAG touch. */}
          <button onClick={onClose} aria-label="סגור" className="rounded-full w-11 h-11 flex items-center justify-center hover:bg-[var(--secondary-button-bg)]">
            <X size={18} aria-hidden style={{ color: "var(--foreground-muted)" }} />
          </button>
        </header>

        <div className="p-5">
          {/* Progress */}
          <div className="flex items-center justify-between text-xs mb-2" style={{ color: "var(--foreground-soft)" }}>
            <span><span className="ltr-num font-bold">{sentSoFar}</span> מתוך <span className="ltr-num">{total}</span> נשלחו</span>
            <span className="ltr-num">{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--input-bg)" }}>
            <div
              className="h-full bg-gradient-to-r from-[#A8884A] via-[#D4B068] to-[#F4DEA9] transition-[width] duration-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>

          {/* Current guest card */}
          <div className="mt-5 rounded-2xl p-4" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <Avatar name={current.name} id={current.id} size={44} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{current.name}</div>
                <div className="text-xs flex items-center gap-1" style={{ color: "var(--foreground-muted)" }}>
                  <Phone size={11} /> <span dir="ltr" className="ltr-num">{current.phone}</span>
                </div>
              </div>
              <span className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
                #{index + 1}/{total}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2.5">
            <a
              href={waUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!waUrl) {
                  e.preventDefault();
                  return;
                }
                // Idempotent within the same step: a second rapid tap on
                // the same guest's "open" button must NOT double-stamp
                // markInvited or telemetry. Cleared on advance/skip.
                if (lastOpenedRef.current === current.id) return;
                lastOpenedRef.current = current.id;
                actions.markInvited(current.id);
                setOpened((prev) => {
                  const next = new Set(prev);
                  next.add(current.id);
                  return next;
                });
              }}
              className={`btn-gold py-3 inline-flex items-center justify-center gap-2 ${waUrl ? "" : "opacity-40 pointer-events-none"}`}
              style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", color: "#fff", borderColor: "transparent" }}
              aria-disabled={!waUrl}
            >
              <MessageCircle size={16} />
              {wasOpened ? "פתח שוב את WhatsApp" : index === 0 ? "פתח את WhatsApp עם הראשון" : "פתח את WhatsApp"}
            </a>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={skip}
                className="rounded-2xl py-2.5 text-sm font-medium"
                style={{ border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
              >
                דלג
              </button>
              <button
                onClick={advance}
                disabled={!wasOpened}
                className="btn-gold py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {index + 1 === total ? "סיום" : "הבא"}
                <ArrowRight size={14} className="rotate-180" />
              </button>
            </div>

            <p className="text-xs text-center mt-1" style={{ color: "var(--foreground-muted)" }}>
              💡 לחץ על &quot;פתח&quot;, שלח את ההודעה, חזור לטאב הזה
              {autoAdvance ? " — נעבור אוטומטית למוזמן הבא" : ', ולחץ "הבא"'}.
            </p>
            {/* R18 §1E — auto-advance opt-out. */}
            <button
              type="button"
              onClick={toggleAutoAdvance}
              className="text-[11px] mx-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition"
              style={{
                color: "var(--foreground-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {autoAdvance ? "השבת מעבר אוטומטי" : "הפעל מעבר אוטומטי"}
            </button>
          </div>

          {/* Reference: text preview so the host knows what's being sent */}
          <details className="mt-5 rounded-xl px-3 py-2" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
            <summary className="text-xs cursor-pointer" style={{ color: "var(--foreground-soft)" }}>
              הצג תצוגה מקדימה של ההודעה
            </summary>
            <pre className="mt-2 text-[11px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
              {/* Use the same builder synchronously by deriving from waUrl is awkward — */}
              {/* simpler: re-render the message string via a small helper. */}
              <BulkPreviewText origin={origin} event={event} guest={current} />
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function BulkPreviewText({
  origin,
  event,
  guest,
}: {
  origin: string;
  event: import("@/lib/types").EventInfo;
  guest: Guest;
}) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void buildWhatsAppMessage(origin, event, guest).then((m) => {
      if (!cancelled) setText(m.text);
    });
    return () => { cancelled = true; };
  }, [origin, event, guest]);
  return <>{text || "מכין..."}</>;
}

function BulkDoneScreen({
  eventId,
  opened,
  total,
  onClose,
}: {
  eventId: string;
  opened: number;
  total: number;
  onClose: () => void;
}) {
  // Stamp completion once.
  const stampedRef = useRef(false);
  useEffect(() => {
    if (stampedRef.current) return;
    stampedRef.current = true;
    trackEvent("bulk_send_completed", { eventId, opened, total });
  }, [eventId, opened, total]);

  // Esc-to-close — keyboard parity with the click-overlay path above.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="w-full max-w-sm rounded-3xl scale-in p-7 text-center"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex w-16 h-16 rounded-full items-center justify-center" style={{ background: "rgba(212,176,104,0.12)", color: "var(--accent)" }}>
          <CheckCircle2 size={32} />
        </div>
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight gradient-gold">
          סיימנו! 🎉
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          נשלחו <span className="ltr-num font-bold">{opened}</span> הזמנות מתוך <span className="ltr-num">{total}</span>.
        </p>
        <button
          onClick={onClose}
          className="btn-gold mt-6 w-full py-3 inline-flex items-center justify-center gap-2"
        >
          סגור
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────── Donut chart + legend ─────────────────────────────────

/** Inline SVG donut — no chart library, no JS for animation, just stroke-dasharray. */
function RsvpDonut({
  confirmed,
  maybe,
  declined,
  pending,
}: {
  confirmed: number;
  maybe: number;
  declined: number;
  pending: number;
}) {
  const total = confirmed + maybe + declined + pending;
  if (total === 0) return null;
  const r = 56;
  const c = 2 * Math.PI * r;
  const segments = [
    { value: confirmed, color: "rgb(110,231,183)" },
    { value: maybe, color: "rgb(252,211,77)" },
    { value: declined, color: "rgb(248,113,113)" },
    { value: pending, color: "rgba(255,255,255,0.35)" },
  ];
  let offset = 0;
  return (
    <div className="relative w-[140px] h-[140px] mx-auto" aria-label="פילוח אישורי הגעה">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx={70} cy={70} r={r} fill="none" stroke="var(--input-bg)" strokeWidth={18} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const dasharray = `${len} ${c - len}`;
          const dashoffset = -offset;
          offset += len;
          if (s.value === 0) return null;
          return (
            <circle
              key={i}
              cx={70}
              cy={70}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={18}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-2xl font-extrabold ltr-num gradient-gold">{confirmed}</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>אישרו</div>
      </div>
    </div>
  );
}

function RsvpLegend({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const w = total === 0 ? 0 : Math.max(2, Math.round((value / total) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
          <span style={{ color: "var(--foreground-soft)" }}>{label}</span>
        </span>
        <span className="ltr-num font-semibold" style={{ color: "var(--foreground)" }}>
          {value} <span style={{ color: "var(--foreground-muted)" }}>({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--input-bg)" }}>
        <div className="h-full" style={{ width: `${w}%`, background: color }} aria-hidden />
      </div>
    </div>
  );
}

// ──────────────────────────── CSV export + copy confirmed ────────────────────────────

const CSV_HEADERS = ["שם", "טלפון", "סטטוס", "כמות", "צד", "הערות", "אישור התקבל"] as const;

const STATUS_TEXT_FOR_CSV: Record<GuestStatus, string> = {
  pending: "ממתין",
  invited: "נשלחה הזמנה",
  confirmed: "אישר",
  maybe: "אולי",
  declined: "לא מגיע",
};

/**
 * Quote a CSV cell. Doubles inner quotes per RFC 4180. We always wrap in
 * quotes so any embedded comma/newline is harmless.
 */
function csvQuote(s: string): string {
  return `"${(s ?? "").replace(/"/g, '""')}"`;
}

function exportGuestsCsv(guests: Guest[], event: import("@/lib/types").EventInfo) {
  const rows = [
    CSV_HEADERS.map(csvQuote).join(","),
    ...guests.map((g) =>
      [
        g.name,
        g.phone,
        STATUS_TEXT_FOR_CSV[g.status],
        String(g.attendingCount ?? 1),
        g.side === "bride" ? "כלה" : g.side === "groom" ? "חתן" : g.side === "shared" ? "משותף" : "",
        g.notes ?? "",
        g.respondedAt ? formatEventDate(g.respondedAt, "short") : "",
      ].map(csvQuote).join(","),
    ),
  ].join("\n");
  // BOM so Excel detects UTF-8 + Hebrew correctly. Without it, Hebrew shows as gibberish.
  const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `momentum-guests-${event.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  trackEvent("guests_csv_export", { eventId: event.id, count: guests.length });
}

async function copyConfirmedList(guests: Guest[]) {
  const confirmed = guests.filter((g) => g.status === "confirmed");
  if (confirmed.length === 0) {
    showToast("אין מאשרים להעתיק עדיין", "info");
    return;
  }
  const lines = confirmed.map((g) => {
    const heads = (g.attendingCount ?? 1);
    const suffix = heads > 1 ? ` (${heads})` : "";
    const phone = g.phone ? ` · ${g.phone}` : "";
    return `${g.name}${suffix}${phone}`;
  });
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showToast(`הועתקו ${confirmed.length} מאשרים ✓`, "success");
  } catch {
    showToast("העתקה נכשלה — סמן ידנית", "error");
  }
}
