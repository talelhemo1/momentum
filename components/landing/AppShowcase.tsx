/**
 * R42 — "see how it looks". A CSS-only phone mock of the dashboard
 * (no screenshot asset needed) with three pointer callouts.
 */
export function AppShowcase() {
  return (
    <section id="showcase" className="py-24 md:py-32 relative">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <h2
            className="font-bold gradient-text"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
          >
            תראו איך זה נראה
          </h2>
          <p
            className="mt-3 text-lg"
            style={{ color: "var(--foreground-soft)" }}
          >
            ממש לפני שאתם נכנסים
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-[1fr_auto_1fr] items-center gap-8">
          {/* Left callouts (desktop) */}
          <ul className="hidden md:flex flex-col gap-6 text-end">
            <Callout>↗️ ספירה לאחור חיה</Callout>
            <Callout>↗️ אישורי הגעה בזמן אמת</Callout>
          </ul>

          {/* Phone */}
          <div
            className="mx-auto rounded-[2.5rem] p-3"
            style={{
              width: 268,
              background: "linear-gradient(180deg,#1A1410,#07060A)",
              border: "1px solid var(--border-gold)",
              boxShadow: "0 40px 90px -30px var(--accent-glow)",
            }}
          >
            <div
              className="rounded-[2rem] overflow-hidden"
              style={{ background: "#0A0A0B", border: "1px solid var(--border)" }}
            >
              <div
                className="px-4 pt-5 pb-6 text-center"
                style={{
                  background:
                    "radial-gradient(120% 70% at 50% -10%, rgba(212,176,104,0.22), transparent 60%)",
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: "var(--foreground-muted)" }}
                >
                  💍 חתונה
                </div>
                <div className="mt-2 text-xl font-extrabold gradient-gold">
                  דנה &amp; יואב
                </div>
                <div
                  className="text-[10px] mt-1"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  יום שלישי, 14 במאי 2026
                </div>
                <div className="mt-4 text-5xl font-extrabold gradient-gold ltr-num leading-none">
                  72
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  ימים לאירוע
                </div>
              </div>
              <div className="p-3 space-y-2">
                {[
                  ["✓ אישרו הגעה", "142 / 200"],
                  ["💰 תקציב", "₪148K · 72%"],
                  ["⚡ AI", "שימו לב: חריגה בעוד 12 ימים"],
                ].map(([a, b]) => (
                  <div
                    key={a}
                    className="rounded-xl px-3 py-2 flex items-center justify-between text-[11px]"
                    style={{
                      background: "var(--input-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ color: "var(--foreground-soft)" }}>{a}</span>
                    <span className="font-bold ltr-num">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right callout (desktop) */}
          <ul className="hidden md:flex flex-col gap-6">
            <Callout>↗️ AI שמתריע על חריגה</Callout>
          </ul>
        </div>

        {/* Mobile callouts */}
        <div className="md:hidden mt-8 flex flex-wrap justify-center gap-2">
          <Callout>ספירה לאחור חיה</Callout>
          <Callout>אישורי הגעה בזמן אמת</Callout>
          <Callout>AI שמתריע על חריגה</Callout>
        </div>
      </div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <li
      className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold"
      style={{
        background: "rgba(212,176,104,0.10)",
        border: "1px solid var(--border-gold)",
        color: "var(--accent)",
      }}
    >
      {children}
    </li>
  );
}
