"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { ShareEventCard } from "@/components/ShareEventCard";
import { EventDaySkeleton } from "@/components/skeletons/PageSkeletons";
import { useAppState } from "@/lib/store";
import { useUser } from "@/lib/user";
import { VENDORS } from "@/lib/vendors";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import {
  ArrowRight,
  Phone,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  MapPin,
  CalendarDays,
  Heart,
  Sparkles,
  QrCode,
  Download,
  Share2,
  Copy,
  X,
} from "lucide-react";
import QRCode from "qrcode";

interface RunOfShowItem {
  time: string; // HH:MM
  label: string;
  detail?: string;
}

const DEFAULT_RUN_OF_SHOW: RunOfShowItem[] = [
  { time: "10:00", label: "התחלת איפור והכנה", detail: "צוות איפור מגיע לבית/אולם" },
  { time: "13:00", label: "פגישה עם הצלם", detail: "צילומי פרי-וודינג / הכנות" },
  { time: "17:00", label: "הגעה לאולם", detail: "המארחים + משפחה קרובה" },
  { time: "18:00", label: "קבלת פנים", detail: "קוקטיילים, סטנד מתוקים פתוח" },
  { time: "19:30", label: "החופה / טקס", detail: "המקום המרכזי" },
  { time: "20:30", label: "ארוחת ערב", detail: "מנה ראשונה ועיקרית" },
  { time: "22:00", label: "פתיחת רחבה", detail: "ריקוד ראשון של בני הזוג" },
  { time: "23:30", label: "הקפצה / שיא הערב", detail: "DJ/להקה במלוא העוצמה" },
  { time: "01:00", label: "סיום", detail: "פיזור והודעות תודה" },
];

export default function EventDayPage() {
  const router = useRouter();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    if (userHydrated && !user) {
      router.replace("/signup");
      return;
    }
    if (hydrated && !state.event) router.replace("/onboarding");
  }, [userHydrated, user, hydrated, state.event, router]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [showLiveModal, setShowLiveModal] = useState(false);

  const selectedVendors = useMemo(() => {
    return state.selectedVendors
      .map((id) => VENDORS.find((v) => v.id === id))
      .filter(Boolean) as typeof VENDORS;
  }, [state.selectedVendors]);

  const confirmedHeads = useMemo(
    () =>
      state.guests
        .filter((g) => g.status === "confirmed")
        .reduce((s, g) => s + (g.attendingCount || 1), 0),
    [state.guests],
  );

  const runOfShow = DEFAULT_RUN_OF_SHOW;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentItemIndex = (() => {
    for (let i = runOfShow.length - 1; i >= 0; i--) {
      const [h, m] = runOfShow[i].time.split(":").map(Number);
      if (h * 60 + m <= nowMinutes) return i;
    }
    return -1;
  })();

  if (!hydrated || !state.event) {
    return (
      <>
        <Header />
        <EventDaySkeleton />
      </>
    );
  }

  const event = state.event;
  const eventLabel = EVENT_TYPE_LABELS[event.type];
  const subjects = event.partnerName ? `${event.hostName} & ${event.partnerName}` : event.hostName;
  const dateFmt = new Date(event.date).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeNow = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <Header />
      <main className="flex-1 pb-24 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[700px] h-[700px] -top-40 left-1/2 -translate-x-1/2 opacity-30" />

        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          {/* Live header */}
          <section className="card-gold p-6 md:p-8 mt-7 relative overflow-hidden">
            <div aria-hidden className="absolute -top-20 -end-20 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.16),transparent_70%)] blur-2xl" />
            <div className="relative grid sm:grid-cols-[1fr_auto] gap-5 items-center">
              <div>
                <span className="pill pill-gold">
                  <Sparkles size={11} /> {eventLabel} · יום האירוע
                </span>
                <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight gradient-text">{subjects}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
                  <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-[--accent]" /> {dateFmt}</span>
                  {event.city && <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-[--accent]" /> {event.city}</span>}
                  <span className="inline-flex items-center gap-1.5"><Users size={14} className="text-[--accent]" /> <span className="ltr-num">{confirmedHeads}</span> אורחים</span>
                </div>
              </div>
              <div className="text-end">
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>שעה כעת</div>
                <div className="text-5xl md:text-6xl font-extrabold tracking-tight gradient-gold ltr-num">{timeNow}</div>
              </div>
            </div>
          </section>

          {/* Live event mode launcher — generates a QR pointing at the public /live/[id] page. */}
          <section className="mt-6">
            <button
              onClick={() => setShowLiveModal(true)}
              className="w-full card-gold p-5 md:p-6 text-start group hover:translate-y-[-2px] transition"
              aria-label="הפעל מצב אירוע חי"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black flex items-center justify-center shrink-0">
                  <QrCode size={22} />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-extrabold tracking-tight gradient-gold">🎬 הפעל מצב אירוע חי</div>
                  <div className="mt-0.5 text-sm" style={{ color: "var(--foreground-soft)" }}>
                    QR לאורחים — מציג שולחן, תוכנית, ברכות ותמונות מהערב
                  </div>
                </div>
                <ArrowRight size={20} className="rotate-180 group-hover:-translate-x-1 transition" style={{ color: "var(--foreground-soft)" }} />
              </div>
            </button>
          </section>

          {/* Auto-styled share card — Canvas-rendered 1080x1920 image for stories / WhatsApp. */}
          <ShareEventCard
            event={event}
            qrTarget={typeof window !== "undefined" ? `${window.location.origin}/live/${event.id}` : `/live/${event.id}`}
          />

          {/* Panic / Emergency contacts */}
          <section className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-red-300" />
              <h2 className="font-bold">צוות הספקים — לחץ למקרה חירום</h2>
            </div>
            {selectedVendors.length === 0 ? (
              <div className="card p-6 text-sm text-center" style={{ color: "var(--foreground-muted)" }}>
                לא בחרת ספקים. הצוות יופיע כאן כשתשמור ספקים בעמוד הספקים.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {selectedVendors.map((v) => (
                  <a
                    key={v.id}
                    href={`tel:${v.phone}`}
                    className="card card-hover p-4 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--gold-100)] to-[var(--gold-500)] text-black flex items-center justify-center font-bold shrink-0">
                      {v.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{v.name}</div>
                      <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>{v.phone}</div>
                    </div>
                    <Phone size={16} className="text-[--accent]" />
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* Run of show timeline */}
          <section className="mt-10">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={18} className="text-[--accent]" />
              <h2 className="font-bold">ציר הזמן של האירוע</h2>
            </div>
            <div className="card p-5 md:p-6 space-y-2">
              {runOfShow.map((item, i) => {
                const isPast = i < currentItemIndex;
                const isCurrent = i === currentItemIndex;
                const isFuture = i > currentItemIndex;
                return (
                  <div
                    key={i}
                    className={`rounded-2xl flex items-center gap-4 p-3 transition ${isCurrent ? "pulse-gold" : ""}`}
                    style={{
                      background: isCurrent
                        ? "linear-gradient(180deg, rgba(212,176,104,0.12), rgba(212,176,104,0.04))"
                        : isPast
                          ? "var(--input-bg)"
                          : "transparent",
                      border: isCurrent
                        ? "1px solid var(--border-gold)"
                        : "1px solid var(--border)",
                      opacity: isPast ? 0.55 : 1,
                    }}
                  >
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold ltr-num text-sm shrink-0 ${
                        isCurrent ? "bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black" : ""
                      }`}
                      style={
                        !isCurrent
                          ? {
                              background: isPast ? "rgba(52,211,153,0.15)" : "var(--surface-2)",
                              color: isPast ? "rgb(110,231,183)" : "var(--foreground-soft)",
                              border: isPast ? "1px solid rgba(52,211,153,0.3)" : "1px solid var(--border)",
                            }
                          : undefined
                      }
                    >
                      {isPast ? <CheckCircle2 size={20} /> : item.time}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`font-bold ${isCurrent ? "" : ""}`}>{item.label}</div>
                        {isCurrent && <span className="pill pill-gold text-[10px]"><Sparkles size={9} /> עכשיו</span>}
                      </div>
                      {item.detail && <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>{item.detail}</div>}
                    </div>
                    {isFuture && (
                      <div className="text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
                        {item.time}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-center" style={{ color: "var(--foreground-muted)" }}>
              💡 ציר הזמן ברירת מחדל — בעתיד תוכל לערוך אותו לפי האירוע הספציפי שלך
            </div>
          </section>

          {/* Footer reminder */}
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
              <Heart size={14} className="text-[--accent]" />
              <span>היום שלך. תיהנה מכל רגע.</span>
            </div>
          </div>
        </div>

        {showLiveModal && (
          <LiveEventModal eventId={event.id} hostNames={subjects} onClose={() => setShowLiveModal(false)} />
        )}
      </main>
    </>
  );
}

// ─────────────────────────── Live event QR modal ───────────────────────────

function LiveEventModal({
  eventId,
  hostNames,
  onClose,
}: {
  eventId: string;
  hostNames: string;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const liveUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/live/${eventId}`;
  }, [eventId]);

  // Generate the QR once on mount. We use a generous size so the printout
  // scans cleanly even from across a hall, and a high error-correction level
  // so the gold logo overlay doesn't break decoding (we don't add the overlay
  // yet, but the headroom is free and useful).
  useEffect(() => {
    let cancelled = false;
    if (!liveUrl) return;
    QRCode.toDataURL(liveUrl, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#1a1310", light: "#f4dea9" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        // Non-fatal — show the link without the QR.
        if (!cancelled) setQrDataUrl(null);
      });
    return () => { cancelled = true; };
  }, [liveUrl]);

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `momentum-live-qr-${eventId.slice(0, 8)}.png`;
    a.click();
  };

  const shareToWhatsapp = () => {
    const text = encodeURIComponent(
      `שלום! ${hostNames} שמחים להזמין אותך למצב האירוע החי שלנו 🎉\n\nכאן תוכלו למצוא את השולחן שלכם, את תוכנית הערב, להעלות תמונות ולכתוב ברכה:\n${liveUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — let the user select the link manually instead.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="live-modal-title"
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl scale-in"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 flex items-start justify-between gap-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <span className="pill pill-gold">
              <QrCode size={11} /> מצב אירוע חי
            </span>
            <h2 id="live-modal-title" className="mt-2 text-xl font-extrabold tracking-tight gradient-gold">
              שתף QR עם האורחים
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--foreground-soft)" }}>
              הדפס/הצג בכניסה — סריקה תפתח את עמוד האורח עם השולחן והתוכנית.
            </p>
          </div>
          <button onClick={onClose} aria-label="סגור" className="rounded-full w-9 h-9 flex items-center justify-center hover:bg-[var(--secondary-button-bg)]">
            <X size={16} />
          </button>
        </header>

        <div className="p-5">
          <div className="rounded-2xl p-4 flex items-center justify-center" style={{ background: "var(--input-bg)", border: "1px solid var(--border-gold)" }}>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR לעמוד החי" className="w-full max-w-[280px] aspect-square" />
            ) : (
              <div className="aspect-square w-full max-w-[280px] flex items-center justify-center text-sm" style={{ color: "var(--foreground-muted)" }}>
                מייצר QR...
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl px-3 py-2 text-center text-xs ltr-num break-all" style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--foreground-soft)" }} dir="ltr">
            {liveUrl}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5">
            <button
              onClick={downloadQr}
              disabled={!qrDataUrl}
              className="btn-gold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Download size={16} />
              הורד QR להדפסה
            </button>
            <button
              onClick={shareToWhatsapp}
              className="btn-secondary py-3 inline-flex items-center justify-center gap-2"
              style={{ background: "rgba(37,211,102,0.12)", borderColor: "rgba(37,211,102,0.45)", color: "rgb(74,222,128)" }}
            >
              <Share2 size={16} />
              שתף קישור ב-WhatsApp
            </button>
            <button
              onClick={copyLink}
              className="rounded-2xl py-3 text-sm inline-flex items-center justify-center gap-2"
              style={{ border: "1px dashed var(--border-strong)", color: "var(--foreground-soft)" }}
            >
              <Copy size={14} />
              {copied ? "הועתק ✓" : "העתק קישור"}
            </button>
          </div>

          <p className="mt-5 text-xs text-center" style={{ color: "var(--foreground-muted)" }}>
            לאחר 24 שעות מתחילת האירוע — העמוד יהפוך אוטומטית לאלבום זיכרון.
          </p>
        </div>
      </div>
    </div>
  );
}
