/**
 * R42 — FAQ. Native <details>/<summary> accordion → zero client JS,
 * fully accessible, works without "use client".
 */
const QA: Array<{ q: string; a: string }> = [
  {
    q: "מה ההבדל בין החינמי לפרימיום?",
    a: "החינמי מתאים לאירועים קטנים (עד 50 איש). הפרימיום מסיר כל הגבלה — מוזמנים ללא הגבלה, AI ביום האירוע, דוח Wrapped בסוף, ועוד עשרות פיצ'רים. תשלום אחד של ₪99 (מחיר השקה), בלי מנוי.",
  },
  {
    q: "כמה זמן לוקח להגדיר אירוע?",
    a: "פחות מ-5 דקות. רוב הזוגות סיימו את ה-onboarding ושלחו הזמנה ראשונה תוך 10 דקות.",
  },
  {
    q: "האם הנתונים שלי בטוחים?",
    a: "כן — הצפנה ברמה בנקאית, RLS על כל טבלה, GDPR מלא. הנתונים שלכם אצלכם, לא נמכרים ולא משותפים.",
  },
  {
    q: "מה קורה אם אני מתחרט?",
    a: "החזר מלא תוך 30 יום, בלי שאלות. הביטול בקליק אחד מההגדרות. לאחר 30 יום — בעלות חד-פעמית, אין חיובים נוספים.",
  },
  {
    q: "זה עובד גם בלי אינטרנט?",
    a: "כן — האפליקציה היא PWA. תוכלו לעבוד באירוע בלי קליטה, והנתונים יסתנכרנו כשתחזרו לרשת.",
  },
  {
    q: "מה עם הסבתא שלי שלא מבינה באפליקציות?",
    a: "האורחים שלכם לא צריכים להוריד שום דבר. הם פשוט לוחצים על קישור בוואצפ ועונים — עובד גם למי שמשתמש בטלפון בפעם הראשונה.",
  },
  {
    q: "איך זה שונה מ-Excel + WhatsApp?",
    a: "Excel = רישום. Momentum = ניהול חי: RSVP אוטומטי, חישוב תקציב חי, AI שמתריע, ספקים בלחיצה אחת. החיסכון במתח לבד שווה את המחיר.",
  },
];

export function FAQ() {
  return (
    <section className="py-24 md:py-32 relative">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <h2
          className="text-center font-bold gradient-text"
          style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
        >
          שאלות נפוצות
        </h2>

        <div className="mt-12 space-y-3">
          {QA.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl overflow-hidden"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <summary
                className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-4 font-bold"
                style={{ minHeight: 56 }}
              >
                <span>{item.q}</span>
                <span
                  className="text-[--accent] transition-transform group-open:rotate-45 text-2xl leading-none shrink-0"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <div
                className="px-5 pb-5 leading-relaxed"
                style={{ color: "var(--foreground-soft)", fontSize: "1.02rem" }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
