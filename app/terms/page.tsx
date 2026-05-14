import Link from "next/link";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  AlertTriangle,
  FileText,
  Scale,
  Wallet,
  ShieldOff,
  Megaphone,
  Gavel,
  BookOpen,
  CheckCircle2,
  UserCheck,
  Key,
  Ban,
  Image as ImageIcon,
  Users,
  Briefcase,
  Sparkles,
  Server,
  UserMinus,
  Lock,
  Copyright,
  Mail,
  RefreshCw,
  Building2,
} from "lucide-react";

export const metadata = {
  title: "תנאי שימוש — Momentum",
  description:
    "התנאים המשפטיים המלאים לשימוש באפליקציית Momentum. גרסה 1.0 — תקפים מ-14 במאי 2026.",
};

/**
 * R14 — Comprehensive terms of use page (replaces the previous 6-section
 * draft). All 19 sections from the canonical legal document
 * (07-משפטי/06-תנאי-שימוש-מלא.md) now live in production. Each section
 * has a concise icon + heading + bullet list so a non-lawyer user can
 * actually scan it before agreeing.
 *
 * **Lawyer review still required before final launch.** The "טיוטה
 * מקצועית" banner stays at the top to make that explicit to any user
 * who reads the bottom-of-page footer.
 */

const TERMS_VERSION = "1.0";
const TERMS_DATE_HE = "14 במאי 2026";

export default function TermsPage() {
  const sections = [
    {
      n: "1",
      icon: <BookOpen size={20} />,
      title: "הגדרות",
      body: [
        "\"החברה\" / \"אנחנו\" — חברה רשומה (פרטים בסעיף 19) המפעילה את שירותי Momentum.",
        "\"השירות\" — אפליקציה ופלטפורמה דיגיטלית לתכנון אירועים, זמינה דרך momentum-psi-ten.vercel.app ודרך התקנה כ-PWA.",
        "\"המשתמש\" / \"אתה\" — כל אדם שנרשם או משתמש בשירות.",
        "\"זוג\" / \"מארח\" — משתמש שמתכנן אירוע (חתונה, חינה, בר/בת מצווה וכו').",
        "\"ספק\" — משתמש שהציע את שירותי העסק שלו דרך הפלטפורמה (צילום, DJ, אולם, וכו').",
        "\"אורח\" — אדם שקיבל הזמנה דיגיטלית דרך הפלטפורמה ופועל מולה (אישור הגעה).",
      ],
    },
    {
      n: "2",
      icon: <CheckCircle2 size={20} />,
      title: "הסכמה לתנאים",
      body: [
        "השימוש בשירות מהווה הסכמה מלאה לתנאי שימוש אלה ולמדיניות הפרטיות המצורפת.",
        "אם אינך מסכים לתנאים — אסור לך להשתמש בשירות.",
        "התנאים עשויים להתעדכן. שינויים מהותיים יישלחו בהודעה במייל לפחות 14 ימים לפני כניסתם לתוקף.",
      ],
    },
    {
      n: "3",
      icon: <UserCheck size={20} />,
      title: "גיל שימוש",
      body: [
        "השירות מיועד לבני 18 ומעלה בלבד.",
        "אסור להירשם או להשתמש בשירות אם אתה מתחת לגיל 18.",
        "אם זיהינו שמשתמש מתחת לגיל 18 — נחסום את החשבון ונמחק את כל הנתונים.",
      ],
    },
    {
      n: "4",
      icon: <Key size={20} />,
      title: "רישום וחשבון",
      body: [
        "לרישום נדרשים: כתובת מייל / מספר טלפון / חשבון Google.",
        "הסיסמה / חשבון השלישי שאתה משתמש בו — באחריותך הבלעדית. שמור עליהם.",
        "אסור ליצור חשבון מזויף, לזייף זהות, או להציג עצמך כמי שאינך.",
        "אסור להעביר חשבון לאדם אחר.",
      ],
    },
    {
      n: "5",
      icon: <Ban size={20} />,
      title: "שימושים אסורים",
      body: [
        "אסור להשתמש בשירות לכל מטרה לא חוקית.",
        "אסור לשלוח ספאם / הודעות לא רצויות.",
        "אסור להפיץ מידע פוגעני, מסית, גזעני, פורנוגרפי או הוצאת דיבה.",
        "אסור לזייף זהות של ספק / זוג / אורח.",
        "אסור לבצע תקיפה / hacking / scraping אוטומטי של תוכן.",
        "אסור להעמיס על השרת באופן בלתי-סביר (DoS).",
        "אסור לעקוף מנגנוני אבטחה / RLS / paywall.",
        "הפרה של אחד מהסעיפים האלה — חסימה מיידית של החשבון ללא החזר.",
      ],
    },
    {
      n: "6",
      icon: <ImageIcon size={20} />,
      title: "תוכן משתמש",
      body: [
        "כל תוכן שאתה מעלה (שמות, תמונות, פרטי אורחים, וכו') — שלך, לא שלנו.",
        "אתה מצהיר שיש לך זכות חוקית להעלות את התוכן הזה.",
        "אתה מעניק לנו רישיון לא-בלעדי לשמור, להעביר ולהציג את התוכן בהיקף הנדרש להפעלת השירות.",
        "אתה האחראי הבלעדי על תקינות התוכן (פרטי אורחים אמיתיים, רשות לשלוח להם הזמנה, וכו').",
        "אסור להעלות תוכן של אדם שלישי בלי הסכמתו (תמונות, פרטים אישיים).",
      ],
    },
    {
      n: "7",
      icon: <Users size={20} />,
      title: "ניהול אורחים ואחריות פרטיות",
      body: [
        "כשאתה מוסיף אורח לאפליקציה — אתה מצהיר שיש לך אישור ממנו או שיש לך זכות חוקית להזמין אותו.",
        "השירות שולח הודעות WhatsApp/SMS לאורחים שאתה מציין. אנחנו לא שולחים תוכן יזום מטעמנו — רק את ההודעה שאתה יוצר.",
        "אם אורח מבקש להפסיק לקבל הודעות, האחריות עליך להסיר אותו מהרשימה.",
        "אנחנו לא משווקים לאורחים שלך, לא מוכרים את הנתונים שלהם, ולא משתמשים בהם לכל מטרה אחרת.",
      ],
    },
    {
      n: "8",
      icon: <Wallet size={20} />,
      title: "תשלומים ומסלולים",
      body: [
        "השירות מציע מסלול חינם עם פיצ'רים בסיסיים.",
        "מסלולי premium (לזוגות / לספקים) דורשים תשלום חודשי.",
        "התשלום מחויב בכרטיס אשראי / PayPal / העברה בנקאית בתחילת כל חודש.",
        "ביטול מסלול premium: בכל רגע, מההגדרות. הביטול תקף מהחודש הבא.",
        "החזר: 30 יום אחרי רכישה ראשונה — החזר מלא ללא שאלות. אחרי 30 יום — אין החזר על חודשים שכבר חויבו, אבל לא תחויב יותר.",
        "אנחנו רשאים לשנות מחירים. שינוי יתרחש לאחר התראה של 30 יום, ויתחיל בחודש העוקב.",
      ],
    },
    {
      n: "9",
      icon: <Briefcase size={20} />,
      title: "ספקים ותנאים מיוחדים",
      body: [
        "ספק שמצטרף לפלטפורמה צריך לעבור אישור ידני של החברה.",
        "החברה רשאית לדחות בקשה ללא נימוק.",
        "ספק מוצהר שכל הפרטים שמסר נכונים. בדיקה ראשונית שלנו אינה ערבות לאיכות שירותו של הספק.",
        "החברה אינה צד לעסקה בין ספק ללקוח. עסקה היא ישירות בין הספק לבין הלקוח.",
        "החברה אינה אחראית לאיכות השירות / מחירים / זמינות / ביצוע של ספקים. זוגות חייבים לבצע due diligence עצמאית.",
        "ספק שמקבל ביקורות שליליות חוזרות, או שמפר תנאים — החברה רשאית להסיר אותו מהקטלוג.",
      ],
    },
    {
      n: "10",
      icon: <Sparkles size={20} />,
      title: "AI Generation",
      body: [
        "האפליקציה מציעה יצירת הזמנות באמצעות AI.",
        "התמונות שנוצרות הן רכוש המשתמש לשימוש פרטי באירוע שלו.",
        "שימוש מסחרי בתמונות שנוצרו דורש בדיקה משפטית עצמאית — חוקי זכויות יוצרים על תוצרי AI עדיין לא מוגדרים בישראל.",
        "החברה אינה אחראית אם תמונה שנוצרה דומה ליצירה קיימת — זה סיכון מובנה ב-AI.",
        "ה-prompts שנשלחים ל-AI לא נשמרים אצלנו. ה-AI provider עשוי לשמור — ראה את מדיניות הפרטיות שלהם.",
      ],
    },
    {
      n: "11",
      icon: <Server size={20} />,
      title: "אחריות וכשלים טכניים",
      body: [
        "השירות ניתן \"כפי שהוא\" (AS-IS) — אין ערבות שיהיה זמין ללא הפרעות.",
        "החברה תשתדל לתחזק את השירות, אבל לא מתחייבת לזמינות 100%.",
        "תקלה ביום אירוע: החברה אינה אחראית לנזק שייגרם משימוש בשירות (אורח שלא קיבל הזמנה כי השרת נפל, וכו'). מומלץ לתחזק רשימת אורחים בקובץ נוסף (Excel/Google Sheets).",
        "אובדן נתונים: אנחנו לא אחראים לאובדן נתונים שנגרם מ-(א) בעיה בצד המשתמש (מחיקת cookies, החלפת מכשיר), (ב) בעיה אצל ספק חיצוני, (ג) כוח עליון.",
      ],
    },
    {
      n: "12",
      icon: <ShieldOff size={20} />,
      title: "הגבלת אחריות",
      body: [
        "בכל מקרה, האחריות הכוללת של החברה כלפי המשתמש לא תעלה על: משתמש בחינם — ₪0; משתמש premium / ספק — סך התשלומים ב-12 החודשים האחרונים.",
        "החברה לא אחראית לנזק עקיף, נזק רגשי, אובדן הזדמנות, או נזק שאינו ישיר.",
      ],
    },
    {
      n: "13",
      icon: <UserMinus size={20} />,
      title: "הסרה ומחיקת חשבון",
      body: [
        "אתה רשאי למחוק את חשבונך בכל רגע מההגדרות.",
        "מחיקה גורמת ל: מחיקת כל הנתונים האישיים שלך תוך 30 יום, ביטול אוטומטי של מסלולי premium, ושמירת נתונים מינימליים הנדרשים בחוק (לדוגמה: רישומי חשבונית מס).",
        "אם אתה ספק — מחיקה תסיר אותך מהקטלוג. הזוגות שכבר עשו איתך עסק יראו \"ספק שעזב את הפלטפורמה\".",
        "החברה רשאית לחסום חשבון של משתמש שמפר תנאי שימוש, ללא החזר.",
      ],
    },
    {
      n: "14",
      icon: <Lock size={20} />,
      title: "סודיות ופרטיות",
      body: [
        "ראה את מדיניות הפרטיות המצורפת לפרטים מלאים.",
        "אנחנו לא מוכרים נתונים אישיים לאף צד שלישי.",
        "אנחנו עומדים בתנאי תיקון 13 לחוק הגנת הפרטיות (ישראל) ותקנות GDPR (אם נחיל).",
      ],
    },
    {
      n: "15",
      icon: <Copyright size={20} />,
      title: "זכויות יוצרים",
      body: [
        "השירות, הקוד, העיצוב, הלוגו והמותג \"Momentum\" — בבעלות החברה.",
        "אסור להעתיק / לשכפל / להפיץ חלקים מהשירות בלי אישור בכתב.",
        "הקוד הסגור — אין רישיון open source. אסור לעשות reverse-engineering, decompile, או להוציא חלקים.",
      ],
    },
    {
      n: "16",
      icon: <Gavel size={20} />,
      title: "שיפוט וחוק חל",
      body: [
        "על תנאי שימוש אלה חל חוק מדינת ישראל.",
        "סמכות שיפוט בלעדית: בית המשפט המוסמך בתל אביב-יפו.",
      ],
    },
    {
      n: "17",
      icon: <Mail size={20} />,
      title: "תקשורת מהחברה",
      body: [
        "הסכמת לקבל מאיתנו: התראות פעילות (אורח אישר, ספק חדש, וכו') — חובה כל עוד יש לך חשבון.",
        "עדכונים על השירות (פיצ'רים חדשים, שדרוגים) — אפשר לבטל הסכמה.",
        "תוכן שיווקי (טיפים, מבצעים) — opt-in בלבד.",
        "לבטל הסכמה — מההגדרות שלך.",
      ],
    },
    {
      n: "18",
      icon: <RefreshCw size={20} />,
      title: "שינויים בתנאים",
      body: [
        "החברה רשאית לעדכן את התנאים מעת לעת.",
        "שינויים מהותיים יישלחו במייל 14 יום לפני כניסתם לתוקף.",
        "המשך שימוש בשירות אחרי כניסת השינוי לתוקף — מהווה הסכמה לתנאים החדשים.",
      ],
    },
    {
      n: "19",
      icon: <Building2 size={20} />,
      title: "פרטי החברה",
      body: [
        "Momentum (בהליכי רישום).",
        "אימייל יצירת קשר: legal@momentum.app",
        "אימייל לתלונות: complaints@momentum.app",
        "אימייל להגנת פרטיות: privacy@momentum.app",
        "ייעודכן עם השלמת רישום החברה הרשמי.",
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
            גרסה {TERMS_VERSION} · תקף מ-{TERMS_DATE_HE}
          </p>
        </div>

        {/* Beta + draft banner — yellow, top of page, non-dismissible. */}
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
            ייתכנו שינויים, באגים, או הפסקות שירות זמניות. השימוש על אחריותך הבלעדית.
          </div>
        </div>

        <div className="mt-10 space-y-5 stagger">
          {sections.map((s) => (
            <section key={s.n} className="card p-7" id={`section-${s.n}`}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}
                >
                  {s.icon}
                </div>
                <h2 className="text-xl font-bold">
                  <span className="text-[--accent] me-2 ltr-num">{s.n}.</span>
                  {s.title}
                </h2>
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
          <p className="mt-4 text-[10px]" style={{ color: "var(--foreground-muted)" }}>
            תקנון זה הוא טיוטה מקצועית. לפני אירוע משפטי משמעותי, מומלץ לפנות לעורך דין מורשה בישראל.
          </p>
        </div>
      </div>
    </main>
  );
}
