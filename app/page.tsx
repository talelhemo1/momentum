import Link from "next/link";
import {
  Sparkles,
  CheckCircle2,
  Users,
  Wallet,
  Building2,
  Calendar,
  ArrowLeft,
  Star,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Music,
  Camera,
  GlassWater,
  Video,
  Lock,
  CreditCard,
  Quote,
  Award,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { INSPIRATION_GALLERY } from "@/lib/images";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main className="flex-1 relative">
        <Hero />
        <SocialProof />
        <StatsCounter />
        <InspirationGallery />
        <Journey />
        <CategoryShowcase />
        <FeatureGrid />
        <Testimonials />
        <BudgetTeaser />
        <TrustBadges />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="relative pt-16 pb-24 md:pt-24 md:pb-32 overflow-hidden">
      <div aria-hidden className="glow-orb glow-orb-gold animate w-[900px] h-[900px] -top-60 left-1/2 -translate-x-1/2 float-slow" />
      <div aria-hidden className="glow-orb glow-orb-cool w-[500px] h-[500px] top-40 right-0 float-medium" />
      <div aria-hidden className="glow-orb glow-orb-warm w-[400px] h-[400px] bottom-0 left-0 float-slow" />

      {/* Sparkle decorations */}
      <Sparkle className="absolute top-[18%] right-[8%]" size={6} />
      <Sparkle className="absolute top-[35%] right-[15%] sparkle-2" size={4} />
      <Sparkle className="absolute top-[28%] left-[12%] sparkle-3" size={5} />
      <Sparkle className="absolute top-[55%] left-[6%]" size={4} />
      <Sparkle className="absolute top-[50%] right-[6%] sparkle-2" size={6} />

      <div className="max-w-5xl mx-auto px-5 sm:px-8 text-center relative z-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur px-3.5 py-1.5 text-xs text-white/85 fade-up">
          <Sparkles size={13} className="text-[--accent]" />
          הדרך החכמה לתכנן אירועים
        </div>

        <h1
          className="mt-7 text-5xl md:text-7xl lg:text-[88px] font-extrabold leading-[1.02] tracking-tight fade-up"
          style={{ animationDelay: "0.05s" }}
        >
          <span className="gradient-text block">תכנן את האירוע שלך.</span>
          <span className="gradient-gold block">תחווה את הדרך.</span>
        </h1>

        <p
          className="mt-7 text-lg md:text-xl text-white/65 max-w-2xl mx-auto leading-relaxed fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          מרעיון ראשון ועד האורח האחרון — כל מה שאתה צריך, במקום אחד.
          חוויה מעוצבת, מדויקת ויוקרתית.
        </p>

        <div
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 fade-up"
          style={{ animationDelay: "0.15s" }}
        >
          <Link href="/signup" className="btn-gold inline-flex items-center gap-2">
            התחל את המסע
            <ArrowLeft size={18} />
          </Link>
          <Link href="#journey" className="btn-secondary">
            איך זה עובד
          </Link>
        </div>

        {/* R14 — secondary vendor-side entry. The main CTA above targets
            couples; this is a quieter line for vendors who hear about us
            from a couple and want to find the dashboard. Clicking goes
            to /vendors/dashboard, which auto-redirects to /signup with
            returnTo if the user isn't authenticated yet. */}
        <div
          className="mt-5 flex items-center justify-center fade-up text-sm"
          style={{ animationDelay: "0.25s", color: "var(--foreground-muted)" }}
        >
          <span>ספק?</span>
          <Link
            href="/vendors/dashboard"
            className="ms-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition hover:translate-y-[-1px]"
            style={{
              background:
                "linear-gradient(135deg, rgba(244,222,169,0.12), rgba(168,136,74,0.06))",
              border: "1px solid var(--border-gold)",
              color: "var(--accent)",
            }}
          >
            <Building2 size={14} aria-hidden />
            כניסה לדשבורד הספקים
            <ArrowLeft size={14} aria-hidden />
          </Link>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

// (Removed unused `HeroPolaroids` decorative component — it was defined but
// never rendered. If we want to restore it later, the design lives in git.)

function Sparkle({ className = "", size = 4 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={`sparkle pointer-events-none ${className}`}
      style={{
        width: `${size * 2}px`,
        height: `${size * 2}px`,
        background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
        borderRadius: "50%",
        boxShadow: `0 0 ${size * 4}px var(--accent-glow)`,
        display: "block",
      }}
    />
  );
}

function HeroPreview() {
  return (
    <div className="mt-20 md:mt-24 relative fade-up" style={{ animationDelay: "0.2s" }}>
      <div className="card-gold p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-1.5 pb-3.5 border-b border-white/[0.06]">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="ms-auto text-xs text-white/35 font-mono">momentum.app/dashboard</span>
        </div>
        <div className="grid md:grid-cols-3 gap-3.5 mt-5 stagger">
          <PreviewStat label="התקדמות במסע" value="68%" sub="3 מתוך 5 שלבים" />
          <PreviewStat label="אישרו הגעה" value="142" sub="מתוך 187 מוזמנים" highlight />
          <PreviewStat label="תקציב צפוי" value="₪148K" sub="חיסכון של 12%" />
        </div>
        <div className="mt-4 grid md:grid-cols-2 gap-3.5">
          <PreviewMini icon={<Users size={16} />} title="הזמנה נשלחה לדנה כהן" sub="לפני 2 דקות" />
          <PreviewMini icon={<Building2 size={16} />} title="אולם הכוכב — נוסף לרשימה" sub="לפני 5 דקות" />
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border ${highlight ? "border-[var(--border-gold)] bg-gradient-to-b from-[rgba(212,176,104,0.08)] to-transparent" : "border-white/[0.06] bg-white/[0.02]"} p-4`}>
      <div className="text-xs text-white/50">{label}</div>
      <div className={`text-3xl font-bold mt-1.5 ${highlight ? "gradient-gold" : ""} ltr-num`}>{value}</div>
      <div className="text-xs text-white/40 mt-1">{sub}</div>
    </div>
  );
}

function PreviewMini({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.06] flex items-center justify-center text-[--accent]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm truncate">{title}</div>
        <div className="text-xs text-white/40 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function SocialProof() {
  return (
    <section className="py-12 border-y border-white/[0.05] relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-white/45 text-sm">
          <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-[--accent]" />ספקים בקטלוג</span>
          {/* R18 §S — removed fabricated "4.9 ממשתמשים" rating; replaced
              with a truthful capability claim until real reviews exist. */}
          <span className="flex items-center gap-2"><Star size={16} className="text-[--accent]" />ביקורות אמת מזוגות</span>
          <span className="flex items-center gap-2"><MessageCircle size={16} className="text-[--accent]" />שילוב WhatsApp מובנה</span>
          <span className="flex items-center gap-2"><Smartphone size={16} className="text-[--accent]" />עובד גם במובייל</span>
        </div>
      </div>
    </section>
  );
}

function Journey() {
  // R14: shrunk from 5 numbered steps to 3 big phases. The numbered list
  // promised structure that didn't match the in-app journey (which has 7+
  // unlock conditions); the new 3-step view honestly previews the high-level
  // arc without committing us to a specific step count.
  const steps = [
    { icon: "🎯", title: "הגדר את האירוע", desc: "סוג, תאריך, אורחים, תקציב — מסלול אישי בונה את עצמו." },
    { icon: "📨", title: "הזמן ועקוב אחרי אורחים", desc: "הזמנה בוואצאפ, RSVP חי, וסידור הושבה חכם." },
    { icon: "🎉", title: "חגוג בקלות", desc: "Memory Album, Find My Table, ויום אירוע מסונכרן." },
  ];
  return (
    <section id="journey" className="py-28 md:py-36 relative">
      <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] top-1/2 -translate-y-1/2 right-0 opacity-30" />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto">
          <span className="eyebrow">המסע</span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold tracking-tight">
            <span className="gradient-text">המסע האישי שלך.</span>
          </h2>
          <p className="mt-5 text-white/55 text-lg leading-relaxed">
            כל אירוע הוא שונה — ולכן גם הדרך שלך. Momentum בונה לך מסלול שלב-אחר-שלב,
            ורק כשאתה מתקדם — הבא נפתח.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3 stagger">
          {steps.map((s) => (
            <div key={s.title} className="card card-hover p-7">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                style={{
                  background: "rgba(212,176,104,0.10)",
                  border: "1px solid var(--border-gold)",
                }}
                aria-hidden
              >
                {s.icon}
              </div>
              <h3 className="text-lg md:text-xl font-semibold mt-5">{s.title}</h3>
              <p className="text-sm text-white/55 mt-2 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryShowcase() {
  const categories = [
    { icon: <Building2 size={24} />, label: "אולמות וגנים", count: "24+" },
    { icon: <Camera size={24} />, label: "צלמים", count: "22+" },
    { icon: <Music size={24} />, label: "תקליטנים", count: "22+" },
    { icon: <Video size={24} />, label: "סושיאל ורילז", count: "22+" },
    { icon: <GlassWater size={24} />, label: "ברים ואלכוהול", count: "22+" },
  ];
  return (
    <section className="py-28 md:py-36 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="eyebrow">ספקים</span>
            <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
              כל הספקים מהאזור שלך.
              <br />
              <span className="gradient-gold">במקום אחד.</span>
            </h2>
            <p className="mt-5 text-white/60 text-lg leading-relaxed">
              למעלה מ-100 ספקים בקטלוג — אולמות, צלמים, תקליטנים, סושיאל וברים.
              מסונן לפי המיקום והתקציב שלך, עם דירוגים אמיתיים והשוואת מחירים.
            </p>
            <div className="mt-7">
              <Link href="/vendors" className="btn-secondary inline-flex items-center gap-2">
                לצפייה בספקים
                <ArrowLeft size={16} />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 stagger">
            {categories.map((c, i) => (
              <div
                key={c.label}
                className={`card card-hover p-5 ${i === 0 ? "col-span-2" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F4DEA9]/20 to-[#A8884A]/10 border border-[var(--border-gold)] flex items-center justify-center text-[--accent]">
                    {c.icon}
                  </div>
                  <div>
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-sm text-white/50 mt-0.5">
                      <span className="ltr-num">{c.count}</span> ספקים
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section className="py-28 md:py-36 relative">
      <div aria-hidden className="glow-orb glow-orb-gold w-[500px] h-[500px] top-1/2 -translate-y-1/2 left-0 opacity-30" />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto">
          <span className="eyebrow">פיצ׳רים</span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold tracking-tight">
            <span className="gradient-text">כל מה שאתה צריך.</span>
            <br />
            <span className="gradient-cool">בלי כאב ראש.</span>
          </h2>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3 stagger">
          <FeatureCard icon={<CheckCircle2 size={22} />} title="צ׳קליסט חכם" desc="משימות שמתעדכנות אוטומטית לפי כמה זמן נשאר לאירוע." />
          <FeatureCard icon={<Building2 size={22} />} title="ספקים באזור שלך" desc="חיפוש מהיר, השוואת מחירים, ביקורות אמיתיות." />
          <FeatureCard icon={<Users size={22} />} title="ניהול מוזמנים" desc="רשימה דיגיטלית, הזמנות בוואטסאפ, RSVP בזמן אמת." />
          <FeatureCard icon={<Wallet size={22} />} title="תקציב חי" desc="כל שקל מתועד. תחזית עלות סופית מדויקת." />
          <FeatureCard icon={<Calendar size={22} />} title="לוח זמנים" desc="תזכורות חכמות שלא מאפשרות לך לשכוח." />
          <FeatureCard icon={<ShieldCheck size={22} />} title="ספקים בקטלוג" desc="ספקים שאיתרנו עבורך, עם פרטי קשר וקישורים." />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card card-hover p-7 group">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center text-[--accent] group-hover:border-[var(--border-gold)] transition">
        {icon}
      </div>
      <h3 className="mt-6 text-xl font-semibold">{title}</h3>
      <p className="mt-2.5 text-white/55 leading-relaxed">{desc}</p>
    </div>
  );
}

function BudgetTeaser() {
  return (
    <section className="py-28 md:py-36 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid md:grid-cols-2 gap-14 items-center relative z-10">
        <div className="card-gold p-8 md:p-9 order-last md:order-first">
          <div className="flex items-baseline justify-between">
            <span className="text-white/60 text-sm">תקציב נוכחי</span>
            <span className="text-3xl md:text-4xl font-bold ltr-num gradient-gold">₪148,200</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full w-[72%] bg-gradient-to-r from-[#A8884A] to-[#F4DEA9]" />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/50">
            <span>72% שולמו</span>
            <span className="ltr-num">מתוך ₪205,000</span>
          </div>

          <div className="mt-7 space-y-3.5">
            <BudgetRow label="אולם" value="₪68,000" pct={92} />
            <BudgetRow label="צילום" value="₪14,500" pct={100} />
            <BudgetRow label="DJ" value="₪9,800" pct={50} />
            <BudgetRow label="פרחים" value="₪7,200" pct={30} />
          </div>
        </div>
        <div>
          <span className="eyebrow">תקציב</span>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
            <span className="gradient-text">תדע בדיוק כמה</span>
            <br />
            <span className="gradient-gold">זה יעלה לך.</span>
          </h2>
          <p className="mt-5 text-white/60 text-lg leading-relaxed">
            האירוע שלך בלי הפתעות. Momentum מחשבת את העלות הכוללת בזמן אמת,
            ומתריעה לפני שאתה חורג.
          </p>
          <ul className="mt-7 space-y-3.5 text-white/75">
            <Bullet>מעקב הוצאות מדויק</Bullet>
            <Bullet>חלוקה לקטגוריות וספקים</Bullet>
            <Bullet>תחזית עלות סופית</Bullet>
            <Bullet>המלצות חכמות לחיסכון</Bullet>
          </ul>
        </div>
      </div>
    </section>
  );
}

function BudgetRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-white/70">{label}</span>
        <span className="font-semibold ltr-num">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div className="h-full bg-gradient-to-r from-white/20 to-white/40" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle2 size={18} className="text-[--accent] mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function CTA() {
  return (
    <section className="py-28 md:py-40 relative">
      <div aria-hidden className="glow-orb glow-orb-gold w-[800px] h-[800px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center relative z-10">
        <h2 className="text-4xl md:text-7xl font-extrabold tracking-tight leading-[1.05]">
          <span className="gradient-text">האירוע שלך</span>
          <br />
          <span className="gradient-gold">מתחיל כאן.</span>
        </h2>
        <p className="mt-7 text-white/60 text-lg md:text-xl leading-relaxed">
          אל תבזבז זמן על כאב ראש. תן ל-Momentum ללוות אותך — ולבנות את האירוע שתמיד רצית.
        </p>
        {/* R14: single CTA. The previous "דלג למסע" sent anonymous visitors
            straight to /dashboard, where a redirect chain bounced them back —
            confusing and wasteful. One button, one destination. */}
        <div className="mt-11 flex justify-center">
          <Link href="/signup" className="btn-gold inline-flex items-center gap-2">
            התחל בחינם
            <ArrowLeft size={18} />
          </Link>
        </div>
        <div className="mt-6 text-xs flex items-center justify-center gap-4" style={{ color: "var(--foreground-muted)" }}>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[--accent]" />ללא תשלום להתחלה</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[--accent]" />ללא הזנת פרטי תשלום</span>
        </div>

        {/* R14 — vendor secondary entry, mirrors the one in the hero. */}
        <div
          className="mt-8 pt-5 border-t inline-block px-6 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}
        >
          ספק שירותים?{" "}
          <Link
            href="/vendors/dashboard"
            className="font-semibold inline-flex items-center gap-1"
            style={{ color: "var(--accent)" }}
          >
            <Building2 size={12} aria-hidden />
            כניסה לדשבורד הספקים
          </Link>
        </div>
      </div>
    </section>
  );
}

function InspirationGallery() {
  return (
    <section className="py-20 md:py-28 relative">
      <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] top-1/2 -translate-y-1/2 right-0 opacity-25" />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto">
          <span className="eyebrow">השראה</span>
          <h2 className="mt-3 text-4xl md:text-6xl font-bold tracking-tight">
            <span className="gradient-text">אירועים אמיתיים.</span>
            <br />
            <span className="gradient-gold">השראה אינסופית.</span>
          </h2>
          <p className="mt-4 leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
            נסיים את האירוע — ולא תזהה אותו. הצצה לחתונות, בר-מצוות וברית מילה שתוכננו עם Momentum.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 grid-flow-dense gap-4">
          {INSPIRATION_GALLERY.map((img, i) => {
            const span =
              img.span === "wide"
                ? "md:col-span-2"
                : img.span === "tall"
                  ? "md:row-span-2"
                  : "";
            return (
              <div key={i} className={`gallery-card ${span} aspect-square ${img.span === "tall" ? "md:aspect-[3/4]" : ""} ${img.span === "wide" ? "md:aspect-[2/1]" : ""}`}>
                <img src={img.src} alt={img.label} loading="lazy" />
                <div className="caption">{img.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsCounter() {
  // R18 §S — honest social proof. We're at launch: the old "4,872
  // events planned" and "4.9★ from 2,341 reviews" were fabricated.
  // Replaced with a launch message + only metrics we can actually
  // stand behind (catalog size is real; the saving is an explicitly
  // labelled model estimate, not a measured claim).
  return (
    <section className="py-16 md:py-20 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="card-gold p-8 md:p-12 text-center">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full mb-5" style={{ background: "rgba(212,176,104,0.12)", border: "1px solid var(--border-gold)", color: "var(--accent)" }}>
            <Sparkles size={12} aria-hidden /> השקה
          </div>
          <h2 className="text-xl md:text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            אנחנו בונים את Momentum יחד עם הזוגות הראשונים
          </h2>
          <p className="mt-2 text-sm max-w-xl mx-auto" style={{ color: "var(--foreground-soft)" }}>
            הצטרפו עכשיו והשפיעו על מה שנבנה — בלי מספרים מנופחים, רק כלים אמיתיים.
          </p>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-4">
            <Stat value="100+" label="ספקים בקטלוג" sub="בכל אזור בארץ" />
            <Stat value="₪38M" label="חיסכון משוער" sub="לפי מודל התקצוב שלנו" />
            <Stat value="9" label="סוגי אירועים" sub="חתונה, בר/בת מצווה, ברית ועוד" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div>
      <div className="text-4xl md:text-5xl font-extrabold ltr-num gradient-gold tracking-tight">{value}</div>
      <div className="mt-2 font-semibold text-sm md:text-base" style={{ color: "var(--foreground)" }}>{label}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--foreground-muted)" }}>{sub}</div>
    </div>
  );
}

function Testimonials() {
  return (
    <section className="py-28 md:py-32 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto">
          <span className="eyebrow">סיפורי הצלחה</span>
          <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
            <span className="gradient-text">הם בנו את האירוע</span>
            <br />
            <span className="gradient-gold">שתמיד חלמו עליו.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 stagger">
          <Testimonial
            initials="ע"
            name="ענת ועומר"
            event="חתונה · תל אביב"
            saved="₪32,400"
            quote="בחיים לא הצלחנו לדמיין שיהיה כל כך פשוט. סגרנו אולם ושני ספקים בשבוע ראשון. החיסכון שלנו הוא הירח דבש שלנו."
          />
          <Testimonial
            initials="ש"
            name="שירה ואיציק"
            event="בר מצווה · ירושלים"
            saved="₪14,800"
            quote="הצ׳קליסט החכם הציל אותנו. כל פעם שחשבנו ששכחנו משהו, האפליקציה כבר תזכרה לנו יומיים קודם."
          />
          <Testimonial
            initials="ר"
            name="רעות ויובל"
            event="ברית · חיפה"
            saved="₪8,200"
            quote="התחלנו עם תקציב צמוד. Momentum מצאה לנו מוהל מצוין וקייטרינג שלא יצא מהתקציב. שווה כל שקל."
          />
        </div>
      </div>
    </section>
  );
}

function Testimonial({ initials, name, event, saved, quote }: { initials: string; name: string; event: string; saved: string; quote: string }) {
  return (
    <div className="card card-hover p-7 flex flex-col">
      <Quote size={28} className="text-[--accent] opacity-40" />
      <p className="mt-4 text-base leading-relaxed flex-1" style={{ color: "var(--foreground-soft)" }}>
        &ldquo;{quote}&rdquo;
      </p>
      <div className="mt-6 pt-5 border-t flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold"
          style={{ background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))", color: "var(--gold-button-text)" }}
        >
          {initials}
        </div>
        <div className="flex-1">
          <div className="font-semibold">{name}</div>
          <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>{event}</div>
        </div>
        <div className="text-end">
          <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>חסכו</div>
          <div className="font-bold gradient-gold ltr-num">{saved}</div>
        </div>
      </div>
    </div>
  );
}

function TrustBadges() {
  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Badge icon={<Lock size={20} />} title="הגנה על פרטיות" sub="הצפנה ברמה בנקאית" />
          <Badge icon={<ShieldCheck size={20} />} title="ספקים בקטלוג" sub="פרטים מסודרים, מוכנים ליצירת קשר" />
          <Badge icon={<CreditCard size={20} />} title="ללא חיוב כרטיס" sub="חינם עד שתבחר לשדרג" />
          <Badge icon={<Award size={20} />} title="ביטוח ביטולים" sub="הגנה אם ספק מבטל" />
        </div>
      </div>
    </section>
  );
}

function Badge({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="card p-5 flex items-center gap-3">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-gold)", color: "var(--accent)" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs truncate" style={{ color: "var(--foreground-muted)" }}>{sub}</div>
      </div>
    </div>
  );
}
