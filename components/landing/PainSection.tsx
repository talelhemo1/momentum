const PAINS = [
  {
    emoji: "🥴",
    title: "כמה מהאורחים בעצם הולכים להגיע?",
    body: "200 שיחות וואצפ, רשימה שמתעדכנת בשלושה מקומות שונים. בסוף אתם לא יודעים אם להזמין 180 מנות או 250 — וזה עולה אלפי שקלים לכל כיוון.",
  },
  {
    emoji: "💸",
    title: "עוד שקל לאוכל — חורגים?",
    body: "הקייטרינג נותן הצעה, האולם מבקש מקדמה נוספת, ה-DJ מתייקר פתאום. האקסל לא מצליח לעקוב, וההפתעות תמיד מגיעות בסוף.",
  },
  {
    emoji: "😩",
    title: "ביום האירוע — איפה הסבתא?",
    body: "המנהל מתקשר, אתם אמורים לרקוד, ולאף אחד אין תמונה מלאה. ההורים מקפצים בין שולחנות במקום ליהנות מהרגע.",
  },
];

/** R42 — the pain. Soft-red cards, then a sharp closing line. */
export function PainSection() {
  return (
    <section className="py-24 md:py-32 relative">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <h2
          className="text-center font-bold gradient-text"
          style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
        >
          מכירים את התחושה הזאת?
        </h2>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PAINS.map((p) => (
            <div
              key={p.title}
              className="rounded-3xl p-7 md:p-8"
              style={{
                background:
                  "linear-gradient(160deg, rgba(239,68,68,0.07), rgba(239,68,68,0.02))",
                border: "1px solid rgba(239,68,68,0.18)",
              }}
            >
              <div className="text-4xl" aria-hidden>
                {p.emoji}
              </div>
              <h3 className="mt-4 text-xl font-bold leading-snug">
                {p.title}
              </h3>
              <p
                className="mt-3 leading-relaxed"
                style={{ color: "var(--foreground-soft)", fontSize: "1.05rem" }}
              >
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <p
          className="mt-14 text-center font-bold mx-auto max-w-2xl leading-relaxed"
          style={{ fontSize: "clamp(1.25rem, 3.5vw, 1.75rem)" }}
        >
          זה לא אתם.{" "}
          <span className="gradient-gold">
            זה המוצרים שזורקים עליכם 12 כלים לעבודה אחת.
          </span>
        </p>
      </div>
    </section>
  );
}
