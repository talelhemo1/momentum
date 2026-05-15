"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { SettingsSkeleton } from "@/components/skeletons/PageSkeletons";
import { useUser, userActions } from "@/lib/user";
import { useTheme } from "@/lib/theme";
import { useAppState, actions } from "@/lib/store";
import { eventSlots } from "@/lib/eventSlots";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import {
  managerSoundsEnabled,
  setManagerSoundsEnabled,
  playManagerSound,
} from "@/lib/managerSounds";
import { generateSigningKey } from "@/lib/crypto";
import { deleteCloudData } from "@/lib/sync";
import { formatEventDate } from "@/lib/format";
import { showToast } from "@/components/Toast";
import {
  ArrowRight,
  User,
  Sun,
  Moon,
  Bell,
  Download,
  Upload,
  Printer,
  Shield,
  Trash2,
  AlertTriangle,
  Check,
  CreditCard,
  HelpCircle,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const { theme, setTheme } = useTheme();
  const { state } = useAppState();
  const [notifyEnabled, setNotifyEnabled] = useState<NotificationPermission | "unknown">("unknown");
  // R26 — Momentum Live alert-sound opt-in.
  const [soundsOn, setSoundsOn] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundsOn(managerSoundsEnabled());
  }, []);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (hydrated && !user) router.replace("/signup");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifyEnabled(Notification.permission);
    }
  }, []);

  const requestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      showToast("הדפדפן שלך לא תומך בהתראות", "info");
      return;
    }
    if (Notification.permission === "granted") {
      setNotifyEnabled("granted");
      return;
    }
    if (Notification.permission === "denied") {
      showToast("ההתראות חסומות בדפדפן — אפשר להפעיל בהגדרות הדפדפן", "info");
      return;
    }
    // iOS PWA quirk: Notification.requestPermission() can hang forever and
    // leave the toggle stuck in "מפעיל" state. Race against a 5s timeout so
    // the UI always recovers, even when the underlying API never resolves.
    try {
      const permission = await Promise.race<NotificationPermission>([
        Notification.requestPermission(),
        new Promise<NotificationPermission>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), 5000),
        ),
      ]);
      setNotifyEnabled(permission);
      if (permission !== "granted") {
        showToast("לא ניתן הרשאת התראות", "info");
      }
    } catch {
      showToast("לא הצלחנו להפעיל התראות. נסה שוב מהדפדפן ישירות", "error");
    }
  };

  const exportData = () => {
    // Single self-contained JSON dump of every data point a user can recover with.
    // Shape mirrors the AppState so a future "import" can round-trip cleanly.
    const data = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      user: userActions.getSnapshot(),
      event: state.event,
      guests: state.guests,
      budget: state.budget,
      checklist: state.checklist,
      tables: state.tables,
      seatAssignments: state.seatAssignments,
      selectedVendors: state.selectedVendors,
      savedVendors: state.savedVendors,
      vendorChats: state.vendorChats,
      // Full state too — for backwards compatibility with the existing import flow.
      state,
      slots: eventSlots.list(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `momentum-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (file: File) => {
    // Hard size cap so a malformed multi-MB file can't OOM the tab.
    const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_IMPORT_BYTES) {
      showToast("הקובץ גדול מדי (מקסימום 5MB)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);

        // Top-level shape check.
        if (!parsed || typeof parsed !== "object" || !parsed.state || typeof parsed.state !== "object") {
          showToast("מבנה הקובץ לא תקין", "error");
          return;
        }

        // Deep validation: every collection field must be an array (not a
        // string or number), every nested object the shape we expect.
        // Without this, a malicious or corrupt export could land
        // `state.guests = "boom"` in localStorage, and every page that
        // does `state.guests.find(...)` would throw on next render.
        const s = parsed.state as Record<string, unknown>;
        const ARRAY_FIELDS = [
          "guests", "budget", "selectedVendors", "savedVendors", "checklist", "tables",
          "vendorChats", "assistantMessages", "compareVendors",
          "blessings", "livePhotos",
        ] as const;
        for (const field of ARRAY_FIELDS) {
          if (s[field] !== undefined && !Array.isArray(s[field])) {
            showToast(`שדה ${field} לא תקין בקובץ`, "error");
            return;
          }
        }
        if (s.seatAssignments !== undefined &&
            (typeof s.seatAssignments !== "object" || s.seatAssignments === null || Array.isArray(s.seatAssignments))) {
          showToast("שדה seatAssignments לא תקין", "error");
          return;
        }
        if (s.event !== undefined && s.event !== null &&
            (typeof s.event !== "object" || Array.isArray(s.event))) {
          showToast("שדה event לא תקין", "error");
          return;
        }

        // Migration: legacy exports may lack a signingKey on the event.
        // Without one, /inbox refuses every RSVP. Mint one before persisting.
        const importedState = parsed.state as { event?: { signingKey?: string } | null };
        if (importedState.event && !importedState.event.signingKey) {
          importedState.event.signingKey = generateSigningKey();
        }

        window.localStorage.setItem(STORAGE_KEYS.app, JSON.stringify(importedState));
        window.dispatchEvent(new CustomEvent("momentum:update"));
        showToast("הנתונים יובאו בהצלחה", "success");
      } catch {
        showToast("הקובץ לא תקין", "error");
      }
    };
    reader.onerror = () => showToast("שגיאה בקריאת הקובץ", "error");
    reader.readAsText(file);
  };

  /**
   * Permanent, irrecoverable account deletion.
   * 1) Best-effort delete of the cloud row (if Supabase is enabled).
   * 2) Clear EVERY momentum.* key from localStorage + sessionStorage.
   * 3) Sign out of Supabase auth.
   * 4) Reset in-memory app state and notify subscribers.
   * 5) Toast + redirect to landing.
   */
  const performDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      // 1) Best-effort cloud cleanup. If it fails we still clear locally —
      // the user shouldn't be stuck because of a network blip.
      await deleteCloudData();

      // 2) Wipe every momentum-related storage key in localStorage and sessionStorage.
      const wipe = (storage: Storage) => {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith("momentum.")) keys.push(k);
        }
        keys.forEach((k) => storage.removeItem(k));
      };
      try { wipe(window.localStorage); } catch {}
      try { wipe(window.sessionStorage); } catch {}

      // 3) Auth sign-out (also clears Supabase tokens stored under their own keys).
      await userActions.signOut();

      // 4) Reset live state so any open subscribers see emptiness immediately.
      actions.resetAll();
    } finally {
      setDeleting(false);
    }
    showToast("החשבון נמחק", "success");
    router.push("/");
  };

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setDeleteInput("");
  };

  if (!hydrated || !user) {
    return (
      <>
        <Header />
        <SettingsSkeleton />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 pb-24 relative">
        <div aria-hidden className="glow-orb glow-orb-gold w-[500px] h-[500px] -top-40 left-1/2 -translate-x-1/2 opacity-25" />

        <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
          <Link href="/dashboard" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
            <ArrowRight size={14} /> חזרה למסע
          </Link>

          <header className="mt-7">
            <span className="eyebrow">הגדרות</span>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">המוצר שלך, השליטה שלך</h1>
            <p className="mt-2" style={{ color: "var(--foreground-soft)" }}>שנה כל הגדרה, ייצא נתונים, או מחק חשבון.</p>
          </header>

          <div className="mt-10 space-y-5">
            {/* Account */}
            <Section icon={<User size={20} />} title="חשבון">
              <Row label="שם" value={user.name} />
              <Row label="זהות" value={user.identifier} mono />
              <Row label="שיטת התחברות" value={user.method === "google" ? "Google" : user.method === "apple" ? "Apple" : "טלפון"} />
              <Row label="תאריך הצטרפות" value={formatEventDate(user.createdAt, "short")} />
            </Section>

            {/* Subscription */}
            <Section icon={<CreditCard size={20} />} title="מנוי ותשלומים">
              <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black flex items-center justify-center font-bold text-xs">
                  חינם
                </div>
                <div className="flex-1">
                  <div className="font-semibold">המסלול הנוכחי: התחלה</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>אירוע אחד · עד 50 מוזמנים</div>
                </div>
                <Link href="/pricing" className="btn-gold text-sm py-2 px-4">שדרג</Link>
              </div>
              <div className="text-xs leading-relaxed mt-3 px-1" style={{ color: "var(--foreground-muted)" }}>
                💳 כשתשדרג, נתמוך בכרטיסי אשראי, Apple Pay, Google Pay ו-Bit. ביטול בכל רגע.
              </div>
            </Section>

            {/* Theme */}
            <Section icon={theme === "dark" ? <Moon size={20} /> : <Sun size={20} />} title="ערכת נושא">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTheme("dark")}
                  className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition ${theme === "dark" ? "card-selected" : ""}`}
                  style={{ background: "var(--surface-2)", border: "1px solid " + (theme === "dark" ? "var(--accent)" : "var(--border)") }}
                >
                  <Moon size={20} className="text-[--accent]" />
                  <div className="text-sm font-semibold">כהה</div>
                  {theme === "dark" && <Check size={14} className="text-[--accent]" />}
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={`p-4 rounded-2xl flex flex-col items-center gap-2 transition ${theme === "light" ? "card-selected" : ""}`}
                  style={{ background: "var(--surface-2)", border: "1px solid " + (theme === "light" ? "var(--accent)" : "var(--border)") }}
                >
                  <Sun size={20} className="text-[--accent]" />
                  <div className="text-sm font-semibold">בהיר</div>
                  {theme === "light" && <Check size={14} className="text-[--accent]" />}
                </button>
              </div>
            </Section>

            {/* Notifications */}
            <Section icon={<Bell size={20} />} title="התראות">
              {notifyEnabled === "granted" ? (
                <div className="flex items-center gap-2 text-sm text-emerald-300">
                  <Check size={16} /> ההתראות מופעלות. תקבל תזכורות חכמות לפני כל שלב חשוב.
                </div>
              ) : notifyEnabled === "denied" ? (
                <div className="text-sm" style={{ color: "var(--foreground-soft)" }}>
                  ההתראות חסומות. כדי להפעיל, פתח את הגדרות הדפדפן.
                </div>
              ) : (
                <button onClick={requestNotifications} className="btn-gold text-sm py-2 px-4 inline-flex items-center gap-2">
                  <Bell size={14} /> הפעל התראות
                </button>
              )}
              <p className="text-xs mt-3" style={{ color: "var(--foreground-muted)" }}>
                נתריע על תזכורות תשלום, מועדים אחרונים לסגירת ספקים, ואורחים שעוד לא ענו.
              </p>

              {/* R26 — Momentum Live alert sounds */}
              <div
                className="mt-4 pt-4 flex items-center justify-between gap-3"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div>
                  <div className="text-sm font-medium">🔔 צלילי התראה במצב חי</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>
                    צליל עדין על צ׳ק-אין והתראות חכמות במהלך האירוע.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundsOn}
                  onClick={() => {
                    const next = !soundsOn;
                    setSoundsOn(next);
                    setManagerSoundsEnabled(next);
                    if (next) playManagerSound("checkin");
                  }}
                  className="relative w-12 h-7 rounded-full shrink-0 transition-colors"
                  style={{
                    background: soundsOn ? "var(--accent)" : "var(--input-bg)",
                    border: "1px solid var(--border-strong)",
                  }}
                  aria-label="צלילי התראה במצב חי"
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{
                      insetInlineStart: 2,
                      transform: soundsOn ? "translateX(-20px)" : "translateX(0)",
                    }}
                  />
                </button>
              </div>
            </Section>

            {/* Print */}
            <Section icon={<Printer size={20} />} title="הדפסה">
              <p className="text-sm" style={{ color: "var(--foreground-soft)" }}>
                כפתור &quot;ייצא ל-PDF&quot; מופיע בעמודי המוזמנים, התקציב, ההושבה והמאזן. לחץ עליו → הדפסה / שמירה כ-PDF.
              </p>
              <button onClick={() => window.print()} className="btn-secondary mt-3 text-sm py-2 px-4 inline-flex items-center gap-2">
                <Printer size={14} /> הדפס את העמוד הזה
              </button>
            </Section>

            {/* Privacy & Data — single section per phase 4 spec */}
            <Section icon={<Shield size={20} />} title="פרטיות ונתונים">
              <div className="space-y-3">
                <button
                  onClick={exportData}
                  className="w-full btn-secondary py-3 inline-flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  ייצא את כל המידע שלי
                </button>

                {/* Import stays available — useful for restoring from a previous export. */}
                <label className="w-full btn-secondary py-3 inline-flex items-center justify-center gap-2 cursor-pointer">
                  <Upload size={16} />
                  ייבוא מקובץ JSON
                  <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
                </label>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link href="/privacy" className="rounded-xl p-3 text-sm flex items-center gap-2 hover:bg-[var(--secondary-button-bg)]" style={{ border: "1px solid var(--border)" }}>
                    <Shield size={14} /> מדיניות פרטיות
                  </Link>
                  <Link href="/terms" className="rounded-xl p-3 text-sm flex items-center gap-2 hover:bg-[var(--secondary-button-bg)]" style={{ border: "1px solid var(--border)" }}>
                    <HelpCircle size={14} /> תנאי שימוש
                  </Link>
                </div>

                {/* R14: "Restart event" was moved here from the dashboard
                    hero. It's destructive (deletes the active event + all
                    its data) so it sits beside the account-delete in the
                    danger-adjacent area. Account-delete is still strictly
                    more destructive (deletes the user too) — that one keeps
                    the red treatment.
                    R17 P1#4: hidden when there's no active event — nothing
                    to restart. The settings page still works without an
                    event (theme, account, sign-out remain). */}
                {state.event && <RestartEventButton />}

                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="w-full rounded-xl py-3 text-sm font-bold transition mt-2"
                  style={{
                    background: "rgba(248,113,113,0.1)",
                    color: "rgb(252, 165, 165)",
                    border: "1px solid rgba(248,113,113,0.3)",
                  }}
                >
                  <Trash2 size={14} className="inline ms-2" />
                  מחק את החשבון שלי לצמיתות
                </button>
              </div>
            </Section>

            {/* Danger zone — keep sign-out separate so accidental clicks don't sign people out. */}
            <Section icon={<AlertTriangle size={20} className="text-red-300" />} title="התנתקות" danger>
              <button
                onClick={async () => {
                  // R12+ — same fix as Header: hard-reload to wipe every
                  // in-memory cache (admin badge, supabase client, user
                  // store) so the next render truly is signed-out.
                  // R19 — destination /signup (was /). See Header.handleSignOut
                  // for the rationale.
                  try {
                    await userActions.signOut();
                  } finally {
                    window.location.href = "/signup";
                  }
                }}
                className="w-full rounded-xl py-2.5 text-sm font-semibold transition"
                style={{ border: "1px solid var(--border-strong)", color: "var(--foreground-soft)" }}
              >
                התנתק
              </button>
            </Section>
          </div>

          {showDeleteDialog && (
            <DeleteAccountDialog
              input={deleteInput}
              setInput={setDeleteInput}
              onCancel={closeDeleteDialog}
              onConfirm={performDelete}
              busy={deleting}
            />
          )}
        </div>
      </main>
    </>
  );
}

function Section({
  icon,
  title,
  children,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="card p-6" style={danger ? { borderColor: "rgba(248,113,113,0.2)" } : undefined}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[--accent]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {icon}
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div className="text-sm" style={{ color: "var(--foreground-muted)" }}>{label}</div>
      <div className={`text-sm font-medium truncate ${mono ? "ltr-num font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

const REQUIRED_DELETE_WORD = "מחק";

function DeleteAccountDialog({
  input,
  setInput,
  onCancel,
  onConfirm,
  busy,
}: {
  input: string;
  setInput: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const canConfirm = input.trim() === REQUIRED_DELETE_WORD && !busy;
  // Esc-to-close — but only when the action isn't busy. A mid-delete Esc
  // would leave the request running with no UI feedback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal
      aria-labelledby="delete-account-title"
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 md:p-7 scale-in"
        style={{
          background: "var(--surface-1)",
          border: "1px solid rgba(248,113,113,0.35)",
          boxShadow: "0 24px 80px -20px rgba(248,113,113,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(248,113,113,0.12)", color: "rgb(252,165,165)" }}>
              <AlertTriangle size={20} />
            </div>
            <h2 id="delete-account-title" className="text-xl font-bold">מחיקת חשבון לצמיתות</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            aria-label="סגור"
            className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-[var(--secondary-button-bg)] disabled:opacity-40"
            style={{ color: "var(--foreground-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
          הפעולה הזו <strong className="text-red-300">לא ניתנת לשחזור</strong>. כל הנתונים שלך — אירועים, מוזמנים, תקציבים, סידורי הושבה, מעטפות — יימחקו מהמכשיר ומהענן.
        </p>

        <label className="block mt-5 text-xs" style={{ color: "var(--foreground-muted)" }}>
          כדי לאשר, הקלד <strong className="text-red-300 mx-1 ltr-num">&quot;{REQUIRED_DELETE_WORD}&quot;</strong> בתיבה:
        </label>
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder={REQUIRED_DELETE_WORD}
          className="input mt-2"
          style={{ borderColor: canConfirm ? "rgba(248,113,113,0.6)" : "var(--border)" }}
        />

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40"
            style={{ border: "1px solid var(--border-strong)", color: "var(--foreground-soft)" }}
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold transition"
            style={{
              background: canConfirm ? "rgb(248,113,113)" : "rgba(248,113,113,0.15)",
              color: canConfirm ? "white" : "rgba(252,165,165,0.6)",
              border: "1px solid rgba(248,113,113,0.5)",
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "מוחק..." : "מחק לצמיתות"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * R14 — moved from app/dashboard/page.tsx (Hero header).
 * Wipes the active event slot and routes to /onboarding for a fresh setup.
 * Lives next to "delete account" because it's destructive in scope (event +
 * guests + budget + seating + checklist) but stops short of nuking the user.
 */
function RestartEventButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    eventSlots.deleteActive();
    setOpen(false);
    router.push("/onboarding");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl py-3 text-sm font-semibold transition mt-2 inline-flex items-center justify-center gap-2"
        style={{
          background: "var(--input-bg)",
          color: "var(--foreground-soft)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <RefreshCw size={14} aria-hidden /> התחל אירוע חדש מאפס
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="card glass-strong p-7 w-full max-w-md scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-red-300 mb-4"
              style={{
                background: "rgba(248,113,113,0.1)",
                border: "1px solid rgba(248,113,113,0.3)",
              }}
            >
              <AlertCircle size={22} aria-hidden />
            </div>
            <h3 className="text-xl font-bold">להתחיל מחדש?</h3>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "var(--foreground-soft)" }}
            >
              הפעולה תמחק את האירוע הנוכחי, כולל המוזמנים, התקציב, סידורי
              ההושבה והצ׳קליסט.{" "}
              <strong>לא ניתן לשחזר אחרי הפעולה.</strong>
              <br />
              <br />
              אם אתה רוצה לשמור את האירוע הזה ופשוט להוסיף עוד אחד — לחץ על
              שם האירוע בכותרת, ובחר &quot;אירוע חדש&quot;.
            </p>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary">
                ביטול
              </button>
              <button
                onClick={onConfirm}
                className="rounded-full px-5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition"
              >
                כן, מחק והתחל
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
