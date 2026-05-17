import Link from "next/link";
import { Check } from "lucide-react";

const FREE = [
  "50 מוזמנים",
  "אירוע אחד",
  "כל המחשבונים החכמים",
  "RSVP בסיסי",
];
const COUPLE = [
  "מוזמנים ללא הגבלה",
  "AI Co-Pilot ביום האירוע",
  "Momentum Live (מצב חי)",
  "Auto-Report בסוף האירוע",
  "תמיכה ב-WhatsApp",
];
const VENDOR = [
  "Vendor Studio (דף נחיתה משלך)",
  "לידים בזמן אמת",
  "אנליטיקות חיות",
  "ביקורות מאומתות",
  "Auto-quote להצעות מחיר",
];

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check size={17} className="text-[--accent] mt-0.5 shrink-0" />
      <span style={{ color: "var(--foreground-soft)" }}>{children}</span>
    </li>
  );
}

/** R42 — pricing. Launch ₪99 couple (was ₪399) is the visual anchor. */
export function PricingSection() {
  return (
    <section id="pricing" className="py-24 md:py-32 relative">
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[680px] h-[680px] top-0 left-1/2 -translate-x-1/2 opacity-25"
      />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <h2
          className="text-center font-bold gradient-gold"
          style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
        >
          בחרו את המסלול שלכם
        </h2>

        <div className="mt-14 grid gap-5 lg:grid-cols-3 items-stretch">
          {/* Free */}
          <div className="card p-7 md:p-9 flex flex-col">
            <div className="text-sm" style={{ color: "var(--foreground-muted)" }}>
              להתחלה — בחינם תמיד
            </div>
            <div className="mt-3 text-5xl font-extrabold ltr-num">₪0</div>
            <ul className="mt-7 space-y-3 flex-1 text-[15px]">
              {FREE.map((f) => (
                <Li key={f}>{f}</Li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="btn-secondary mt-8 w-full inline-flex items-center justify-center"
              style={{ minHeight: 52 }}
            >
              התחל בחינם
            </Link>
          </div>

          {/* Couple — launch */}
          <div
            className="relative p-7 md:p-9 flex flex-col rounded-3xl lg:scale-[1.04]"
            style={{
              background:
                "linear-gradient(170deg, rgba(212,176,104,0.16), rgba(168,136,74,0.06))",
              border: "1px solid var(--border-gold)",
              boxShadow: "0 24px 60px -24px var(--accent-glow)",
            }}
          >
            <span
              className="absolute -top-3 right-7 rounded-full px-3 py-1 text-xs font-bold"
              style={{
                background:
                  "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                color: "var(--gold-button-text)",
              }}
            >
              🔥 השקה
            </span>
            <div className="text-sm" style={{ color: "var(--accent)" }}>
              לאירוע מושלם — חד-פעמי
            </div>
            <div className="mt-3 flex items-end gap-3">
              <span
                className="font-extrabold gradient-gold ltr-num leading-none"
                style={{ fontSize: "clamp(3rem, 9vw, 3.75rem)" }}
              >
                ₪99
              </span>
              <span
                className="text-xl line-through ltr-num pb-1"
                style={{ color: "var(--foreground-muted)" }}
              >
                ₪399
              </span>
            </div>
            <div
              className="mt-1 text-sm"
              style={{ color: "var(--foreground-soft)" }}
            >
              תשלום אחד. אין מנוי. אין חיובים נוספים.
            </div>
            <ul className="mt-7 space-y-3 flex-1 text-[15px]">
              {COUPLE.map((f) => (
                <Li key={f}>{f}</Li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="btn-gold mt-8 w-full inline-flex items-center justify-center"
              style={{ minHeight: 56, fontSize: "1.05rem" }}
            >
              התחל פיילוט — ₪99
            </Link>
            <div
              className="mt-3 text-center text-xs"
              style={{ color: "var(--accent)" }}
            >
              🎁 מחיר השקה — רק ל-100 הזוגות הראשונים
            </div>
          </div>

          {/* Vendor */}
          <div
            className="p-7 md:p-9 flex flex-col rounded-3xl"
            style={{
              background:
                "linear-gradient(170deg, rgba(168,136,74,0.14), rgba(10,10,11,0.4))",
              border: "1px solid var(--border)",
            }}
          >
            <div className="text-sm" style={{ color: "var(--foreground-muted)" }}>
              לעסקים שרוצים לידים אמיתיים
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-5xl font-extrabold ltr-num">₪199</span>
              <span
                className="pb-1 text-sm"
                style={{ color: "var(--foreground-muted)" }}
              >
                /חודש
              </span>
            </div>
            <ul className="mt-7 space-y-3 flex-1 text-[15px]">
              {VENDOR.map((f) => (
                <Li key={f}>{f}</Li>
              ))}
            </ul>
            <Link
              href="/vendors/join"
              className="btn-secondary mt-8 w-full inline-flex items-center justify-center"
              style={{ minHeight: 52 }}
            >
              הצטרפו כספק
            </Link>
          </div>
        </div>

        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold"
          style={{ color: "var(--foreground-soft)" }}
        >
          <span>✓ ביטול בכל רגע</span>
          <span>✓ החזר מלא 30 יום</span>
          <span>✓ ללא חתימת אשראי לחינם</span>
        </div>
      </div>
    </section>
  );
}
