import {
  Users,
  MessageCircle,
  Phone,
  Calculator,
  Sparkles,
  Layout,
  Activity,
  PiggyBank,
  Store,
  type LucideIcon,
} from "lucide-react";

/**
 * R151 — flagship feature grid. Rewritten for accuracy + brevity:
 *   • Every card describes a feature that actually ships today.
 *   • Adds the automated voice-call RSVP (NLPearl) which was missing.
 *   • Removes the retired in-app chat copy + the QR check-in (it's a
 *     one-tap check-in, no QR) + the inflated "+24 features" claim.
 * Server component, CSS-only hover. Icons in a gold token chip.
 */
const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Users,
    title: "ניהול מוזמנים חכם",
    body: "ייבוא אנשי קשר, קבוצות, פלוסים וסטטוס הגעה שמתעדכן בזמן אמת — רשימה אחת לכל המשפחה.",
  },
  {
    icon: MessageCircle,
    title: "הזמנות ותזכורות ב-WhatsApp",
    body: "הזמנה אישית עם לינק לאישור הגעה, ותזכורות אוטומטיות בעדינות למי שעדיין לא ענה.",
  },
  {
    icon: Phone,
    title: "שיחות אוטומטיות לאישור הגעה",
    body: "מי שלא הגיב גם אחרי ההודעות מקבל שיחה קצרה ואדיבה — והתשובה (מגיעים? כמה?) מתעדכנת אצלכם לבד.",
  },
  {
    icon: Layout,
    title: "סידור הושבה + שליחת שולחנות",
    body: "אלגוריתם שמשבץ לפי קבוצות וקונפליקטים, עם גרירה ידנית — ושליחת מספר השולחן לכל אורח ב-WhatsApp.",
  },
  {
    icon: Calculator,
    title: "תקציב חי + מחשבונים",
    body: "כל שקל מתועד מול מקדמות ויתרות, עם מחשבוני עלות-לאורח, מעטפות, אלכוהול וסימולטור ׳מה אם׳.",
  },
  {
    icon: Sparkles,
    title: "AI Co-Pilot",
    body: "מתריע מראש לפני חריגת תקציב, מציע ספקים לפי הסגנון שלכם, ועונה על שאלות תכנון בעברית.",
  },
  {
    icon: Activity,
    title: "יום האירוע — Momentum Live",
    body: "מנהל-משנה מקבל דשבורד חי: צ׳ק-אין אורחים בלחיצה, שידור הודעות וטיפול בעדכונים. אתם רוקדים.",
  },
  {
    icon: Store,
    title: "ספקים מאומתים + ביקורות",
    body: "קטלוג ספקים עם ביקורות אמיתיות מזוגות שעבדו איתם, ויצירת קשר ישירה בלחיצה.",
  },
  {
    icon: PiggyBank,
    title: "מאזן מעטפות אחרי האירוע",
    body: "מי נתן, כמה, ולמי תצטרכו להחזיר באירוע שלו — כולל הזנה קולית מהירה. בלי דפים מתעופפים.",
  },
];

export function FeatureGrid() {
  return (
    <section className="py-24 md:py-32 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <h2
            className="font-bold gradient-text"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
          >
            כל מה שצריך לאירוע — במערכת אחת
          </h2>
          <p
            className="mt-3 text-lg"
            style={{ color: "var(--foreground-soft)" }}
          >
            ממוזמנים ועד יום האירוע — בלי לקפוץ בין כלים.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="card p-6 md:p-7 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_var(--accent-glow)]"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-100) 15%, transparent)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                }}
                aria-hidden
              >
                <Icon size={19} />
              </div>
              <h3
                className="mt-4 font-bold leading-snug"
                style={{ fontSize: "1.125rem" }}
              >
                {title}
              </h3>
              <p
                className="mt-2 leading-relaxed"
                style={{ color: "var(--foreground-soft)", fontSize: "0.875rem" }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>

        <p
          className="mt-12 text-center mx-auto max-w-2xl leading-relaxed text-sm"
          style={{ color: "var(--foreground-muted)" }}
        >
          ומתאים ל-9 סוגי אירועים — חתונה, חינה, בר/בת מצווה, שבת חתן,
          אירוסין, ברית, יום הולדת ואירוע עסקי. הממשק והתכנים מתאימים את עצמם.
        </p>
      </div>
    </section>
  );
}
