import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ArrowRight, ShieldCheck, Lock, Database, Eye, Trash2, Mail } from "lucide-react";

export const metadata = {
  title: "מדיניות פרטיות — Momentum",
  description: "איך אנחנו מטפלים בנתונים שלך ושל המוזמנים שלך.",
};

export default function PrivacyPage() {
  const sections = [
    {
      icon: <Database size={20} />,
      title: "מה אנחנו אוספים",
      body: [
        "שם ופרטי קשר שלך (מאימות Google / Apple / טלפון).",
        "פרטי האירוע שיצרת: תאריך, אזור, תקציב, סוג אירוע.",
        "רשימת המוזמנים שאתה מוסיף — שמות וטלפונים.",
        "מי מהמוזמנים אישר הגעה (RSVP).",
        "סדורי הושבה, הוצאות תקציב, ספקים שמורים.",
      ],
    },
    {
      icon: <Lock size={20} />,
      title: "איך אנחנו מאחסנים",
      body: [
        "כברירת מחדל — הכל נשמר רק בדפדפן שלך (localStorage). שום שרת לא רואה את הנתונים.",
        "אם הפעלת סנכרון בענן (Supabase) — הנתונים נשמרים בחשבון שלך, מוצפנים בעת תעבורה (TLS) ומופרדים מנתוני משתמשים אחרים על ידי Row Level Security.",
        "טלפונים והערות אורחים מוצפנים ב-AES-256-GCM לפני שליחה לענן (אופציונלי).",
        "קישורי הזמנה לוואטסאפ חתומים דיגיטלית (HMAC-SHA256) כדי שלא ניתן יהיה לזייף תשובות.",
      ],
    },
    {
      icon: <Eye size={20} />,
      title: "מי רואה את הנתונים",
      body: [
        "אתה — בכל זמן.",
        "אורחים שאתה מזמין רואים את שמך ופרטי האירוע (זה תוכן ההזמנה).",
        "ספקים שאתה יוצר איתם קשר רואים מה אתה שולח להם בלבד.",
        "אנחנו לא מוכרים, לא משכירים ולא חולקים נתונים עם צד שלישי.",
        "אנחנו לא משתמשים ב-cookies מעקב או באנליטיקס מצד שלישי.",
      ],
    },
    {
      icon: <ShieldCheck size={20} />,
      title: "אבטחה",
      body: [
        "כל התעבורה ב-HTTPS עם HSTS למשך שנתיים.",
        "כותרות אבטחה (CSP, X-Frame-Options, Permissions-Policy) חוסמות את רוב הוקטורי התקיפה.",
        "הזמנות חתומות ב-HMAC-SHA256 — אורחים לא יכולים לזייף תשובות.",
        "אימות OAuth דרך Google / Apple ו-OTP טלפוני דרך ספק אמין.",
        "אם זיהית פגיעות — צור איתנו קשר דרך security.txt.",
      ],
    },
    {
      icon: <Trash2 size={20} />,
      title: "הזכויות שלך",
      body: [
        "זכות עיון — בכל רגע אתה יכול לראות את כל הנתונים שלך באפליקציה.",
        "זכות תיקון — אתה יכול לערוך או למחוק כל פרט.",
        "זכות מחיקה — בלחיצה על 'התנתק' + מחיקת חשבון, כל הנתונים נמחקים תוך 30 יום.",
        "זכות ניידות — תוכל לייצא את כל המידע ל-PDF (כפתור 'ייצוא PDF' בכל עמוד).",
        "תלונה — תוכל לפנות לרשות להגנת הפרטיות במשרד המשפטים.",
      ],
    },
    {
      icon: <Mail size={20} />,
      title: "יצירת קשר",
      body: [
        "שאלות פרטיות: privacy@momentum.app",
        "פגיעויות אבטחה: security@momentum.app (ראה /.well-known/security.txt)",
        "תמיכה כללית: support@momentum.app",
      ],
    },
  ];

  return (
    <main className="min-h-screen pb-24 relative">
      <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-1/2 -translate-x-1/2 opacity-25" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
        <Link href="/" className="text-sm hover:text-white inline-flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
          <ArrowRight size={14} /> חזרה לדף הבית
        </Link>

        <div className="mt-6 flex justify-start">
          <Logo size={26} />
        </div>

        <header className="mt-10">
          <span className="eyebrow">מדיניות פרטיות</span>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
            הנתונים שלך — שלך.
          </h1>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
            בלי קוקיז מעקב. בלי מכירת נתונים. ברירת המחדל היא לשמור הכל מקומית במכשיר שלך.
            כשתבחר לסנכרן בענן — אנחנו מאחסנים בצורה מוצפנת, וזכויותיך החוקיות מובטחות.
          </p>
          <div className="mt-3 text-xs" style={{ color: "var(--foreground-muted)" }}>
            עודכן: 8 במאי 2026
          </div>
        </header>

        <div className="mt-12 space-y-5">
          {sections.map((s) => (
            <section key={s.title} className="card p-6 md:p-7">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-[--accent] shrink-0"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border-gold)" }}
                >
                  {s.icon}
                </div>
                <h2 className="text-xl font-bold">{s.title}</h2>
              </div>
              <ul className="space-y-2.5 ms-2">
                {s.body.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
                    <span className="text-[--accent] mt-1.5 shrink-0">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center text-xs" style={{ color: "var(--foreground-muted)" }}>
          המסמך הזה אינו ייעוץ משפטי. לפני שימוש מסחרי באפליקציה — מומלץ ליצור מדיניות פרטיות מותאמת לעסק שלך.
        </div>
      </div>
    </main>
  );
}
