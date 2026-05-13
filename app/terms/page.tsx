import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ArrowRight, AlertTriangle, FileText, Scale, Wallet, ShieldOff, Megaphone, Gavel } from "lucide-react";

export const metadata = {
  title: "תנאי שימוש — Momentum",
  description: "התנאים לשימוש באפליקציית Momentum. גרסת בטא — חשוב לקרוא.",
};

export default function TermsPage() {
  const sections = [
    {
      icon: <FileText size={20} />,
      title: "השימוש באפליקציה",
      body: [
        "Momentum הוא כלי לעזרה בתכנון אירועים — צ׳קליסטים, רשימת מוזמנים, ניהול תקציב, וקטלוג ספקים.",
        "אנחנו לא מתכננים את האירוע שלך, לא מבצעים את ההזמנות, ולא חתומים על שום עסקה במקומך.",
        "כל ההחלטות הסופיות — בחירת ספקים, חתימת חוזים, תשלומים — בידיים שלך.",
      ],
    },
    {
      icon: <Megaphone size={20} />,
      title: "הקטלוג של הספקים",
      body: [
        "הקטלוג מכיל פרטי קשר ומידע ציבורי על ספקים. זה מידע — לא המלצה אישית, לא ערבות, לא אישור איכות.",
        "Momentum איננה צד לעסקה בינך לבין הספק.",
        "אנחנו לא אחראים לאיכות, מחיר, זמינות, אמינות או מצב חוקי של ספק כלשהו.",
        "אנחנו ממליצים לבדוק כל ספק באופן עצמאי לפני התקשרות — חוות דעת, רשימות מומלצים, ניסיון אישי.",
      ],
    },
    {
      icon: <Wallet size={20} />,
      title: "תשלומים ומסלולים",
      body: [
        "המסלול החינמי זמין ללא חיוב.",
        "מסלול הפרימיום לזוגות הוא תשלום חד-פעמי של ₪399 לאירוע — ללא מנוי חודשי וללא חיובים חוזרים.",
        "מסלולי הספקים (₪199 / ₪499 לחודש) הם מנוי חודשי נפרד; מתאר את התנאים מפורש בעת ההצטרפות.",
        "ערבות 14 יום מהרכישה — נחזיר את כל הסכום אם לא היית מרוצה.",
      ],
    },
    {
      icon: <ShieldOff size={20} />,
      title: "הגבלת אחריות",
      body: [
        "השימוש באפליקציה הוא על אחריותך הבלעדית.",
        "Momentum, מפעיליה ועובדיה לא יישאו באחריות לכל נזק ישיר, עקיף, מיוחד או תוצאתי הנובע משימוש באפליקציה — לרבות אובדן נתונים, פספוס מועדים, חוסר תאימות עם דרישות חוקיות, או נזק כלכלי כתוצאה מבחירת ספק.",
        "אנחנו לא ערבים שהשירות יהיה זמין רצוף, נטול שגיאות, או יעמוד בכל ציפיותיך.",
      ],
    },
    {
      icon: <Scale size={20} />,
      title: "סיום שימוש",
      body: [
        "אתה יכול להפסיק להשתמש בכל רגע — מחיקת חשבון בעמוד ההגדרות.",
        "אנחנו שומרים לעצמנו את הזכות לסיים את השירות, להפסיק חשבון או לשנות תנאים — נודיע מראש 14 יום לכל הפחות.",
      ],
    },
    {
      icon: <Gavel size={20} />,
      title: "דין שיפוט",
      body: [
        "תנאים אלה כפופים לדין הישראלי.",
        "סמכות שיפוט בלעדית נתונה לבתי המשפט המוסמכים בתל אביב-יפו.",
      ],
    },
  ];

  return (
    <main className="min-h-screen relative">
      <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 left-1/2 -translate-x-1/2 opacity-30" />

      <div className="px-5 sm:px-8 pt-6 relative z-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm hover:text-white" style={{ color: "var(--foreground-muted)" }}>
          <ArrowRight size={14} /> חזרה לדף הבית
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-10 pb-24 relative z-10">
        <div className="text-center fade-up">
          <Logo size={40} className="mx-auto" />
          <h1 className="mt-7 text-4xl md:text-5xl font-bold tracking-tight gradient-text">
            תנאי שימוש
          </h1>
          <p className="mt-4 max-w-xl mx-auto" style={{ color: "var(--foreground-soft)" }}>
            התנאים שמתחתם אנחנו עובדים. בעברית פשוטה, בלי טריקים.
          </p>
          <p className="mt-2 text-xs ltr-num" style={{ color: "var(--foreground-muted)" }}>
            עדכון אחרון: 8 במאי 2026
          </p>
        </div>

        {/* Beta disclaimer banner — yellow, top of page, non-dismissible. */}
        <div
          className="mt-10 rounded-2xl px-5 py-4 flex items-start gap-3"
          style={{
            background: "rgba(251, 191, 36, 0.10)",
            border: "1px solid rgba(251, 191, 36, 0.45)",
            color: "rgb(252, 211, 77)",
          }}
          role="alert"
        >
          <AlertTriangle size={22} className="shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <strong className="font-bold block mb-0.5">⚠️ Momentum נמצאת בגרסת בטא.</strong>
            ייתכנו שינויים, אובדן נתונים, באגים. השימוש על אחריותך.
          </div>
        </div>

        <div className="mt-10 space-y-5 stagger">
          {sections.map((s) => (
            <section key={s.title} className="card p-7">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}
                >
                  {s.icon}
                </div>
                <h2 className="text-xl font-bold">{s.title}</h2>
              </div>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
                {s.body.map((line, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-[--accent] shrink-0 mt-1.5">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-10 card-gold p-7 text-center">
          <h3 className="text-xl font-bold gradient-gold">שאלות?</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            כתוב לנו ל-
            <a href="mailto:legal@momentum.app" className="text-[--accent] hover:underline ms-1">legal@momentum.app</a>
            . אנחנו עונים תוך יומיים.
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--foreground-muted)" }}>
            ראה גם:{" "}
            <Link href="/privacy" className="text-[--accent] hover:underline">מדיניות פרטיות</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
