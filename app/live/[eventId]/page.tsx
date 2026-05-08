"use client";

/**
 * Public live-event page.
 *
 * Two modes, picked by URL state and event.date:
 *  - LIVE — the event is upcoming or in progress. Shows countdown, "find your
 *    table" lookup, run-of-show, blessings input, photo upload.
 *  - MEMORY — 24h+ after the event. Read-only album of the blessings + photos
 *    submitted during the live mode.
 *
 * Data sourcing:
 *  - On the HOST's device: reads from localStorage via useAppState().
 *  - For GUESTS: relies on the same. Guests open the page on their own phone,
 *    but the localStorage there is empty until they have signed up — so this
 *    page is functional primarily on the host's installed PWA today. A future
 *    Supabase-backed snapshot will unlock cross-device rendering. For now we
 *    surface a friendly hint when there's no active event in storage.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { actions, useAppState } from "@/lib/store";
import { Logo } from "@/components/Logo";
import { showToast } from "@/components/Toast";
import { trackEvent } from "@/lib/analytics";
import {
  CalendarDays,
  MapPin,
  Sparkles,
  Search,
  Send,
  Camera,
  Heart,
  Image as ImageIcon,
  Clock,
  PartyPopper,
} from "lucide-react";

interface Slot {
  /** HH:MM in 24h. */
  time: string;
  label: string;
  detail?: string;
}

const DEFAULT_SCHEDULE: Slot[] = [
  { time: "19:00", label: "קבלת פנים", detail: "כניסה רכה, סטנד מתוקים פתוח" },
  { time: "20:00", label: "הטקס / חופה", detail: "המקום המרכזי" },
  { time: "20:30", label: "ארוחה", detail: "מנה ראשונה ועיקרית" },
  { time: "22:00", label: "ריקודים", detail: "פתיחת רחבה — ריקוד ראשון" },
];

/** Time-of-event mode used to switch the entire UI between live ↔ memory. */
type LiveMode = "upcoming" | "live" | "memory";

function deriveMode(eventDate: string | null | undefined, now: number): LiveMode {
  if (!eventDate) return "upcoming";
  const start = new Date(eventDate).getTime();
  if (Number.isNaN(start)) return "upcoming";
  // Treat the entire event-day window as "live" (start of day → 24h later).
  const dayStart = new Date(eventDate);
  dayStart.setHours(0, 0, 0, 0);
  const memoryFrom = dayStart.getTime() + 24 * 60 * 60 * 1000;
  if (now >= memoryFrom) return "memory";
  if (now >= dayStart.getTime()) return "live";
  return "upcoming";
}

export default function LiveEventPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId ?? "";
  const { state, hydrated } = useAppState();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Track view on first mount (analytics-light, local-only).
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackEvent("live_view", { eventId });
  }, [eventId]);

  if (!hydrated) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ color: "var(--foreground-muted)" }}>
        טוען...
      </main>
    );
  }

  const event = state.event;
  // We don't enforce a strict eventId match — a host opening their own
  // /live/* link should always see THEIR event regardless of which UUID they
  // pasted. If we later cross-reference cloud data we can tighten this.
  if (!event) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-10 text-center max-w-md">
          <h1 className="text-2xl font-bold">המצב החי לא זמין</h1>
          <p className="mt-3" style={{ color: "var(--foreground-soft)" }}>
            פתח את הקישור במכשיר של מארח האירוע, או בדוק שהקישור תקין.
          </p>
        </div>
      </main>
    );
  }

  const mode = deriveMode(event.date, now);

  if (mode === "memory") {
    return <MemoryAlbum />;
  }

  return <LiveBoard mode={mode} now={now} />;
}

// ─────────────────────────────────── Live mode ───────────────────────────────────

function LiveBoard({ mode, now }: { mode: LiveMode; now: number }) {
  const { state } = useAppState();
  const event = state.event!;
  const subjects = event.partnerName ? `${event.hostName} ו${event.partnerName}` : event.hostName;
  const dateLabel = new Date(event.date).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const where = [event.synagogue, event.city].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen pb-16 relative overflow-x-hidden">
      <div aria-hidden className="absolute inset-0 -z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-25" style={{ background: "radial-gradient(circle, rgba(212,176,104,0.45), transparent 70%)" }} />
      </div>

      <div className="max-w-xl mx-auto px-5 pt-8 relative z-10">
        <div className="flex justify-center">
          <Logo size={26} />
        </div>

        <section className="card-gold p-7 md:p-9 mt-8 relative overflow-hidden text-center">
          <div aria-hidden className="absolute -top-24 -end-24 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(212,176,104,0.22),transparent_70%)] blur-2xl" />
          <span className="pill pill-gold relative">
            <Sparkles size={11} /> מצב אירוע חי
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight gradient-gold leading-[1.05] relative">
            {subjects}
          </h1>
          <div className="mt-4 flex flex-col items-center gap-2 relative" style={{ color: "var(--foreground-soft)" }}>
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-[--accent]" />
              <span className="font-medium">{dateLabel}</span>
            </div>
            {where && (
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-[--accent]" />
                <span>{where}</span>
              </div>
            )}
          </div>

          <CountdownOrLive eventDate={event.date} now={now} mode={mode} />
        </section>

        <FindMyTable />
        <RunOfShow />
        <BlessingsBlock />
        <PhotosBlock />

        <div className="mt-8 text-center text-xs" style={{ color: "var(--foreground-muted)" }}>
          <Heart size={12} className="inline ms-1 text-[--accent]" />
          מצב אירוע חי · Momentum
        </div>
      </div>
    </main>
  );
}

function CountdownOrLive({ eventDate, now, mode }: { eventDate: string; now: number; mode: LiveMode }) {
  if (mode === "live") {
    return (
      <div className="mt-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold" style={{ background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.45)", color: "rgb(167,243,208)" }}>
        <PartyPopper size={16} /> האירוע מתקיים עכשיו 🎉
      </div>
    );
  }
  const target = new Date(eventDate).getTime();
  const ms = Math.max(0, target - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return (
    <div className="mt-7 relative">
      <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>עוד</div>
      <div className="mt-2 grid grid-cols-4 gap-2 max-w-md mx-auto">
        {[
          { v: days, l: "ימים" },
          { v: hours, l: "שעות" },
          { v: minutes, l: "דקות" },
          { v: seconds, l: "שניות" },
        ].map((u) => (
          <div key={u.l} className="rounded-2xl py-3 px-2 text-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-gold)" }}>
            <div className="text-2xl md:text-3xl font-extrabold ltr-num gradient-gold tabular-nums">
              {u.v.toString().padStart(2, "0")}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--foreground-muted)" }}>{u.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────── Find my table ───────────────────────────────────

function FindMyTable() {
  const { state } = useAppState();
  const [code, setCode] = useState("");
  const [resolved, setResolved] = useState<{ guestName: string; tableName: string; tableId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) return;
    // Match by exact guest id (RSVP code) OR by case-insensitive name as a friendly fallback.
    const lower = trimmed.toLowerCase();
    const guest =
      state.guests.find((g) => g.id === trimmed) ??
      state.guests.find((g) => g.name.toLowerCase() === lower);
    if (!guest) {
      setError("הקוד לא נמצא. בדוק עם בעלי האירוע.");
      setResolved(null);
      return;
    }
    const tableId = state.seatAssignments[guest.id];
    if (!tableId) {
      setError("עוד לא הוקצה לך שולחן. שאל את המארחים.");
      setResolved(null);
      return;
    }
    const table = state.tables.find((t) => t.id === tableId);
    if (!table) {
      setError("שולחן לא נמצא.");
      setResolved(null);
      return;
    }
    setResolved({ guestName: guest.name, tableName: table.name, tableId: table.id });
    trackEvent("live_table_lookup", { eventId: state.event?.id ?? "" });
  };

  return (
    <section className="card p-6 mt-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Search size={18} className="text-[--accent]" />
        המקום שלך
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
        הזן את שמך או הקוד האישי שלך — נראה לך באיזה שולחן אתה.
      </p>
      <form onSubmit={lookup} className="mt-4 flex gap-2">
        <input
          className="input flex-1"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="לדוגמה: דנה כהן"
          aria-label="קוד RSVP אישי או שם"
        />
        <button type="submit" className="btn-gold inline-flex items-center gap-2 px-5">
          <Search size={14} /> חפש
        </button>
      </form>
      {error && (
        <div className="mt-3 text-sm" style={{ color: "rgb(252,165,165)" }}>{error}</div>
      )}
      {resolved && (
        <div className="mt-4 rounded-2xl p-5 text-center" style={{ background: "rgba(212,176,104,0.08)", border: "1px solid var(--border-gold)" }}>
          <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>שלום {resolved.guestName},</div>
          <div className="mt-1 text-2xl font-extrabold gradient-gold">השולחן שלך: {resolved.tableName}</div>
          <TableMap highlightTableId={resolved.tableId} />
        </div>
      )}
    </section>
  );
}

function TableMap({ highlightTableId }: { highlightTableId: string }) {
  const { state } = useAppState();
  if (state.tables.length === 0) return null;
  return (
    <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
      {state.tables.map((t) => {
        const active = t.id === highlightTableId;
        return (
          <div
            key={t.id}
            className="rounded-2xl py-3 text-center"
            style={{
              background: active ? "linear-gradient(135deg, #F4DEA9, #A8884A)" : "var(--input-bg)",
              color: active ? "#1A1310" : "var(--foreground-soft)",
              border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
              fontWeight: active ? 700 : 500,
            }}
            aria-current={active ? "true" : undefined}
          >
            <div className="text-[10px]" style={{ opacity: 0.7 }}>שולחן</div>
            <div className="text-sm">{t.name}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────── Run of show ───────────────────────────────────

function RunOfShow() {
  return (
    <section className="card p-6 mt-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Clock size={18} className="text-[--accent]" />
        תוכנית הערב
      </h2>
      <ol className="mt-4 space-y-2">
        {DEFAULT_SCHEDULE.map((s) => (
          <li
            key={s.time}
            className="flex items-start gap-3 rounded-xl px-3 py-2"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
          >
            <span
              className="ltr-num text-sm font-bold rounded-lg px-2 py-1 shrink-0 mt-0.5"
              style={{ background: "rgba(212,176,104,0.12)", color: "var(--accent)" }}
            >
              {s.time}
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">{s.label}</div>
              {s.detail && <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─────────────────────────────────── Blessings ───────────────────────────────────

function BlessingsBlock() {
  const { state } = useAppState();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const remaining = 280 - text.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    actions.addBlessing(text, name);
    trackEvent("live_blessing", { eventId: state.event?.id ?? "" });
    setText("");
    showToast("הברכה נשמרה ✓", "success");
  };

  return (
    <section className="card p-6 mt-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Heart size={18} className="text-[--accent]" />
        ברכות
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
        כתוב ברכה קצרה — עד 280 תווים. תופיע באלבום הזיכרון של בני הזוג.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          className="input"
          placeholder="שמך (אופציונלי)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          aria-label="שמך"
        />
        <textarea
          className="input"
          rows={3}
          maxLength={280}
          placeholder="מאחל/ת לכם המון אהבה ואושר..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="טקסט הברכה"
          style={{ resize: "none" }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs ltr-num" style={{ color: remaining < 0 ? "rgb(248,113,113)" : "var(--foreground-muted)" }}>
            {text.length} / 280
          </span>
          <button type="submit" disabled={!text.trim() || remaining < 0} className="btn-gold inline-flex items-center gap-2 disabled:opacity-40">
            <Send size={14} /> שלח ברכה
          </button>
        </div>
      </form>

      {state.blessings.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--foreground-muted)" }}>
            {state.blessings.length} ברכות עד עכשיו
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {state.blessings.slice().reverse().slice(0, 5).map((b) => (
              <BlessingCard key={b.id} text={b.text} name={b.fromName} at={b.at} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BlessingCard({ text, name, at }: { text: string; name?: string; at: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
      <p className="text-sm leading-relaxed">{text}</p>
      <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--foreground-muted)" }}>
        <span>— {name || "אורח אנונימי"}</span>
        <span className="ltr-num">{new Date(at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────── Photos ───────────────────────────────────

function PhotosBlock() {
  const { state } = useAppState();
  const [busy, setBusy] = useState(false);

  // Plain handler — React 19 + the React Compiler memoize for us; manual
  // useCallback would trip the `preserve-manual-memoization` lint rule.
  const onPick = async (file: File) => {
    if (busy) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("הקובץ גדול מ-5MB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("רק תמונות מותרות", "error");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      actions.addLivePhoto(dataUrl);
      trackEvent("live_photo", { eventId: state.event?.id ?? "" });
      showToast("התמונה נשמרה ✓", "success");
    } catch {
      showToast("שגיאה בטעינת התמונה", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-6 mt-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Camera size={18} className="text-[--accent]" />
        תמונות מהערב
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
        העלה תמונה מהערב (עד 5MB). היא תצטרף לאלבום הזיכרון.
      </p>

      <label
        className={`mt-4 block rounded-2xl py-6 text-center cursor-pointer transition ${busy ? "opacity-50" : ""}`}
        style={{ background: "var(--input-bg)", border: "1px dashed var(--border-strong)" }}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          disabled={busy}
        />
        <ImageIcon size={28} className="mx-auto text-[--accent]" aria-hidden />
        <div className="mt-2 text-sm font-semibold">{busy ? "מעלה..." : "בחר תמונה או צלם עכשיו"}</div>
        <div className="mt-1 text-xs" style={{ color: "var(--foreground-muted)" }}>JPG / PNG · עד 5MB</div>
      </label>

      {state.livePhotos.length > 0 && (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--foreground-muted)" }}>
            {state.livePhotos.length} תמונות
          </div>
          <div className="grid grid-cols-3 gap-2">
            {state.livePhotos.slice().reverse().slice(0, 9).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.src}
                alt={p.caption || "תמונה מהערב"}
                loading="lazy"
                className="aspect-square w-full rounded-xl object-cover"
                style={{ border: "1px solid var(--border)" }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────── Memory album ───────────────────────────────────

function MemoryAlbum() {
  const { state } = useAppState();
  const event = state.event!;
  const subjects = event.partnerName ? `${event.hostName} ו${event.partnerName}` : event.hostName;
  const dateLabel = new Date(event.date).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const sortedBlessings = useMemo(
    () => [...state.blessings].sort((a, b) => b.at.localeCompare(a.at)),
    [state.blessings],
  );
  const sortedPhotos = useMemo(
    () => [...state.livePhotos].sort((a, b) => b.at.localeCompare(a.at)),
    [state.livePhotos],
  );

  return (
    <main className="min-h-screen pb-20 relative">
      <div aria-hidden className="absolute inset-0 -z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-20" style={{ background: "radial-gradient(circle, rgba(212,176,104,0.45), transparent 70%)" }} />
      </div>

      <div className="max-w-3xl mx-auto px-5 pt-10 relative z-10">
        <div className="flex justify-center">
          <Logo size={26} />
        </div>

        <header className="text-center mt-8">
          <span className="pill pill-gold inline-flex">
            <Sparkles size={11} /> אלבום זיכרון
          </span>
          <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight gradient-gold leading-[1.05]">
            {subjects}
          </h1>
          <p className="mt-3" style={{ color: "var(--foreground-soft)" }}>
            {dateLabel}
          </p>
        </header>

        {sortedPhotos.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Camera size={18} className="text-[--accent]" />
              תמונות
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sortedPhotos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.src}
                  alt={p.caption || "תמונה מהערב"}
                  loading="lazy"
                  className="aspect-square w-full rounded-2xl object-cover"
                  style={{ border: "1px solid var(--border)" }}
                />
              ))}
            </div>
          </section>
        )}

        {sortedBlessings.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Heart size={18} className="text-[--accent]" />
              ברכות מהאורחים
            </h2>
            <div className="space-y-3">
              {sortedBlessings.map((b) => (
                <BlessingCard key={b.id} text={b.text} name={b.fromName} at={b.at} />
              ))}
            </div>
          </section>
        )}

        {sortedBlessings.length === 0 && sortedPhotos.length === 0 && (
          <div className="mt-12 text-center" style={{ color: "var(--foreground-muted)" }}>
            לא נשמרו ברכות או תמונות.
          </div>
        )}

        <div className="mt-12 flex flex-col items-center gap-3">
          <Link href="/dashboard" className="btn-gold inline-flex items-center gap-2">
            חזרה למסע
          </Link>
          <p className="text-xs" style={{ color: "var(--foreground-muted)" }}>
            <Heart size={11} className="inline ms-1 text-[--accent]" />
            תודה לכל מי שהיה איתנו · Momentum
          </p>
        </div>
      </div>
    </main>
  );
}
