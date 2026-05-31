import type { ReactNode } from "react";

/**
 * R48 — "see how it looks". Three CSS-only phone mockups (dashboard /
 * guests / Momentum-Live), a notch, a gold edge-reflection and a soft
 * dotted-gold backdrop. Six callouts with a subtle SVG connector motif.
 *
 * Server component, no assets, no client JS. The three screens sit in a
 * responsive row (carousel-like: focal screen centered & raised on
 * desktop, stacked on mobile) rather than a JS carousel — keeps it
 * zero-JS and robust at every width.
 */
export function AppShowcase() {
  return (
    <section id="showcase" className="py-24 md:py-32 relative overflow-hidden">
      {/* dotted-gold backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(212,176,104,0.10) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 75%)",
        }}
      />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="text-center">
          <h2
            className="font-bold gradient-text"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)" }}
          >
            תראו איך זה נראה
          </h2>
          <p className="mt-3 text-lg" style={{ color: "var(--foreground-soft)" }}>
            שלושה מסכים. תכנון, אורחים, ויום האירוע — במקום אחד.
          </p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-3 items-center justify-items-center">
          <Phone label="דשבורד">
            <DashboardScreen />
          </Phone>
          <Phone focal label="רשימת מוזמנים">
            <GuestsScreen />
          </Phone>
          <Phone label="Momentum Live">
            <LiveScreen />
          </Phone>
        </div>

        {/* Six callouts with a connector motif. */}
        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          <Callout>ספירה לאחור חיה</Callout>
          <Callout>תקציב שמתעדכן לבד</Callout>
          <Callout>AI שמתריע על חריגה</Callout>
          <Callout>אישורי הגעה ב-WhatsApp ובשיחה</Callout>
          <Callout>שליחת מספרי שולחן לאורחים</Callout>
          <Callout>צ׳ק-אין אורחים בלחיצה</Callout>
        </div>
      </div>
    </section>
  );
}

/* ── Phone shell ──────────────────────────────────────────────────── */
function Phone({
  children,
  label,
  focal = false,
}: {
  children: ReactNode;
  label: string;
  focal?: boolean;
}) {
  return (
    <div
      className={`relative ${focal ? "lg:scale-[1.06] lg:-translate-y-2" : "lg:opacity-95"}`}
    >
      <div
        className="relative mx-auto rounded-[2.75rem] p-3"
        style={{
          width: 286,
          background: "linear-gradient(180deg,#1A1410,#07060A)",
          border: "1px solid var(--border-gold)",
          boxShadow: focal
            ? "0 50px 110px -30px var(--accent-glow)"
            : "0 36px 80px -34px var(--accent-glow)",
        }}
      >
        {/* gold edge-reflection */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-[2.75rem] pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(244,222,169,0.18), transparent 35%, transparent 70%, rgba(244,222,169,0.10))",
          }}
        />
        {/* notch */}
        <div
          aria-hidden
          className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-5 rounded-b-2xl z-10"
          style={{ background: "#07060A" }}
        />
        <div
          className="relative rounded-[2.1rem] overflow-hidden"
          style={{ background: "#0A0A0B", border: "1px solid var(--border)" }}
        >
          {children}
          {/* bottom nav */}
          <div
            className="flex items-center justify-around px-5 py-3"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--input-bg)",
            }}
            aria-hidden
          >
            {["●", "○", "○", "○"].map((d, i) => (
              <span
                key={i}
                className="text-[10px]"
                style={{
                  color: i === 0 ? "var(--accent)" : "var(--foreground-muted)",
                }}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div
        className="mt-4 text-center text-xs font-semibold"
        style={{ color: "var(--foreground-muted)" }}
      >
        {label}
      </div>
    </div>
  );
}

/* ── Screen 1 — Dashboard ─────────────────────────────────────────── */
function DashboardScreen() {
  return (
    <div className="pt-8">
      <div
        className="px-4 pb-5 text-center"
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
        <div className="mt-1 text-lg font-extrabold gradient-gold">
          דנה &amp; יואב
        </div>
        <div className="mt-3 text-5xl font-extrabold gradient-gold ltr-num leading-none">
          72
        </div>
        <div className="text-[10px]" style={{ color: "var(--foreground-soft)" }}>
          ימים לאירוע
        </div>
      </div>
      <div className="p-3 space-y-2">
        {[
          ["✓ אישרו הגעה", "142 / 200"],
          ["💰 תקציב", "₪148K · 72%"],
          ["⚡ AI", "חריגה בעוד 12 ימים"],
          ["📅 הבא בתור", "טעימות קייטרינג"],
        ].map(([a, b]) => (
          <Row key={a} a={a} b={b} />
        ))}
      </div>
    </div>
  );
}

/* ── Screen 2 — Guests ────────────────────────────────────────────── */
function GuestsScreen() {
  const guests: Array<[string, string, string]> = [
    ["נועה לוי", "אישרה · 2", "var(--accent)"],
    ["איתי כהן", "אישר · 4", "var(--accent)"],
    ["שיר אזולאי", "טנטטיב", "var(--foreground-muted)"],
    ["רון מזרחי", "לא מגיע", "var(--foreground-muted)"],
    ["מאיה פרץ", "אישרה · 1", "var(--accent)"],
  ];
  return (
    <div className="pt-9 px-3 pb-1">
      <div
        className="rounded-xl px-3 py-2 text-[11px] mb-2"
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--border)",
          color: "var(--foreground-muted)",
        }}
      >
        🔍 חיפוש מוזמן…
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {["כולם", "אישרו", "לא", "נשלח"].map((c, i) => (
          <span
            key={c}
            className="text-[10px] rounded-full px-2.5 py-1"
            style={{
              background:
                i === 0
                  ? "color-mix(in srgb, var(--gold-100) 16%, transparent)"
                  : "var(--input-bg)",
              border: `1px solid ${i === 0 ? "var(--border-gold)" : "var(--border)"}`,
              color: i === 0 ? "var(--accent)" : "var(--foreground-muted)",
            }}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {guests.map(([name, status, color]) => (
          <div
            key={name}
            className="rounded-xl px-3 py-2 flex items-center gap-2.5"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="w-6 h-6 rounded-full shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
              }}
              aria-hidden
            />
            <span className="text-[11px] font-semibold flex-1 truncate">
              {name}
            </span>
            <span className="text-[10px] ltr-num" style={{ color }}>
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Screen 3 — Momentum Live ─────────────────────────────────────── */
function LiveScreen() {
  const alerts: Array<[string, string]> = [
    ["🟢", "רחבת ריקודים מוכנה"],
    ["🟠", "קייטרינג מאחר ב-15 דק׳"],
    ["🔴", "שולחן 7 — אורח לא הגיע"],
  ];
  return (
    <div className="pt-9 px-3 pb-1">
      <div
        className="rounded-xl p-3 text-center mb-2"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(212,176,104,0.18), transparent 60%)",
          border: "1px solid var(--border-gold)",
        }}
      >
        <div className="text-2xl" aria-hidden>
          💓
        </div>
        <div
          className="text-[10px] mt-1"
          style={{ color: "var(--foreground-soft)" }}
        >
          האירוע חי · 19:42
        </div>
      </div>
      <div className="space-y-1.5">
        {alerts.map(([dot, text]) => (
          <div
            key={text}
            className="rounded-xl px-3 py-2 flex items-center gap-2 text-[11px]"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
            }}
          >
            <span aria-hidden>{dot}</span>
            <span style={{ color: "var(--foreground-soft)" }}>{text}</span>
          </div>
        ))}
      </div>
      <div
        className="mt-2 rounded-xl py-2.5 text-center text-[11px] font-bold"
        style={{
          background:
            "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
          color: "var(--gold-button-text)",
        }}
      >
        ✓ צ׳ק-אין אורחים בלחיצה
      </div>
    </div>
  );
}

function Row({ a, b }: { a: string; b: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2 flex items-center justify-between text-[11px]"
      style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
    >
      <span style={{ color: "var(--foreground-soft)" }}>{a}</span>
      <span className="font-bold ltr-num">{b}</span>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold"
      style={{
        background: "rgba(212,176,104,0.10)",
        border: "1px solid var(--border-gold)",
        color: "var(--accent)",
      }}
    >
      {/* subtle SVG connector motif */}
      <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden className="shrink-0">
        <path
          d="M1 5 H11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle cx="15" cy="5" r="2.5" fill="currentColor" />
      </svg>
      {children}
    </div>
  );
}
