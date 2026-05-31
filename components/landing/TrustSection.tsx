import { Shield, Server, Heart, type LucideIcon } from "lucide-react";

/**
 * R151 — trust, framed honestly. Every claim here is literally true of
 * the product: HTTPS + Supabase Row-Level-Security, the real stack, and
 * direct human support. Removed the previous unverifiable claims
 * (AES-256 / "full GDPR" / "13 audits" / "24-7, 4-hour SLA") to avoid
 * implying certifications or service levels we don't formally guarantee.
 * Server component, CSS-only.
 */
const PILLARS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Shield,
    title: "הפרטיות שלכם, קודם",
    body: "חיבור מוצפן (HTTPS) והרשאות גישה לכל שורת מידע. הנתונים שלכם נשארים שלכם — לא נמכרים ולא משותפים.",
  },
  {
    icon: Server,
    title: "נבנה על תשתית מודרנית",
    body: "Supabase, Vercel ו-Twilio — אותן תשתיות ענן שמאחורי מוצרים מובילים בעולם. מהיר, יציב וזמין.",
  },
  {
    icon: Heart,
    title: "תמיכה אנושית",
    body: "וואטסאפ ישיר עם הצוות שמאחורי המוצר, וליווי אישי לאורך הדרך — מההגדרה הראשונה ועד יום האירוע.",
  },
];

export function TrustSection() {
  return (
    <section className="py-24 md:py-32 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <h2
          className="text-center font-bold gradient-text"
          style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
        >
          תשתית רצינית. חוויה יוקרתית.
        </h2>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="card-gold p-7 md:p-8 transition duration-200 hover:-translate-y-0.5"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background:
                    "color-mix(in srgb, var(--gold-100) 14%, transparent)",
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                }}
                aria-hidden
              >
                <Icon size={22} />
              </div>
              <h3 className="mt-5 text-xl font-bold leading-snug">{title}</h3>
              <p
                className="mt-3 leading-relaxed"
                style={{ color: "var(--foreground-soft)", fontSize: "1.02rem" }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
