import { VENDORS } from "@/lib/vendors";

/**
 * R42 — genuinely honest stats. The spec asked for "280+ ספקים", but
 * R37 deliberately removed 332 seeded/fake vendors and the owner
 * approved honest numbers — re-introducing an inflated count here would
 * directly contradict that. So the vendor figure is the REAL catalog
 * size (dynamic from VENDORS), and it grows on its own as approved
 * vendors come in. The other three are true and stable.
 */
const STATS = [
  {
    value: `${VENDORS.length}+`,
    label: "ספקים מאומתים",
    sub: "גדל מדי יום",
  },
  { value: "9", label: "סוגי אירועים", sub: "חתונה, בר/בת מצווה, ברית ועוד" },
  { value: "5", label: "מחשבונים חכמים", sub: "עלות-לאורח, אלכוהול, AI ועוד" },
  { value: "100%", label: "בעברית", sub: "מכבד RTL ושבת" },
];

export function HonestStats() {
  return (
    <section className="py-24 md:py-28 relative">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <div className="card-gold p-8 md:p-12 text-center">
          <h2
            className="font-bold gradient-gold"
            style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}
          >
            בנינו בארץ, לזוגות בארץ
          </h2>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-4xl md:text-5xl font-extrabold ltr-num gradient-gold tracking-tight">
                  {s.value}
                </div>
                <div
                  className="mt-2 font-semibold text-sm md:text-base"
                  style={{ color: "var(--foreground)" }}
                >
                  {s.label}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          <p
            className="mt-9 text-sm"
            style={{ color: "var(--foreground-soft)" }}
          >
            🚀 פלטפורמת ההשקה — הצטרפו וקבלו השפעה אישית על מה שנבנה
          </p>
        </div>
      </div>
    </section>
  );
}
