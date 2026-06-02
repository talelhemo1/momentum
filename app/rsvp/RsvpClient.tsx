"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/lib/store";
import { publishRsvpUpdate } from "@/lib/rsvpSync";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/types";
import type { GuestStatus } from "@/lib/types";
import { EVENT_CONFIG } from "@/lib/eventConfig";
import { Logo } from "@/components/Logo";
import { RsvpSkeleton } from "@/components/skeletons/PageSkeletons";
import { trackEvent } from "@/lib/analytics";
import { verifyRsvpToken } from "@/lib/crypto";
import { parseRsvpQuery } from "@/lib/rsvpLinks";
import { fireConfetti } from "@/lib/confetti";
import { tryGetPublicOrigin } from "@/lib/origin";
import { buildNavigationLinks } from "@/lib/navigationLinks";
import { formatEventDate } from "@/lib/format";
import {
  decodeInvitation,
  buildGuestResponseWhatsappLink,
  isSafeInvitationImageUrl,
  type InvitationPayload,
} from "@/lib/invitation";
import {
  Heart,
  CalendarDays,
  MapPin,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Send,
  Copy,
  Users,
  ListChecks,
  Armchair,
  ArrowLeft,
} from "lucide-react";

// R163 — remember a guest's response on THIS device so re-opening the
// link shows what they already chose instead of a fresh, re-submittable
// picker (the owner reported guests confirming over and over). Keyed by
// event+guest. The cloud upsert is idempotent anyway, but this makes the
// "you've already replied" state explicit and prevents accidental
// repeat submissions; the guest can still tap "change" to update.
const RSVP_SENT_PREFIX = "momentum.rsvp.sent.v1";
interface PersistedRsvp {
  status: "confirmed" | "declined" | "maybe";
  count: number;
}
function rsvpSentKey(eventId: string, guestId: string): string {
  return `${RSVP_SENT_PREFIX}:${eventId}:${guestId}`;
}
function readPersistedRsvp(eventId: string, guestId: string): PersistedRsvp | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(rsvpSentKey(eventId, guestId));
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedRsvp;
    if (p && (p.status === "confirmed" || p.status === "declined" || p.status === "maybe")) {
      return { status: p.status, count: typeof p.count === "number" ? p.count : 0 };
    }
  } catch {
    /* corrupt entry — ignore */
  }
  return null;
}
function writePersistedRsvp(eventId: string, guestId: string, value: PersistedRsvp): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(rsvpSentKey(eventId, guestId), JSON.stringify(value));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export default function RsvpClient() {
  return (
    <Suspense fallback={null}>
      <RsvpInner />
    </Suspense>
  );
}

function RsvpInner() {
  const searchParams = useSearchParams();
  // Two URL formats are supported:
  //  v2 token: /rsvp?e=<eventId>&g=<guestId>&t=<token>  — preferred (HMAC-verified)
  //  legacy:   /rsvp?d=<base64>&sig=<sig>               — kept for old invitations
  const dParam = searchParams.get("d");
  const sigParam = searchParams.get("sig");
  const tokenQuery = useMemo(() => parseRsvpQuery(searchParams), [searchParams]);
  const { state, hydrated } = useAppState();
  const [count, setCount] = useState(2);
  const [note, setNote] = useState("");
  // R119 — optional contact channels for the SMS+Email confirmation
  // that fires after a successful RSVP. The guest fills these in
  // themselves (we don't have the host's contact list on this device).
  // Pre-filled from `state.guests` when available — that case happens
  // when the host opens the RSVP link on their own device to test.
  const [confirmPhone, setConfirmPhone] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitted, setSubmitted] = useState<null | "confirmed" | "declined" | "maybe">(null);
  const [showConfetti, setShowConfetti] = useState(false);
  // Cloud-sync failure banner. We always persist locally, but if the Supabase
  // upsert fails (offline, RLS, transient network) we show a soft notice so
  // the guest knows their answer hasn't reached the host yet.
  const [localSyncBanner, setLocalSyncBanner] = useState(false);
  // Single-flight guard against double-tap on "אשר הגעה" — without this, two
  // rapid clicks open WhatsApp twice and fire two Supabase upserts. We never
  // reset it: after a successful submit the `submitted` state hides the
  // picker entirely, so there's nothing to click again.
  const submittingRef = useRef(false);
  // Token-mode verification result. `null` = not yet checked; `false` = failed
  // (rejected URL); `true` = signed correctly by the host's signing key.
  const [tokenOk, setTokenOk] = useState<null | boolean>(null);
  const passthroughSig = sigParam || undefined;

  const origin = tryGetPublicOrigin();

  const payload: InvitationPayload | null = useMemo(() => {
    if (!dParam) return null;
    return decodeInvitation(dParam);
  }, [dParam]);

  // Verify the token URL against the host's local event.signingKey. Runs only
  // when both pieces are available; if the page is opened on a non-host device
  // there's no signing key to check against — `state.event` will be null and
  // the token path will simply not resolve, which is the desired behavior.
  useEffect(() => {
    let cancelled = false;
    if (!tokenQuery.eventId || !tokenQuery.guestId || !tokenQuery.token) return;
    if (!state.event?.signingKey) return;
    // verifyRsvpToken returns a Promise even when the inputs are obviously
    // wrong, so we route both the "wrong event id" rejection AND the genuine
    // crypto verification through the same async path. Keeps setState out of
    // the synchronous effect body, which the lint rule rightfully forbids.
    const eventIdMatches = state.event.id === tokenQuery.eventId;
    const verification: Promise<boolean> = eventIdMatches
      ? verifyRsvpToken(tokenQuery.token, tokenQuery.eventId, tokenQuery.guestId, state.event.signingKey)
      : Promise.resolve(false);
    verification
      .then((ok) => {
        if (!cancelled) setTokenOk(ok);
      })
      .catch(() => {
        // crypto.subtle can reject on a malformed key/token. Without this
        // catch the promise rejects unhandled, setTokenOk never fires, and
        // the guest is stranded on the loading skeleton forever. Treat any
        // verification error as a failed (invalid) link instead.
        if (!cancelled) setTokenOk(false);
      });
    return () => { cancelled = true; };
  }, [tokenQuery, state.event?.signingKey, state.event?.id]);

  const resolved = useMemo(() => {
    // Prefer the token URL when it verifies — read guest + event from the host's
    // local state. This matches the spec's "no payload secrets in the URL,
    // everything is looked up locally" model.
    if (tokenOk && tokenQuery.eventId && tokenQuery.guestId && state.event) {
      const ev = state.event;
      const guest = state.guests.find((g) => g.id === tokenQuery.guestId);
      if (ev.id === tokenQuery.eventId && guest) {
        return {
          eventId: ev.id,
          eventType: ev.type,
          hostName: ev.hostName,
          partnerName: ev.partnerName,
          date: ev.date,
          city: ev.city,
          synagogue: ev.synagogue,
          hostPhone: ev.hostPhone,
          invitationImageUrl: ev.invitationImageUrl,
          guest: { id: guest.id, name: guest.name },
        };
      }
    }
    // Legacy `?d=&sig=` format — content was already in the URL.
    if (payload) {
      return {
        eventId: payload.e.id,
        eventType: payload.e.type,
        hostName: payload.e.host,
        partnerName: payload.e.partner,
        date: payload.e.date,
        city: payload.e.city,
        synagogue: payload.e.synagogue,
        hostPhone: payload.e.hostPhone,
        invitationImageUrl: payload.e.invitationImageUrl,
        guest: { id: payload.g.id, name: payload.g.name },
      };
    }
    return null;
  }, [tokenOk, tokenQuery, payload, state.event, state.guests]);

  // R163 — restore a prior response saved on THIS device, so a returning
  // guest sees "you already replied" instead of a fresh picker they could
  // submit again. queueMicrotask keeps the setState out of the synchronous
  // effect body (react-hooks/set-state-in-effect).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!resolved || restoredRef.current) return;
    const persisted = readPersistedRsvp(resolved.eventId, resolved.guest.id);
    if (!persisted) return;
    restoredRef.current = true;
    queueMicrotask(() => {
      setSubmitted(persisted.status);
      if (persisted.status === "confirmed" && persisted.count > 0) {
        setCount(persisted.count);
      }
    });
  }, [resolved]);

  // R31 — navigation deep links. The event "address" is the venue/city
  // pair the host entered (no single venue field in the schema). Null
  // when neither is set → the "how to get there" card is hidden entirely
  // (never a broken button). Declared before the early returns so the
  // hook order stays stable.
  const venueText = [resolved?.synagogue, resolved?.city]
    .filter(Boolean)
    .join(" · ");
  const navLinks = useMemo(
    () => buildNavigationLinks(venueText),
    [venueText],
  );

  // R119 — pre-fill when the host tests on their own device (guest in local store).
  const hostPreviewPhone =
    resolved?.guest?.id != null
      ? (state.guests.find((g) => g.id === resolved.guest.id)?.phone ?? "")
      : "";
  const effectiveConfirmPhone = confirmPhone || hostPreviewPhone;

  // Track view on first render with a resolved payload — only once per page load.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || !resolved) return;
    trackedRef.current = true;
    trackEvent("rsvp_view", { eventId: resolved.eventId, eventType: resolved.eventType });
    // R32 — record the open so the host's dashboard sees it live. This
    // is the reliable catch-all: every guest lands on /rsvp whether they
    // came through the /i/<id> short link or a direct link. Pure
    // fire-and-forget — a tracking failure must never affect RSVP.
    void fetch("/api/invitation/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: resolved.eventId,
        guestId: resolved.guest.id,
        guestName: resolved.guest.name,
      }),
    }).catch(() => {});
  }, [resolved]);

  // Loading state covers both flows: SSR/initial paint, and the async token
  // verification round-trip in token-mode.
  const stillVerifying =
    !!tokenQuery.token && !!tokenQuery.eventId && !!tokenQuery.guestId && tokenOk === null;
  if ((!hydrated && !payload) || stillVerifying) {
    return <RsvpSkeleton />;
  }

  // Hard-reject when token URL was provided but failed verification — never
  // fall back to legacy decoding in that case (would be a security regression).
  if (tokenQuery.token && tokenOk === false) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-10 text-center max-w-md">
          <h1 className="text-2xl font-bold">הקישור לא תקין</h1>
          <p className="mt-3" style={{ color: "var(--foreground-soft)" }}>
            הקישור שקיבלת לא חתום נכון. ייתכן שהוא ישן או פגום — בקש מהמארח לשלוח שוב.
          </p>
        </div>
      </main>
    );
  }

  if (!resolved) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-10 text-center max-w-md">
          <h1 className="text-2xl font-bold">הקישור לא תקין</h1>
          <p className="mt-3" style={{ color: "var(--foreground-soft)" }}>
            ייתכן שהקישור פגום או שגוי. אנא פנו למארח האירוע ובקשו ממנו לשלוח שוב.
          </p>
        </div>
      </main>
    );
  }

  // R15 §1C — defensive lookup. RSVP data comes from a shared link, so
  // the event type is fully attacker/staleness-controlled.
  const config = EVENT_CONFIG[resolved.eventType] ?? EVENT_CONFIG.wedding;
  const subjects = config.invitationHostPhrase(resolved.hostName, resolved.partnerName);

  const respond = async (status: GuestStatus) => {
    if (!resolved) return;
    // Guard against double-tap. A subsequent click bails immediately.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const finalStatus = status as "confirmed" | "declined" | "maybe";
    const finalCount = finalStatus === "confirmed" ? count : 0;

    // R107 — direct-write path. publishRsvpUpdate writes to Supabase +
    // BroadcastChannel + local store; the host's dashboard already
    // subscribes to rsvpSync, so confirmations appear in realtime with
    // no WhatsApp hop in the middle.
    //
    // The previous flow ALSO opened wa.me unconditionally — that was a
    // legacy fallback from when there was no backend. With Supabase
    // wired end-to-end (and a fallback offline banner when it fails),
    // the auto-open became friction: every guest had a WhatsApp tab
    // pop open whether they wanted to message the host or not.
    //
    // We no longer gate publishRsvpUpdate on `state.event.id === eventId`.
    // setRsvp is a no-op when the guest isn't in the local store (the
    // .map skips), and the Supabase upsert + BroadcastChannel parts
    // are exactly what we want on a guest device with no local event.
    const noteTrimmed = note.trim();
    try {
      await publishRsvpUpdate({
        eventId: resolved.eventId,
        guestId: resolved.guest.id,
        status: finalStatus,
        attendingCount: finalCount,
        notes: noteTrimmed || undefined,
      });
    } catch (e) {
      console.error("[momentum/rsvp] publishRsvpUpdate failed:", e);
      trackEvent("rsvp_publish_failed", {
        eventId: resolved.eventId,
        guestId: resolved.guest.id,
        status: finalStatus,
      });
      setLocalSyncBanner(true);
    }
    trackEvent(`rsvp_${finalStatus}`, {
      eventId: resolved.eventId,
      eventType: resolved.eventType,
      attendingCount: finalCount,
      hasNote: note.trim().length > 0,
    });
    setSubmitted(finalStatus);
    // R163 — remember the response on this device (prevents repeat
    // submissions; shows the "already replied" state on re-open).
    writePersistedRsvp(resolved.eventId, resolved.guest.id, {
      status: finalStatus,
      count: finalCount,
    });
    if (finalStatus === "confirmed") {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 2400);
      fireConfetti(1500);
    }

    // R119 — fire the SMS+Email confirmation. Only runs when the
    // guest left at least one contact channel; the API itself
    // gracefully skips channels with no recipient, and the whole
    // call is fire-and-forget so a Twilio/Resend hiccup never
    // affects the RSVP submit path (which already succeeded
    // above via publishRsvpUpdate). Skipped for "maybe" — that's
    // a non-final answer, no logistics to confirm yet.
    if (finalStatus !== "maybe") {
      const phone = effectiveConfirmPhone.trim();
      const email = confirmEmail.trim();
      if (phone || email) {
        const hostNames = resolved.partnerName
          ? `${resolved.hostName} ו${resolved.partnerName}`
          : resolved.hostName;
        const dateText = formatEventDate(resolved.date);
        const venue =
          [resolved.synagogue, resolved.city].filter(Boolean).join(" · ") ||
          "פרטים בלינק";
        void fetch("/api/rsvp/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: finalStatus,
            eventId: resolved.eventId,
            guestId: resolved.guest.id,
            guestName: resolved.guest.name,
            guestPhone: phone || undefined,
            guestEmail: email || undefined,
            hostNames,
            dateText,
            venue,
            wazeUrl: navLinks?.waze,
            rsvpUrl: typeof window !== "undefined" ? window.location.href : undefined,
          }),
        }).catch(() => {
          /* fire-and-forget; the RSVP is already saved */
        });
      }
    }
  };

  return (
    <main className="min-h-screen pb-16 relative overflow-x-hidden">
      <ParallaxBackdrop />
      {showConfetti && <Confetti />}

      <div className="max-w-xl mx-auto px-5 pt-8 relative z-10">
        <div className="flex justify-center">
          <Logo size={26} />
        </div>

        <Hero
          eventType={resolved.eventType}
          subjects={subjects}
          dateISO={resolved.date}
          city={resolved.city}
          synagogue={resolved.synagogue}
          guestName={resolved.guest.name}
          invitationImageUrl={
            isSafeInvitationImageUrl(resolved.invitationImageUrl)
              ? resolved.invitationImageUrl
              : undefined
          }
        />

        {venueText && navLinks && (
          <div className="card-gold p-5 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={20} className="text-[--accent]" />
              <h3 className="font-bold">איך מגיעים?</h3>
            </div>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--foreground-soft)" }}
            >
              {venueText}
            </p>

            <div className="grid grid-cols-3 gap-2">
              <a
                href={navLinks.waze}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl py-3 px-2 text-center transition hover:bg-white/5 active:scale-95"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-2xl mb-1">🚗</div>
                <div className="text-xs font-semibold">Waze</div>
              </a>
              <a
                href={navLinks.googleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl py-3 px-2 text-center transition hover:bg-white/5 active:scale-95"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-2xl mb-1">🗺️</div>
                <div className="text-xs font-semibold">Google Maps</div>
              </a>
              <a
                href={navLinks.appleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl py-3 px-2 text-center transition hover:bg-white/5 active:scale-95"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-2xl mb-1">🍎</div>
                <div className="text-xs font-semibold">Apple Maps</div>
              </a>
            </div>

            <p
              className="text-[10px] text-center mt-3"
              style={{ color: "var(--foreground-muted)" }}
            >
              💡 לחיצה על Waze פותחת ישר את האפליקציה עם הניווט
            </p>
          </div>
        )}

        {submitted ? (
          <>
            {localSyncBanner && (
              <div
                role="status"
                className="mt-6 mb-4 mx-5 sm:mx-auto max-w-2xl rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(244, 222, 169, 0.08)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--foreground-soft)",
                }}
              >
                ✅ נשמר אצלך. הסנכרון לענן ייעשה אוטומטית כשתחזרו לרשת.
              </div>
            )}
            <ResponseSentCard
              status={submitted}
              count={submitted === "confirmed" ? count : 0}
              guestName={resolved.guest.name}
              note={note.trim() || undefined}
              origin={origin}
              event={{ hostPhone: resolved.hostPhone, hostName: resolved.hostName, partnerName: resolved.partnerName }}
              guest={resolved.guest}
              eventId={resolved.eventId}
              passthroughSignature={passthroughSig}
              onChange={() => setSubmitted(null)}
            />
            <ViralCTA eventType={resolved.eventType} />
          </>
        ) : (
          <ResponsePicker
            count={count}
            setCount={setCount}
            note={note}
            setNote={setNote}
            confirmPhone={effectiveConfirmPhone}
            setConfirmPhone={setConfirmPhone}
            confirmEmail={confirmEmail}
            setConfirmEmail={setConfirmEmail}
            onRespond={respond}
            hasPartner={config.subject.hasPartner}
          />
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs" style={{ color: "var(--foreground-muted)" }}>
          <Heart size={12} /> מופעל על ידי Momentum
        </div>
      </div>
    </main>
  );
}

// ───────────────────────────────────── Hero with countdown ─────────────────────────────────────

function Hero({
  eventType,
  subjects,
  dateISO,
  city,
  synagogue,
  guestName,
  invitationImageUrl,
}: {
  eventType: EventType;
  subjects: string;
  dateISO: string;
  city?: string;
  synagogue?: string;
  guestName: string;
  /** R159 — couple's own designed invitation, shown as a banner above
   *  the generated card when they uploaded one. */
  invitationImageUrl?: string;
}) {
  const dateFmt = new Date(dateISO).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="card-gold p-7 md:p-9 mt-8 relative overflow-hidden">
      <div aria-hidden className="absolute -top-24 -end-24 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.22),transparent_70%)] blur-2xl" />
      <div aria-hidden className="absolute -bottom-20 -start-20 w-56 h-56 rounded-full bg-[radial-gradient(circle,rgba(244,222,169,0.16),transparent_70%)] blur-3xl" />

      <div className="relative text-center">
        {invitationImageUrl && (
          <div
            className="mb-6 -mx-2 rounded-2xl overflow-hidden"
            style={{
              border: "1px solid var(--border-gold)",
              boxShadow: "0 18px 50px -20px var(--accent-glow)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                a guest-uploaded external Storage URL of unknown dimensions;
                next/image adds no value on this anonymous, single-image page. */}
            <img
              src={invitationImageUrl}
              alt={`הזמנה — ${subjects}`}
              className="w-full h-auto block"
              loading="eager"
            />
          </div>
        )}

        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--border-gold)" }}>
          <Sparkles size={13} className="text-[--accent]" />
          {EVENT_TYPE_LABELS[eventType]}
        </div>

        <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight gradient-gold leading-[1.1]">
          {subjects}
        </h1>

        <p className="mt-4" style={{ color: "var(--foreground-soft)" }}>
          שלום <strong style={{ color: "var(--foreground)" }}>{guestName}</strong>, אתם מוזמנים לחגוג איתנו!
        </p>

        <div className="mt-6 flex flex-col items-center gap-2" style={{ color: "var(--foreground-soft)" }}>
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[--accent]" />
            <span className="font-medium">{dateFmt}</span>
          </div>
          {(city || synagogue) && (
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-[--accent]" />
              <span>{[synagogue, city].filter(Boolean).join(" · ")}</span>
            </div>
          )}
        </div>

        <CountdownTimer targetISO={dateISO} />
      </div>
    </section>
  );
}

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  past: boolean;
}

function diffParts(target: number, now: number): Countdown {
  const past = now > target;
  const ms = Math.abs(target - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { days, hours, minutes, seconds, past };
}

function CountdownTimer({ targetISO }: { targetISO: string }) {
  const target = new Date(targetISO).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null || Number.isNaN(target)) return null;
  const c = diffParts(target, now);

  if (c.past && c.days > 0) {
    return (
      <div className="mt-7 text-sm" style={{ color: "var(--foreground-soft)" }}>
        🎉 האירוע כבר היה. תודה שהיית חלק מזה!
      </div>
    );
  }

  return (
    <div className="mt-7" aria-label="ספירה לאחור לאירוע">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
        עוד
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 max-w-md mx-auto">
        <CountUnit value={c.days} label="ימים" />
        <CountUnit value={c.hours} label="שעות" />
        <CountUnit value={c.minutes} label="דקות" />
        <CountUnit value={c.seconds} label="שניות" />
      </div>
    </div>
  );
}

function CountUnit({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-2xl py-3 px-2 text-center"
      style={{
        background: "rgba(0,0,0,0.3)",
        border: "1px solid var(--border-gold)",
      }}
    >
      <div className="text-2xl md:text-3xl font-extrabold ltr-num gradient-gold tabular-nums">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--foreground-muted)" }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────── Parallax + confetti ───────────────────────────────────

function ParallaxBackdrop() {
  // R120 — was driven by `useState(scroll)` → every scroll frame
  // triggered a React state update + full re-render of the backdrop.
  // On mobile that read as the page "dancing": each pixel of scroll
  // pushed a re-render through React, the backdrop transform got
  // recalc'd off-frame, and Safari's compositor flickered between
  // the old and new layer position. The fix is the same pattern
  // used by ScrollProgress: keep scrollY in a ref, write
  // `transform:` directly to the DOM inside requestAnimationFrame.
  // No React state, no reconciliation, smooth GPU-only updates.
  const haloRef = useRef<HTMLDivElement | null>(null);
  const sideRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      rafRef.current = null;
      const y = window.scrollY;
      if (haloRef.current) {
        haloRef.current.style.transform = `translate(-50%, ${y * -0.25}px)`;
      }
      if (sideRef.current) {
        sideRef.current.style.transform = `translateY(${y * -0.15}px)`;
      }
    };
    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(update);
    };
    // Prime the initial position (e.g. after a back-button restore
    // to a non-zero scroll position).
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 -z-0 pointer-events-none overflow-hidden">
      <div
        ref={haloRef}
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-25"
        style={{
          background: "radial-gradient(circle, rgba(212,176,104,0.45), transparent 70%)",
          willChange: "transform",
        }}
      />
      <div
        ref={sideRef}
        className="absolute top-1/2 -end-40 w-[500px] h-[500px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(244,222,169,0.4), transparent 70%)",
          willChange: "transform",
        }}
      />
    </div>
  );
}

function Confetti() {
  // Pure CSS confetti — 40 gold flakes with random delays + horizontal drift.
  // The randomness is intentional and runs ONCE per Confetti mount — useState's
  // lazy initializer is the right primitive (it's a one-shot computation, not a
  // memoized derivation that should be reproducible on repeat renders).
  const [flakes] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      duration: 1.4 + Math.random() * 1,
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360,
      hue: ["#A8884A", "#D4B068", "#F4DEA9", "#FFFFFF"][i % 4],
    })),
  );

  return (
    <div aria-hidden className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="absolute -top-4 rounded-sm confetti-flake"
          style={{
            left: `${f.left}%`,
            width: `${f.size}px`,
            height: `${f.size * 0.4}px`,
            background: f.hue,
            animation: `confetti-fall ${f.duration}s cubic-bezier(0.2,0.6,0.4,1) ${f.delay}s forwards`,
            transform: `rotate(${f.rotate}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────── Response picker ───────────────────────────────────

function ResponsePicker({
  count,
  setCount,
  note,
  setNote,
  confirmPhone,
  setConfirmPhone,
  confirmEmail,
  setConfirmEmail,
  onRespond,
  hasPartner,
}: {
  count: number;
  setCount: (n: number) => void;
  note: string;
  setNote: (s: string) => void;
  confirmPhone: string;
  setConfirmPhone: (s: string) => void;
  confirmEmail: string;
  setConfirmEmail: (s: string) => void;
  onRespond: (status: GuestStatus) => void;
  hasPartner: boolean;
}) {
  const [intent, setIntent] = useState<null | "confirmed" | "maybe" | "declined">(null);

  // hasPartner is currently informational only — kept on the prop list so future
  // copy variants ("שניכם מגיעים?") can opt in without another refactor.
  void hasPartner;

  // For "confirmed" we require a confirmation step (count + note). For maybe/declined we
  // submit immediately to keep that path short.
  const handlePickIntent = (status: "confirmed" | "maybe" | "declined") => {
    if (status === "confirmed") {
      setIntent("confirmed");
    } else {
      onRespond(status);
    }
  };

  if (intent === "confirmed") {
    return (
      <div className="card p-6 mt-6 fade-up">
        <h2 className="text-lg font-bold text-center">איזה כיף שאתם באים! 🎉</h2>

        <label className="block text-sm mt-6 mb-3 text-center" style={{ color: "var(--foreground-soft)" }}>
          כמה אנשים מגיעים איתך?
        </label>
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = count === n;
            return (
              <button
                key={n}
                onClick={() => setCount(n)}
                aria-label={`${n} אנשים`}
                aria-pressed={active}
                className="w-12 h-12 rounded-2xl text-lg font-extrabold transition ltr-num"
                style={{
                  background: active ? "linear-gradient(135deg, #F4DEA9, #A8884A)" : "var(--input-bg)",
                  color: active ? "#1A1310" : "var(--foreground-soft)",
                  border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <label className="block text-sm mt-6 mb-2" style={{ color: "var(--foreground-soft)" }}>
          הערה למארחים <span className="text-xs" style={{ color: "var(--foreground-muted)" }}>(אלרגיה? בקשה מיוחדת? לא חובה)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="לדוגמה: צמחוני ללא גלוטן"
          className="input"
          style={{ resize: "none" }}
        />
        <div className="mt-1 text-xs text-end ltr-num" style={{ color: "var(--foreground-muted)" }}>
          {note.length} / 300
        </div>

        {/* R119 — optional contact channels for the SMS + email
            confirmation. Both are optional; either, neither, or both
            can be filled. We position this as "stay in the loop"
            instead of "give us your info" so it reads as a service
            we offer the guest, not data extraction from the host. */}
        <div
          className="mt-6 rounded-2xl p-4"
          style={{
            background: "color-mix(in srgb, var(--accent) 6%, var(--surface-2))",
            border: "1px solid var(--border-gold)",
          }}
        >
          <div className="text-sm font-bold mb-1" style={{ color: "var(--accent)" }}>
            📨 לקבל אישור עם פרטי האירוע
          </div>
          <div className="text-xs mb-3" style={{ color: "var(--foreground-soft)" }}>
            אופציונלי — נשלח לך SMS ו/או מייל עם המיקום וניווט Waze.
          </div>
          <label className="block text-xs mb-1" style={{ color: "var(--foreground-soft)" }}>
            טלפון (לקבלת SMS)
          </label>
          <input
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={confirmPhone}
            onChange={(e) => setConfirmPhone(e.target.value)}
            placeholder="050-1234567"
            className="input ltr-num mb-3"
            autoComplete="tel"
          />
          <label className="block text-xs mb-1" style={{ color: "var(--foreground-soft)" }}>
            אימייל (לקבלת אישור מעוצב)
          </label>
          <input
            type="email"
            inputMode="email"
            dir="ltr"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="name@example.com"
            className="input ltr-num"
            autoComplete="email"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2.5">
          <button
            onClick={() => onRespond("confirmed")}
            aria-label={`אשר הגעה של ${count} אנשים`}
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black font-extrabold py-4 inline-flex items-center justify-center gap-2 text-base"
          >
            <CheckCircle2 size={20} />
            אישור סופי — מגיעים <span className="ltr-num">({count})</span>
          </button>
          <button
            onClick={() => setIntent(null)}
            className="text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 mt-6">
      <h2 className="text-lg font-bold text-center">תוכלו להגיע?</h2>

      <div className="mt-6 grid grid-cols-1 gap-3">
        <BigChoice
          tone="emerald"
          label="מגיע ✓"
          sub="אשר הגעה ובחר כמות"
          onClick={() => handlePickIntent("confirmed")}
          icon={<CheckCircle2 size={22} />}
        />
        <BigChoice
          tone="amber"
          label="אולי"
          sub="עוד בודקים. תעדכנו אותנו אחר כך"
          onClick={() => handlePickIntent("maybe")}
          icon={<HelpCircle size={22} />}
        />
        <BigChoice
          tone="muted"
          label="לא מגיע"
          sub="לצערנו לא נוכל להגיע"
          onClick={() => handlePickIntent("declined")}
          icon={<XCircle size={22} />}
        />
      </div>
    </div>
  );
}

function BigChoice({
  tone,
  label,
  sub,
  onClick,
  icon,
}: {
  tone: "emerald" | "amber" | "muted";
  label: string;
  sub: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  const styles =
    tone === "emerald"
      ? {
          background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.06))",
          border: "1px solid rgba(16,185,129,0.45)",
          color: "rgb(167,243,208)",
        }
      : tone === "amber"
        ? {
            background: "rgba(212,176,104,0.08)",
            border: "1px solid var(--border-gold)",
            color: "var(--accent)",
          }
        : {
            background: "var(--input-bg)",
            border: "1px solid var(--border)",
            color: "var(--foreground-soft)",
          };
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-2xl px-5 py-4 text-start transition flex items-center gap-4 hover:translate-y-[-2px]"
      style={styles}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">
        <span className="block text-lg font-extrabold">{label}</span>
        <span className="block text-xs mt-0.5 opacity-80">{sub}</span>
      </span>
      <ArrowLeft size={16} className="opacity-50" aria-hidden />
    </button>
  );
}

// ─────────────────────────────── Sent confirmation card ───────────────────────────────

function ResponseSentCard({
  status,
  count,
  guestName,
  note,
  origin,
  event,
  guest,
  eventId,
  passthroughSignature,
  onChange,
}: {
  status: "confirmed" | "declined" | "maybe";
  count: number;
  guestName: string;
  note?: string;
  origin: string;
  event: { hostPhone?: string; hostName: string; partnerName?: string };
  guest: { id: string; name: string };
  eventId: string;
  passthroughSignature?: string;
  onChange: () => void;
}) {
  const { url, importUrl, valid } = useMemo(
    () => buildGuestResponseWhatsappLink(origin, event, guest, eventId, status, count, passthroughSignature, note),
    [origin, event, guest, eventId, status, count, passthroughSignature, note],
  );

  const hostNames = event.partnerName
    ? `${event.hostName} ו${event.partnerName}`
    : event.hostName;

  const ui =
    status === "confirmed"
      ? {
          icon: <CheckCircle2 size={32} />,
          title: `תודה ${guestName}, נשמח לראותך! 🎉`,
          sub:
            count > 1
              ? `אישרת ל-${count} אנשים — ${hostNames} כבר רואים את התשובה שלך.`
              : `אישרת הגעה — ${hostNames} כבר רואים את התשובה שלך.`,
          color: "from-emerald-500/20 to-emerald-400/5",
          accent: "rgb(110,231,183)",
        }
      : status === "maybe"
        ? {
            icon: <HelpCircle size={32} />,
            title: `תודה ${guestName}!`,
            sub: `רשמנו 'אולי'. ${hostNames} יראו זאת בדשבורד שלהם. תוכלו לעדכן בכל רגע.`,
            color: "from-amber-500/20 to-amber-400/5",
            accent: "rgb(252,211,77)",
          }
        : {
            icon: <XCircle size={32} />,
            title: `תודה ${guestName} על העדכון`,
            sub: `נצטער שלא תוכלו להצטרף — ${hostNames} יראו את התשובה בדשבורד.`,
            color: "from-white/10 to-white/0",
            accent: "var(--foreground-soft)",
          };

  // R107 — WhatsApp is now only a SECONDARY fallback inside a collapsed
  // details element. The primary path is the direct DB write that
  // already happened in respond(). The host doesn't need a WhatsApp
  // ping from the guest — their dashboard updates in realtime.
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(importUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  return (
    <div className={`card p-7 mt-6 bg-gradient-to-b ${ui.color}`}>
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: "var(--input-bg)",
            border: `1px solid ${ui.accent}`,
            color: ui.accent,
          }}
        >
          {ui.icon}
        </div>
        <h2 className="mt-4 text-xl font-bold">{ui.title}</h2>
        <p
          className="mt-1.5 text-sm leading-relaxed max-w-sm"
          style={{ color: "var(--foreground-soft)" }}
        >
          {ui.sub}
        </p>

        {/* "Saved live" pill — reassurance that the dashboard already
            has the answer. Not styled as a button because there's
            nothing to do; it just signals success. */}
        <div
          className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
          style={{
            background: "rgba(52,211,153,0.10)",
            border: "1px solid rgba(52,211,153,0.30)",
            color: "rgb(110,231,183)",
          }}
        >
          <CheckCircle2 size={13} />
          התשובה שלך עודכנה אצל המארחים
        </div>
      </div>

      <div className="mt-7 space-y-2.5">
        <button
          type="button"
          onClick={onChange}
          className="w-full rounded-2xl py-2.5 text-sm inline-flex items-center justify-center gap-2 transition hover:bg-white/[0.03]"
          style={{
            border: "1px solid var(--border)",
            color: "var(--foreground-soft)",
            minHeight: 44,
          }}
        >
          שינוי תשובה
        </button>

        {/* Secondary "send via WhatsApp too" fallback — collapsed by
            default so it doesn't distract from the already-done state.
            For guests who specifically want to message the host
            personally, or who don't trust the silent save. */}
        <details className="text-xs">
          <summary
            className="cursor-pointer text-center py-2 list-none"
            style={{ color: "var(--foreground-muted)" }}
          >
            ↓ רוצה לשלוח למארחים גם הודעה אישית בוואטסאפ?
          </summary>
          <div className="mt-2 space-y-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl py-3 inline-flex items-center justify-center gap-2 w-full transition hover:translate-y-[-1px]"
              style={{
                background: "rgba(37,211,102,0.12)",
                border: "1px solid rgba(37,211,102,0.35)",
                color: "rgb(110,231,183)",
                fontWeight: 600,
              }}
            >
              <Send size={15} />
              שלח גם בוואטסאפ
            </a>
            <div
              className="text-xs text-center"
              style={{ color: "var(--foreground-muted)" }}
            >
              {valid
                ? "ייפתח וואטסאפ עם הודעה מוכנה"
                : "המארחים לא הזינו טלפון — בחר אותם מאנשי הקשר"}
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="w-full rounded-2xl py-2 text-xs inline-flex items-center justify-center gap-2 transition"
              style={{
                border: "1px dashed var(--border)",
                color: "var(--foreground-muted)",
              }}
            >
              <Copy size={12} />
              {copied ? "הועתק ✓" : "העתק קישור (אם וואטסאפ לא נפתח)"}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

// ─────────────────────────────────── Viral CTA ───────────────────────────────────

function ViralCTA({ eventType }: { eventType: EventType }) {
  const onClick = () => {
    trackEvent("rsvp_referral_click", { eventType });
  };
  return (
    <section
      className="card-gold p-6 md:p-7 mt-6 text-center relative overflow-hidden fade-up"
      aria-label="הצעה לפתיחת חשבון Momentum"
    >
      <div aria-hidden className="absolute -top-16 -end-16 w-48 h-48 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.22),transparent_70%)] blur-2xl" />

      <div className="relative">
        <div className="text-2xl">📅</div>
        <h3 className="mt-3 text-xl md:text-2xl font-extrabold tracking-tight gradient-gold">
          גם אתה מתכנן אירוע?
        </h3>
        <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
          Momentum עוזרת לך בחינם. כל מה שצריך לתכנון אירוע מושלם, במקום אחד.
        </p>

        <ul className="mt-5 space-y-2.5 text-start max-w-sm mx-auto">
          <ViralBullet icon={<ListChecks size={16} />}>צ&apos;קליסט מותאם לפי סוג האירוע והתאריך שלך</ViralBullet>
          <ViralBullet icon={<Users size={16} />}>ניהול אורחים והזמנות בוואטסאפ אוטומטיות</ViralBullet>
          <ViralBullet icon={<Armchair size={16} />}>סידורי הושבה חכמים עם גרירה ושמירה</ViralBullet>
        </ul>

        <Link
          href={`/onboarding?ref=rsvp&event_type=${encodeURIComponent(eventType)}`}
          onClick={onClick}
          className="btn-gold mt-6 inline-flex items-center justify-center gap-2 w-full"
        >
          התחל בחינם
          <ArrowLeft size={16} />
        </Link>

        <p className="mt-3 text-[11px]" style={{ color: "var(--foreground-muted)" }}>
          🎁 חינמי לכולם · 60 ימי השקה · ללא כרטיס אשראי
        </p>
      </div>
    </section>
  );
}

function ViralBullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
      <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[--accent]" style={{ background: "rgba(212,176,104,0.12)", border: "1px solid var(--border-gold)" }}>
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
