"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppState } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { buildManagerInviteWhatsapp } from "@/lib/managerInvitation";
import { showToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Check,
  UserPlus,
  Crown,
  Phone,
  ShieldCheck,
  Wand2,
  Calendar,
} from "lucide-react";

/**
 * R20 — Momentum Live opt-in flow.
 *
 * Three steps:
 *   1. "intro"  — luxury landing that explains what Momentum Live is and
 *                  reassures the user it stays disabled if they walk away.
 *   2. "invite" — name + phone for the trusted person who'll manage the
 *                  event. We normalize the phone via lib/phone before insert.
 *   3. "done"   — confirmation that the invitation was created (the WhatsApp
 *                  dispatch is a Phase-2 concern; the row exists in DB now).
 *
 * Cloud-only feature: requires Supabase. Without it, step 3's insert fails
 * gracefully and the user sees a clear toast.
 */

const FEATURES = [
  {
    icon: <UserPlus size={22} aria-hidden />,
    title: "צ׳ק-אין אורחים בכניסה",
    desc: "סריקת QR בכניסה — תדעו בזמן אמת מי הגיע, מי לא, ומי הביא +1 לא מתוכנן",
  },
  {
    icon: <Wand2 size={22} aria-hidden />,
    title: "מפת שולחנות חיה",
    desc: "רואים את האירוע על מסך אחד — מי באיזה שולחן, איפה ריק, איפה מבולגן",
  },
  {
    icon: <Phone size={22} aria-hidden />,
    title: "תיאום ספקים בלחיצה",
    desc: "כפתור אחד = ה-DJ, הצלם, או הקייטרינג מקבלים את ההוראה — בלי לרוץ ולחפש אותם",
  },
  {
    icon: <ShieldCheck size={22} aria-hidden />,
    title: "התראות חכמות",
    desc: "המערכת מזהה: שולחן ריק כבר 30 דק׳, אורח שנתקע בכניסה, או מצב שדורש את תשומת הלב שלכם",
  },
  {
    icon: <Calendar size={22} aria-hidden />,
    title: "דוח מלא למחרת",
    desc: "מתעוררים — ומקבלים סיכום חי של האירוע. מי הגיע, איזה שולחן היה הכי כיפי, מה השפיע על הקצב",
  },
];

export default function EventManagerSetupPage() {
  const { state } = useAppState();
  const [step, setStep] = useState<"intro" | "invite" | "done">("intro");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Guard: no event → can't invite a manager. Mirror the same friendly empty
  // state we use across the app (lib/EmptyEventState pattern, inlined for
  // visual independence from the rest of the in-app shell).
  if (!state.event) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <h1 className="text-xl font-bold">צריך אירוע פעיל קודם</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
            כדי להפעיל את Momentum Live, צור קודם אירוע ב-onboarding.
          </p>
          <Link href="/onboarding?gate=ok" className="btn-gold mt-5 inline-flex items-center gap-2">
            צור אירוע <ArrowLeft size={14} aria-hidden />
          </Link>
        </div>
      </main>
    );
  }

  const handleInvite = async () => {
    const trimmedName = managerName.trim();
    if (!trimmedName) {
      showToast("חסר שם", "error");
      return;
    }
    // Normalize phone to "972XXXXXXXXX" so two records of the same person
    // (one "0501234567", another "+972-50-1234567") don't end up as separate
    // managers. Validation also catches obvious typos before the insert.
    const normalized = normalizeIsraeliPhone(managerPhone);
    if (!normalized.valid) {
      showToast("מספר טלפון לא תקין", "error");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("צריך לחבר את האפליקציה ל-Supabase קודם", "error");
        setSubmitting(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast("צריך להתחבר עם חשבון Momentum", "error");
        setSubmitting(false);
        return;
      }

      // Client-generated token. Each invitation gets a unique one so the
      // manager can be reached via a single-use link in Phase 2 (WhatsApp
      // dispatch). The DB has a UNIQUE constraint that prevents collisions.
      const token = crypto.randomUUID();

      // Type-assert through `never`: supabase-js v2 infers `never` for
      // tables that aren't in a generated `Database` type, so the insert
      // payload errors at compile time without help. The runtime shape
      // matches the migration's column list exactly.
      const { error } = await supabase
        .from("event_managers")
        .insert({
          event_id: state.event!.id,
          invited_by: user.id,
          invitee_phone: normalized.phone,
          invitee_name: trimmedName,
          role: "general", // Phase 1: single role. Phase 2 adds the role picker.
          invitation_token: token,
        } as unknown as never);

      if (error) {
        // Map the most common Postgres / network failure shapes to an
        // actionable Hebrew message. The full error still goes to console
        // for devs, but the user gets a concrete next step instead of a
        // generic "נסה שוב" they can't act on.
        console.error("[event-day/manager/setup] insert failed", error);
        const raw = error.message ?? "";
        let userMessage = "שמירת ההזמנה נכשלה. נסה שוב.";
        if (/does not exist|relation .* does not exist/i.test(raw)) {
          userMessage =
            "טבלת המנהלים לא קיימת ב-Supabase. הרץ את ה-SQL migrations (2026-05-10-event-day-manager.sql) דרך /manage/diagnose";
        } else if (/permission|policy|rls/i.test(raw)) {
          userMessage =
            "אין הרשאה. וודא שאתה מחובר ושה-RLS מוגדר נכון — בדוק ב-/manage/diagnose";
        } else if (/network|fetch|failed to/i.test(raw)) {
          userMessage = "אין חיבור ל-Supabase. בדוק חיבור לאינטרנט.";
        } else if (raw) {
          userMessage = `שגיאה: ${raw}`;
        }
        showToast(userMessage, "error");
        setSubmitting(false);
        return;
      }

      // R20 Phase 2 — fire WhatsApp with the prefilled invite message.
      // Must run synchronously in the same handler tick: browsers block
      // window.open from any async chain that left the user's click event.
      const { url: waUrl, valid: phoneValid } = buildManagerInviteWhatsapp({
        managerName: trimmedName,
        managerPhone: normalized.phone,
        invitationToken: token,
        eventHostName: state.event!.partnerName
          ? `${state.event!.hostName} ו-${state.event!.partnerName}`
          : state.event!.hostName,
        eventDate: state.event!.date,
      });
      // Even if phone was valid above, buildManagerInviteWhatsapp may flag
      // invalid in edge cases (we already validated, but the helper is the
      // single source of truth for wa.me shape). Toast and proceed either way.
      if (!phoneValid) {
        showToast("מספר לא תקין ל-WhatsApp — נפתח wa.me לבחירה ידנית", "info");
      }
      window.open(waUrl, "_blank", "noopener,noreferrer");

      setStep("done");
    } catch (e) {
      console.error("[event-day/manager/setup]", e);
      showToast("שגיאה. נסה שוב.", "error");
    }
    setSubmitting(false);
  };

  // ═════════════════════════ INTRO ═════════════════════════
  if (step === "intro") {
    return (
      <>
        <main className="min-h-screen pb-16 px-5">
          <div className="max-w-3xl mx-auto pt-8">
            <Link
              href="/event-day"
              className="text-sm inline-flex items-center gap-2"
              style={{ color: "var(--foreground-soft)" }}
            >
              <ArrowRight size={14} aria-hidden /> חזרה
            </Link>

            <div className="mt-10 text-center">
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4"
                style={{ background: "linear-gradient(135deg, #F4DEA9, #A8884A)", color: "#1A1310" }}
              >
                <Sparkles size={12} aria-hidden /> פיצ&apos;ר חדש
              </div>
              <Logo size={32} />
              <h1 className="mt-6 text-4xl md:text-5xl font-extrabold gradient-gold tracking-tight">
                Momentum Live
              </h1>
              <p className="mt-4 text-lg max-w-xl mx-auto" style={{ color: "var(--foreground-soft)" }}>
                אתם תחגגו. מישהו אחר ינהל.{" "}
                <strong className="text-[--foreground]">ללא לחץ, ללא דאגה</strong> — רק האירוע שלכם.
              </p>
            </div>

            <div className="mt-12 card-gold p-8 md:p-12 text-center relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -top-20 -end-20 w-72 h-72 rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(212,176,104,0.30), transparent 70%)" }}
              />
              <div
                aria-hidden
                className="absolute -bottom-20 -start-20 w-72 h-72 rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(244,222,169,0.20), transparent 70%)" }}
              />

              <div className="relative">
                <Crown size={48} className="mx-auto text-[--accent]" aria-hidden />
                <h2 className="mt-5 text-2xl md:text-3xl font-bold">הסוד של חתונות חלקות</h2>
                <p className="mt-3 text-sm md:text-base max-w-lg mx-auto" style={{ color: "var(--foreground-soft)" }}>
                  בכל חתונה ישראלית יש מישהו אחד — אח, אחות, חבר/ה הכי קרוב/ה — שמסתובב/ת כל הערב,
                  פותר/ת בעיות, מתאם/ת עם הספקים.
                  <br />
                  <strong className="text-[--foreground]">
                    אנחנו פשוט נותנים לאדם הזה כלים מקצועיים
                  </strong>
                  , כדי שאתם תוכלו להיות חתן וכלה בלבד.
                </p>
              </div>
            </div>

            <div className="mt-12">
              <h2 className="text-xl font-bold mb-6 text-center">מה כלול</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {FEATURES.map((f, i) => (
                  <div key={i} className="card p-5 flex gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/20 to-[#A8884A]/10 border border-[var(--border-gold)] flex items-center justify-center text-[--accent] shrink-0">
                      {f.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{f.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 card p-6">
              <div className="flex gap-3 items-start">
                <Check size={20} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <h3 className="font-bold">תמיד אופציונלי</h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
                    אם תחליטו לא להפעיל — כלום לא משתנה. תמיד תוכלו לחזור ולהפעיל לפני האירוע, מאוחר יותר,
                    או אפילו ביום עצמו.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 grid sm:grid-cols-2 gap-3">
              <Link
                href="/event-day"
                className="rounded-2xl py-4 text-center text-sm font-semibold inline-flex items-center justify-center gap-2"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
              >
                לא עכשיו <ArrowRight size={14} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => setStep("invite")}
                className="btn-gold inline-flex items-center justify-center gap-2 py-4 text-sm"
              >
                <Sparkles size={16} aria-hidden /> כן, בוא נתחיל
              </button>
            </div>

            <p
              className="mt-8 text-center text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              משהו לא עובד?{" "}
              <Link href="/manage/diagnose" className="underline">
                בדיקת מערכת
              </Link>
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // ═════════════════════════ INVITE ═════════════════════════
  if (step === "invite") {
    return (
      <>
        <main className="min-h-screen pb-16 px-5">
          <div className="max-w-xl mx-auto pt-10">
            <button
              type="button"
              onClick={() => setStep("intro")}
              className="text-sm inline-flex items-center gap-2"
              style={{ color: "var(--foreground-soft)" }}
            >
              <ArrowRight size={14} aria-hidden /> חזרה
            </button>

            <div className="mt-8 text-center">
              <UserPlus size={32} className="mx-auto text-[--accent]" aria-hidden />
              <h1 className="mt-4 text-3xl font-extrabold gradient-gold">
                מי ינהל את האירוע שלכם?
              </h1>
              <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: "var(--foreground-soft)" }}>
                בחרו אדם אמין במשפחה — בדרך כלל אח/אחות, או חבר/ה קרוב/ה. הם יקבלו הודעת WhatsApp עם
                הזמנה.
              </p>
            </div>

            <div className="mt-10 card p-6">
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-xs block mb-2" style={{ color: "var(--foreground-soft)" }}>
                    שם המנהל
                  </span>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="לדוגמה: דני (אח של הכלה)"
                    className="input"
                    maxLength={80}
                  />
                </label>

                <label className="block">
                  <span className="text-xs block mb-2" style={{ color: "var(--foreground-soft)" }}>
                    מספר טלפון
                  </span>
                  <input
                    type="tel"
                    dir="ltr"
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="input text-start"
                  />
                  <p className="mt-2 text-xs" style={{ color: "var(--foreground-muted)" }}>
                    המנהל יקבל קישור ב-WhatsApp עם הסבר על התפקיד
                  </p>
                </label>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStep("intro")}
                  className="rounded-2xl py-3 text-sm font-semibold"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={submitting || !managerName.trim() || !managerPhone.trim()}
                  className="btn-gold inline-flex items-center justify-center gap-2 py-3 disabled:opacity-50"
                >
                  {submitting ? (
                    "שולח..."
                  ) : (
                    <>
                      שלח הזמנה <ArrowLeft size={14} aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // ═════════════════════════ DONE ═════════════════════════
  return (
    <>
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card-gold p-10 text-center max-w-md">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center">
            <Check size={36} className="text-emerald-400" aria-hidden />
          </div>
          <h1 className="mt-6 text-2xl font-bold gradient-gold">ההזמנה נשלחה!</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
            <strong className="text-[--foreground]">{managerName}</strong> קיבל/ה הודעה ב-WhatsApp עם הקישור.
            ברגע שהם יאשרו — יראו את הדשבורד הניהולי.
          </p>
          <div className="mt-8 grid gap-2">
            <Link href="/event-day" className="btn-gold py-3">
              חזרה לדף יום-האירוע
            </Link>
            <Link href="/dashboard" className="text-xs" style={{ color: "var(--foreground-muted)" }}>
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
