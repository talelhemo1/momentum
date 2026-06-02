import Link from "next/link";
import { ScrollText } from "lucide-react";

/**
 * R157 — landing-page legal strip. A compact, visible disclaimer block
 * that limits the operator's liability and points to the full Terms +
 * Privacy. Mirrors the protective language in /terms (R155): Momentum is
 * a planning aid only, the user is responsible for their own messaging
 * consent, and AI output is informational — not professional advice.
 *
 * Server component, no client JS.
 */
const POINTS: string[] = [
  "Momentum הוא כלי עזר לתכנון אירועים בלבד. איננו מארגני האירוע, איננו צד לכל התקשרות מול ספק, ואיננו אחראים לאיכות, לזמינות או לתוצאות של אירוע, ספק או שירות כלשהו.",
  "השירות ניתן כמות שהוא (“AS-IS”). איננו מתחייבים לזמינות רציפה, לדיוק נתונים שהוזנו על-ידי המשתמש, או לתפקודם של שירותי צד-ג׳ (WhatsApp, שיחות אוטומטיות, ספקי סליקה ועוד).",
  "שליחת הודעות ושיחות למוזמנים נעשית באחריות המשתמש בלבד ובכפוף לקבלת הסכמת הנמענים כנדרש בדין (לרבות חוק התקשורת — “חוק הספאם”). המשתמש אחראי לתוכן ולעמידה בדיני הפרטיות מול מוזמניו.",
  "המלצות וכלי ה-AI הם אינפורמטיביים בלבד ואינם מהווים ייעוץ מקצועי, משפטי או פיננסי. כל החלטה (בחירת ספק, תקציב, הושבה וכו׳) היא באחריות המשתמש.",
  "שימוש בשירות מהווה הסכמה לתנאי השימוש ולמדיניות הפרטיות המלאים.",
];

export function LegalStrip() {
  return (
    <section className="pb-8 pt-4">
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <div
          className="rounded-2xl p-6 md:p-7"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ScrollText
              size={16}
              style={{ color: "var(--foreground-muted)" }}
              aria-hidden
            />
            <h2
              className="text-sm font-bold"
              style={{ color: "var(--foreground-soft)" }}
            >
              הבהרה משפטית
            </h2>
          </div>

          <ul className="space-y-2.5">
            {POINTS.map((p) => (
              <li
                key={p}
                className="flex gap-2.5 text-xs leading-relaxed"
                style={{ color: "var(--foreground-muted)" }}
              >
                <span
                  aria-hidden
                  className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                  style={{ background: "var(--accent)" }}
                />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <div
            className="mt-5 pt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <Link
              href="/terms"
              className="font-semibold transition hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              תנאי שימוש מלאים →
            </Link>
            <Link
              href="/privacy"
              className="font-semibold transition hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              מדיניות פרטיות →
            </Link>
            <span style={{ color: "var(--foreground-muted)" }}>
              מופעל ע״י טל חמו, עוסק פטור{" "}
              <span className="ltr-num">211477617</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
