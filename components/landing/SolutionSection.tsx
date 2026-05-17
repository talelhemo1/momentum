const SOLUTIONS = [
  {
    emoji: "🎯",
    title: "רשימת מוזמנים שמדברת עם וואצפ",
    body: "הזמנה אישית לכל אורח — 15 שניות לכולם. RSVP אוטומטי בלי שום תוסף. תדעו בזמן אמת מי מגיע, עם כמה אנשים, ואיך לחלק שולחנות.",
  },
  {
    emoji: "💰",
    title: "תקציב חי שלא משקר לכם",
    body: "כל שקל מתועד אוטומטית. כל ספק מסומן עם מקדמה, יתרה וסטטוס. אזהרה אוטומטית 14 ימים לפני חריגה — לא אחרי שכבר חרגתם.",
  },
  {
    emoji: "⭐",
    title: "יום האירוע — בלי מתחים",
    body: "מנהל-משנה (אח, חבר, מארגן) מקבל קישור WhatsApp עם דשבורד חי. הוא עושה צ'ק-אין QR, מטפל בבעיות ומעדכן ספקים. אתם רוקדים.",
  },
];

/** R42 — the solution. Soft-gold cards mirroring the 3 pains. */
export function SolutionSection() {
  return (
    <section className="py-24 md:py-32 relative">
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[520px] h-[520px] top-1/2 -translate-y-1/2 right-0 opacity-20"
      />
      <div className="max-w-5xl mx-auto px-5 sm:px-8 relative z-10">
        <h2
          className="text-center font-bold"
          style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
        >
          <span className="gradient-gold">במקום זה — תהיו במצב הזה</span>
        </h2>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <div
              key={s.title}
              className="card-gold p-7 md:p-9 transition hover:translate-y-[-3px]"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: "rgba(212,176,104,0.12)",
                  border: "1px solid var(--border-gold)",
                }}
                aria-hidden
              >
                {s.emoji}
              </div>
              <h3 className="mt-5 text-xl md:text-2xl font-bold leading-snug">
                {s.title}
              </h3>
              <p
                className="mt-3 leading-relaxed"
                style={{ color: "var(--foreground-soft)", fontSize: "1.05rem" }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
