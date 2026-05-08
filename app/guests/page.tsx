"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { PrintButton } from "@/components/PrintButton";
import { useAppState, actions, mintMissingRsvpTokens } from "@/lib/store";
import { useUser } from "@/lib/user";
import { buildHostInvitationWhatsappLink } from "@/lib/invitation";
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
} from "lucide-react";

const STATUS_LABEL: Record<GuestStatus, string> = {
  pending: "טרם נשלחה הזמנה",
  invited: "הזמנה נשלחה",
  confirmed: "אישר/ה הגעה",
  declined: "לא יגיע/ה",
  maybe: "אולי",
};

export default function GuestsPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | GuestStatus>("all");
  const [search, setSearch] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

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
    if (hydrated && !state.event) router.replace("/onboarding");
  }, [userHydrated, user, hydrated, state.event, router]);

  // Backfill RSVP tokens for legacy guests on first hydration. The action is
  // idempotent + dedup-coalesced inside the lib, so it's safe to call broadly.
  useEffect(() => {
    if (!hydrated || !state.event?.signingKey) return;
    void mintMissingRsvpTokens();
  }, [hydrated, state.event?.signingKey]);

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

  const stats = useMemo(() => {
    const confirmed = state.guests.filter((g) => g.status === "confirmed");
    const declined = state.guests.filter((g) => g.status === "declined");
    const invited = state.guests.filter((g) => g.status === "invited");
    return {
      total: state.guests.length,
      confirmedCount: confirmed.length,
      confirmedHeads: confirmed.reduce((s, g) => s + g.attendingCount, 0),
      declined: declined.length,
      invited: invited.length,
      pending: state.guests.filter((g) => g.status === "pending").length,
    };
  }, [state.guests]);

  if (!hydrated || !state.event) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center text-white/50">טוען...</main>
      </>
    );
  }

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
              <div className="card p-10 text-center text-white/50">
                {state.guests.length === 0
                  ? "עדיין לא הוספת מוזמנים. בוא נתחיל!"
                  : "לא נמצאו מוזמנים מתאימים."}
              </div>
            )}
            {filtered.map((guest) => (
              <GuestRow key={guest.id} guest={guest} event={state.event!} />
            ))}
          </div>
        </div>

        {showAdd && <AddGuestModal onClose={() => setShowAdd(false)} />}
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

function GuestRow({ guest, event }: { guest: Guest; event: import("@/lib/types").EventInfo }) {
  const [open, setOpen] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Build the signed RSVP URL asynchronously (HMAC requires async crypto.subtle).
  const [whatsappUrl, setWhatsappUrl] = useState<string>("");
  const [rsvpUrl, setRsvpUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void buildHostInvitationWhatsappLink(origin, event, guest).then(({ url, rsvpUrl }) => {
      if (cancelled) return;
      setWhatsappUrl(url);
      setRsvpUrl(rsvpUrl);
    });
    return () => { cancelled = true; };
  }, [origin, event, guest]);

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
    window.open(whatsappUrl, "_blank");
    actions.markInvited(guest.id);
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(rsvpUrl);
    } catch {}
  };

  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#2a2a32] to-[#15151a] border border-white/10 flex items-center justify-center font-semibold">
          {guest.name.charAt(0)}
        </div>
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
            disabled={!guest.phone}
            title={guest.phone ? "שלח הזמנה בוואטסאפ" : "הוסף מספר טלפון כדי לשלוח"}
            className="ms-1 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black inline-flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-emerald-500"
            aria-label="שלח בוואטסאפ"
          >
            <MessageCircle size={15} />
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
              disabled={!guest.phone}
              title={guest.phone ? "" : "הוסף מספר טלפון לאורח כדי לשלוח בוואטסאפ"}
              className="rounded-full bg-emerald-500 text-black px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageCircle size={16} />
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
            rel="noopener"
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [count, setCount] = useState("1");
  // New: feed the smart-seating algorithm. All optional — defaults work.
  const [group, setGroup] = useState<GuestGroup | "">("");
  const [ageGroup, setAgeGroup] = useState<GuestAgeGroup | "">("");
  const isValid = name.trim().length > 0;

  const submit = () => {
    if (!isValid) return;
    actions.addGuest({
      name: name.trim(),
      phone: phone.trim(),
      attendingCount: Number(count) || 1,
      ...(group ? { group } : {}),
      ...(ageGroup ? { ageGroup } : {}),
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
      <div className="card glass-strong p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Users size={20} className="text-[--accent]" />
          <h3 className="text-xl font-bold">מוזמן חדש</h3>
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
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={submit} className="btn-gold">הוסף</button>
        </div>
      </div>
    </div>
  );
}
