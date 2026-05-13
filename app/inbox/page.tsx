"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAppState, actions } from "@/lib/store";
import { decodeResponse, verifyInboxSignature } from "@/lib/invitation";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Inbox,
} from "lucide-react";

export default function InboxPageRouter() {
  return (
    <Suspense fallback={null}>
      <InboxInner />
    </Suspense>
  );
}

type ImportStatus =
  | "pending"
  | "imported"
  | "no-event"
  | "no-match"
  | "invalid"
  | "bad-signature"
  | "rate-limited"
  | "missing-key";

/** Statuses we accept as valid RSVP responses (guards against tampered payloads). */
const VALID_RSVP_STATUSES = ["confirmed", "declined", "maybe"] as const;
type ValidRsvpStatus = (typeof VALID_RSVP_STATUSES)[number];

const RATE_LIMIT_KEY = STORAGE_KEYS.lastInboxImport;
const RATE_LIMIT_MS = 5_000;

/**
 * Module-scoped memory fallback for the rate-limiter timestamp. Used when
 * sessionStorage is unavailable (Safari Private Browsing, certain iOS
 * webview configs, devices where storage is disk-full). Without this, a
 * setItem failure would silently lose the rate-limit stamp and the same
 * import URL could be replayed dozens of times in a row.
 */
let lastImportMemo = 0;

function readLastImport(): number {
  if (typeof window === "undefined") return lastImportMemo;
  try {
    const fromStorage = Number(window.sessionStorage.getItem(RATE_LIMIT_KEY) || 0);
    if (fromStorage) return fromStorage;
  } catch {
    // sessionStorage unavailable — fall back to module memo below.
  }
  return lastImportMemo;
}

function stampLastImport(now: number) {
  // Memo first so a sessionStorage failure still rate-limits within the same
  // tab session.
  lastImportMemo = now;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RATE_LIMIT_KEY, String(now));
  } catch {
    // Disk full / private mode — already covered by lastImportMemo.
  }
}

/**
 * Synchronously decide whether the import can proceed. Returns either a
 * terminal status (rendered directly) or "needs-verify" which signals that
 * the async HMAC step should run.
 */
function preValidate(args: {
  hydrated: boolean;
  payload: ReturnType<typeof decodeResponse>;
  hasSignature: boolean;
  state: { event: { id: string; signingKey?: string } | null };
}): Exclude<ImportStatus, "imported"> | { kind: "needs-verify"; status: ValidRsvpStatus } {
  if (!args.hydrated) return "pending";
  if (!args.payload) return "invalid";
  if (!VALID_RSVP_STATUSES.includes(args.payload.s as ValidRsvpStatus)) return "invalid";
  if (!args.state.event) return "no-event";
  if (args.state.event.id !== args.payload.eid) return "no-match";
  if (!args.state.event.signingKey) return "missing-key";
  if (!args.hasSignature) return "bad-signature";
  if (typeof window !== "undefined") {
    const last = readLastImport();
    if (last && Date.now() - last < RATE_LIMIT_MS) return "rate-limited";
  }
  return { kind: "needs-verify", status: args.payload.s as ValidRsvpStatus };
}

function InboxInner() {
  const search = useSearchParams();
  const { state, hydrated } = useAppState();
  const [importedAt] = useState(() => Date.now());

  const r = search.get("r");
  const sig = search.get("sig");

  const payload = useMemo(() => (r ? decodeResponse(r) : null), [r]);

  // Synchronous pre-validation — all the cheap checks (presence, schema, event
  // match, missing key, rate limit). The result either IS the terminal status
  // we display, or a signal that we still need the async HMAC verify.
  const validation = useMemo(
    () => preValidate({ hydrated, payload, hasSignature: !!sig, state }),
    [hydrated, payload, sig, state],
  );

  // For the async HMAC step we keep a separate state slot. It only ever moves
  // pending → imported | bad-signature, set inside an event callback (the
  // settled promise), which is the canonical place for setState.
  const [asyncResult, setAsyncResult] = useState<"pending" | "imported" | "bad-signature">("pending");
  const importedRef = useRef(false);
  // Mirror state.guests through a ref so the effect can read the most recent
  // list without putting state.guests in deps (that dep used to re-fire the
  // effect after a successful setRsvp wrote a new guests array, queueing a
  // duplicate import). Updated in an effect — not during render — to satisfy
  // the react-hooks/refs lint rule.
  const guestsRef = useRef(state.guests);
  useEffect(() => {
    guestsRef.current = state.guests;
  }, [state.guests]);

  useEffect(() => {
    if (typeof validation === "string" || importedRef.current) return;
    // Belt + suspenders: also bail if the async result already settled. With
    // state.guests removed from the deps below, this branch protects against
    // any future re-trigger source landing here while we're already done.
    if (asyncResult === "imported" || asyncResult === "bad-signature") return;
    // Mark BEFORE the async work so a re-render mid-import can't reach the
    // setRsvp twice.
    importedRef.current = true;

    const eventId = state.event!.id;
    const signingKey = state.event!.signingKey!;
    const status = validation.status;
    const guestId = payload!.gid;
    const guestName = payload!.gn;
    const headcount = payload!.c || (status === "confirmed" ? 1 : 0);

    void (async () => {
      const ok = await verifyInboxSignature(signingKey, eventId, guestId, sig!);
      if (!ok) {
        // Reset the import gate so a fresh, valid retry still has a chance.
        importedRef.current = false;
        setAsyncResult("bad-signature");
        return;
      }
      // Stamp rate limiter only AFTER signature passes — failed attempts
      // shouldn't lock out the legitimate guest who tries again seconds later.
      stampLastImport(Date.now());

      // SECURITY: lookup by id ONLY. A name-based fallback lets a guest with
      // a duplicate name overwrite someone else's RSVP. If we can't find the
      // id, we create a new guest record instead of guessing. We read from
      // the ref (not the closed-over `state.guests`) so we get whatever the
      // store has at execution time — but the effect itself doesn't depend
      // on that reference.
      const guest = guestsRef.current.find((g) => g.id === guestId);
      if (guest) {
        actions.setRsvp(guest.id, status, headcount);
      } else {
        const created = actions.addGuest({
          name: guestName,
          phone: "",
          attendingCount: headcount,
          status,
        });
        actions.setRsvp(created.id, status, headcount);
      }
      setAsyncResult("imported");
    })();
    // Intentionally NOT depending on state.guests — see guestsRef above.
  }, [validation, sig, state.event, payload, asyncResult]);

  // Final status combines the pre-validation result with the async outcome.
  const importStatus: ImportStatus =
    typeof validation === "string"
      ? validation
      : asyncResult === "imported"
        ? "imported"
        : asyncResult === "bad-signature"
          ? "bad-signature"
          : "pending";

  // Build the success view based on the payload status
  const status = payload?.s;
  const view = (() => {
    if (importStatus === "invalid")
      return { icon: <AlertCircle size={32} className="text-red-300" />, title: "הקישור לא תקין", sub: "ייתכן שהקישור פגום. בקש מהאורח לשלוח שוב.", tone: "loss" as const };
    if (importStatus === "bad-signature")
      return { icon: <AlertCircle size={32} className="text-red-300" />, title: "חתימה דיגיטלית לא תקפה", sub: "הקישור הזה לא נחתם על-ידינו ולכן לא יקלט. ייתכן שמדובר בקישור מזויף.", tone: "loss" as const };
    if (importStatus === "missing-key")
      return { icon: <AlertCircle size={32} className="text-red-300" />, title: "אירוע ללא מפתח חתימה", sub: "האירוע הזה נוצר ללא מפתח אבטחה. צור אירוע חדש או הוסף את האורחים ידנית.", tone: "loss" as const };
    if (importStatus === "rate-limited")
      return { icon: <AlertCircle size={32} className="text-amber-300" />, title: "המתן רגע", sub: "התקבלה כבר תשובה לפני רגע. רענן את הדף בעוד מספר שניות אם זו תשובה אחרת.", tone: "warn" as const };
    if (importStatus === "no-event")
      return { icon: <AlertCircle size={32} className="text-amber-300" />, title: "אין אירוע פתוח", sub: "כדי לקלוט תשובות אורחים — תחילה צור אירוע.", tone: "warn" as const };
    if (importStatus === "no-match")
      return { icon: <AlertCircle size={32} className="text-amber-300" />, title: "התשובה לא תואמת לאירוע", sub: "הקישור הזה שייך לאירוע אחר.", tone: "warn" as const };
    if (importStatus === "pending")
      return { icon: <Inbox size={32} className="text-[--accent]" />, title: "מעבד תשובה...", sub: "", tone: "neutral" as const };

    // imported
    if (status === "confirmed")
      return { icon: <CheckCircle2 size={32} className="text-emerald-300" />, title: `${payload!.gn} מאשר/ת הגעה!`, sub: `${payload!.c} ${payload!.c === 1 ? "אדם" : "אנשים"} מצטרפים לחגוג איתך 🥂`, tone: "success" as const };
    if (status === "declined")
      return { icon: <XCircle size={32} className="text-red-300" />, title: `${payload!.gn} לא יוכל/תוכל להגיע`, sub: "הסטטוס עודכן ברשימת המוזמנים.", tone: "loss" as const };
    return { icon: <HelpCircle size={32} className="text-amber-300" />, title: `${payload!.gn} עדיין מתלבט/ת`, sub: "סומן כ'אולי'. נעקוב אחרי תשובה סופית.", tone: "warn" as const };
  })();

  const bg =
    view.tone === "success"
      ? "from-emerald-500/20 to-emerald-400/5"
      : view.tone === "loss"
        ? "from-red-500/20 to-red-400/5"
        : view.tone === "warn"
          ? "from-amber-500/20 to-amber-400/5"
          : "";

  return (
    <>
      <Header />
      <main className="flex-1 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-1/2 -translate-x-1/2 opacity-30" />

        <div className="max-w-xl mx-auto px-5 pt-10 relative z-10">
          <div className="text-center mb-6">
            <span className="eyebrow">תיבת תשובות</span>
            <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight gradient-text">
              קליטת אישור הגעה
            </h1>
          </div>

          <div className={`card p-8 bg-gradient-to-b ${bg}`}>
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "var(--input-bg)", border: "1px solid var(--border-strong)" }}>
                {view.icon}
              </div>
              <h2 className="mt-5 text-2xl font-bold">{view.title}</h2>
              {view.sub && <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>{view.sub}</p>}

              {importStatus === "imported" && status === "confirmed" && payload && (
                <div className="mt-5 pill pill-gold">
                  <Sparkles size={11} /> נשמר ב<span className="ltr-num">{new Date(importedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}

              {importStatus === "imported" && (
                <div className="mt-7 grid grid-cols-1 gap-2.5 w-full">
                  <Link href="/guests" className="btn-gold inline-flex items-center justify-center gap-2">
                    לרשימת המוזמנים
                    <ArrowLeft size={16} />
                  </Link>
                  <Link href="/dashboard" className="btn-secondary inline-flex items-center justify-center">
                    חזרה למסע
                  </Link>
                </div>
              )}

              {importStatus !== "imported" && importStatus !== "pending" && (
                <div className="mt-7 grid grid-cols-1 gap-2.5 w-full">
                  <Link href="/dashboard" className="btn-secondary inline-flex items-center justify-center">
                    חזרה למסע
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
