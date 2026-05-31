/**
 * R42 — FAQ. Native <details>/<summary> accordion → zero client JS,
 * fully accessible, works without "use client".
 */
const QA: Array<{ q: string; a: string }> = [
  {
    q: "כמה זמן לוקח להגדיר אירוע?",
    a: "כמה דקות. מגדירים את פרטי האירוע, מייבאים אנשי קשר ושולחים הזמנה ראשונה — וכל מה שתעדכנו מסתנכרן אוטומטית.",
  },
  {
    q: "איך עובדות השיחות האוטומטיות למוזמנים?",
    a: "מוזמן שלא הגיב גם אחרי תזכורות ב-WhatsApp מקבל שיחה קצרה ואדיבה ששואלת אם מגיע וכמה אנשים. התשובה מתעדכנת אוטומטית ברשימת המוזמנים — בלי שתרימו טלפון. מתקשרים רק למי שטרם ענה, כדי לא להציק.",
  },
  {
    q: "מה עם הסבתא שלי שלא מבינה באפליקציות?",
    a: "האורחים לא צריכים להוריד שום דבר. לחיצה על קישור ב-WhatsApp או מענה לשיחה קצרה — וזהו. פשוט וברור גם לסבא וסבתא.",
  },
  {
    q: "האם הנתונים שלי בטוחים?",
    a: "כן. החיבור מוצפן (HTTPS), לכל משתמש יש הרשאות גישה משלו, והנתונים נשמרים אוטומטית בענן. לא מוכרים ולא משתפים אותם — נקודה.",
  },
  {
    q: "האם זה מתאים גם לבר/בת מצווה, ברית או חינה?",
    a: "כן — Momentum תומך ב-9 סוגי אירועים: חתונה, בר מצווה, בת מצווה, שבת חתן, אירוסין, ברית, יום הולדת, אירוע עסקי וחינה. הקופי, המחשבונים והממשק מתאימים את עצמם לכל אירוע.",
  },
  {
    q: "מי רואה את הנתונים שלי?",
    a: "רק אתם. ספקים שתבחרו לפנות אליהם רואים את הסגנון והתקציב הכללי — לא את השם או הטלפון — עד שתאשרו. אנחנו לא מוכרים נתונים.",
  },
  {
    q: "צריך להתקין אפליקציה מה-App Store?",
    a: "לא חובה. Momentum עובדת ישירות מהדפדפן, וניתן להוסיף אותה למסך הבית של הטלפון בלחיצה — ואז היא נראית ופועלת כמו אפליקציה רגילה.",
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
