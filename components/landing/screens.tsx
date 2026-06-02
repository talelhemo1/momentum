import type { ReactNode } from "react";

/**
 * R157 — shared demo "phone" + a screen per app surface.
 *
 * Pure presentational, zero client JS — every screen is plain markup
 * styled with the gold-on-dark tokens so the landing can show a
 * faithful preview of each page in the product before the visitor
 * signs up. Consumed by both <HowItWorks> (animated journey) and
 * <AppShowcase> (the screen-by-screen gallery).
 */

/* ── Phone shell ──────────────────────────────────────────────────── */
export function PhoneFrame({
  children,
  width = 286,
  glow = "soft",
  activeNav = 0,
  showNav = true,
}: {
  children: ReactNode;
  width?: number;
  glow?: "soft" | "strong";
  activeNav?: number;
  showNav?: boolean;
}) {
  return (
    <div
      className="relative mx-auto rounded-[2.6rem] p-3"
      style={{
        width: "100%",
        maxWidth: width,
        background: "linear-gradient(180deg,#1A1410,#07060A)",
        border: "1px solid var(--border-gold)",
        boxShadow:
          glow === "strong"
            ? "0 50px 110px -30px var(--accent-glow)"
            : "0 32px 70px -34px var(--accent-glow)",
      }}
    >
      {/* gold edge-reflection */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[2.6rem] pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(244,222,169,0.18), transparent 35%, transparent 70%, rgba(244,222,169,0.10))",
        }}
      />
      {/* notch */}
      <div
        aria-hidden
        className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 rounded-b-2xl z-10"
        style={{ background: "#07060A" }}
      />
      <div
        className="relative rounded-[2rem] overflow-hidden flex flex-col"
        style={{ background: "#0A0A0B", border: "1px solid var(--border)" }}
      >
        <div className="min-h-[392px] flex-1">{children}</div>
        {showNav && (
          <div
            className="flex items-center justify-around px-5 py-2.5"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--input-bg)",
            }}
            aria-hidden
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="text-[10px] transition-colors duration-500"
                style={{
                  color:
                    i === activeNav
                      ? "var(--accent)"
                      : "var(--foreground-muted)",
                }}
              >
                {i === activeNav ? "●" : "○"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── shared atoms ─────────────────────────────────────────────────── */
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

function Bar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden"
      style={{ background: "var(--border)" }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background:
            "linear-gradient(90deg, var(--gold-100), var(--gold-500))",
        }}
      />
    </div>
  );
}

/* ── 1 · Dashboard ────────────────────────────────────────────────── */
export function DashboardScreen() {
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
        <div className="mt-2 text-5xl font-extrabold gradient-gold ltr-num leading-none">
          72
        </div>
        <div className="text-[10px]" style={{ color: "var(--foreground-soft)" }}>
          ימים לאירוע
        </div>
      </div>
      <div className="p-3 space-y-2">
        <Row a="✓ אישרו הגעה" b="142 / 200" />
        <Row a="💰 תקציב" b="₪148K · 72%" />
        <Row a="⚡ AI" b="חריגה בעוד 12 ימים" />
        <Row a="📅 הבא בתור" b="טעימות קייטרינג" />
      </div>
    </div>
  );
}

/* ── 2 · Guests ───────────────────────────────────────────────────── */
export function GuestsScreen() {
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
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
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

/* ── 3 · RSVP (WhatsApp + auto-call) ──────────────────────────────── */
export function RsvpScreen() {
  return (
    <div className="pt-9 px-3 pb-1 space-y-2">
      {/* WhatsApp-style invite bubble */}
      <div
        className="rounded-2xl rounded-tr-sm px-3 py-2.5"
        style={{
          background: "color-mix(in srgb, #25D366 12%, var(--input-bg))",
          border: "1px solid color-mix(in srgb, #25D366 30%, transparent)",
        }}
      >
        <div className="text-[11px] leading-relaxed">
          הוזמנתם לחתונה של <b>דנה &amp; יואב</b> 💍
        </div>
        <div
          className="mt-2 rounded-lg py-1.5 text-center text-[10px] font-bold"
          style={{
            background:
              "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
            color: "var(--gold-button-text)",
          }}
        >
          אישור הגעה →
        </div>
      </div>

      {/* Auto-call card */}
      <div
        className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--border-gold)",
        }}
      >
        <span className="text-base" aria-hidden>
          📞
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold">שיחה אוטומטית</div>
          <div
            className="text-[10px]"
            style={{ color: "var(--foreground-muted)" }}
          >
            רק למי שלא ענה אחרי 2 תזכורות
          </div>
        </div>
      </div>

      {/* Auto-updated status */}
      <div
        className="rounded-xl px-3 py-2 flex items-center gap-2 text-[11px]"
        style={{
          background: "color-mix(in srgb, var(--accent) 8%, var(--input-bg))",
          border: "1px solid var(--border)",
        }}
      >
        <span aria-hidden>✓</span>
        <span style={{ color: "var(--foreground-soft)" }}>
          נועה אישרה — <b className="ltr-num">2</b> אורחים
        </span>
        <span
          className="ms-auto text-[9px] ltr-num"
          style={{ color: "var(--foreground-muted)" }}
        >
          התעדכן לבד
        </span>
      </div>
    </div>
  );
}

/* ── 4 · Budget ───────────────────────────────────────────────────── */
export function BudgetScreen() {
  const cats: Array<[string, string, number]> = [
    ["אולם", "₪52K", 88],
    ["קייטרינג", "₪38K", 64],
    ["צלם", "₪14K", 40],
    ["מוזיקה", "₪9K", 28],
  ];
  return (
    <div className="pt-9 px-3 pb-1">
      <div
        className="rounded-xl p-3 mb-2 text-center"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(212,176,104,0.16), transparent 60%)",
          border: "1px solid var(--border-gold)",
        }}
      >
        <div className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
          תקציב כולל
        </div>
        <div className="text-2xl font-extrabold gradient-gold ltr-num">
          ₪148,000
        </div>
        <div className="mt-2">
          <Bar pct={72} />
        </div>
        <div
          className="mt-1 text-[9px] ltr-num"
          style={{ color: "var(--foreground-soft)" }}
        >
          נוצל 72%
        </div>
      </div>
      <div className="space-y-1.5">
        {cats.map(([name, amt, pct]) => (
          <div
            key={name}
            className="rounded-xl px-3 py-2"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span style={{ color: "var(--foreground-soft)" }}>{name}</span>
              <span className="font-bold ltr-num">{amt}</span>
            </div>
            <Bar pct={pct} />
          </div>
        ))}
      </div>
      <div
        className="mt-2 rounded-xl px-3 py-2 text-[10px] flex items-center gap-2"
        style={{
          background: "rgba(251,191,36,0.10)",
          border: "1px solid rgba(251,191,36,0.35)",
          color: "rgb(251,191,36)",
        }}
      >
        <span aria-hidden>⚡</span>
        <span>צפויה חריגה של ₪6K — כדאי לעדכן</span>
      </div>
    </div>
  );
}

/* ── 5 · Seating ──────────────────────────────────────────────────── */
export function SeatingScreen() {
  const tables = [
    { n: 1, x: 22, y: 16 },
    { n: 2, x: 60, y: 16 },
    { n: 7, x: 41, y: 44, hot: true },
    { n: 4, x: 18, y: 70 },
    { n: 5, x: 64, y: 70 },
  ];
  return (
    <div className="pt-9 px-3 pb-1">
      <div
        className="relative rounded-2xl overflow-hidden mb-2"
        style={{
          height: 230,
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(212,176,104,0.10), transparent 55%), var(--input-bg)",
          border: "1px solid var(--border)",
        }}
      >
        {tables.map((t) => (
          <div
            key={t.n}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: t.hot ? 52 : 44,
              height: t.hot ? 52 : 44,
              color: t.hot ? "var(--gold-button-text)" : "var(--accent)",
              background: t.hot
                ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
                : "color-mix(in srgb, var(--gold-100) 10%, var(--input-bg))",
              border: `1px solid ${t.hot ? "var(--accent)" : "var(--border-gold)"}`,
              boxShadow: t.hot ? "0 0 0 6px rgba(212,176,104,0.12)" : "none",
            }}
          >
            {t.n}
          </div>
        ))}
      </div>
      <div
        className="rounded-xl px-3 py-2 text-[11px] flex items-center gap-2"
        style={{
          background: "color-mix(in srgb, var(--accent) 8%, var(--input-bg))",
          border: "1px solid var(--border-gold)",
        }}
      >
        <span aria-hidden>📨</span>
        <span style={{ color: "var(--foreground-soft)" }}>
          נשלחו מספרי שולחן ל-<b className="ltr-num">142</b> אורחים
        </span>
      </div>
    </div>
  );
}

/* ── 6 · Vendors ──────────────────────────────────────────────────── */
export function VendorsScreen() {
  const vendors: Array<[string, string, string]> = [
    ["סטודיו אור", "צלם", "4.9"],
    ["גן הדקלים", "אולם", "4.8"],
    ["DJ רן", "מוזיקה", "5.0"],
  ];
  return (
    <div className="pt-9 px-3 pb-1 space-y-2">
      <div className="flex flex-wrap gap-1.5 mb-1">
        {["צלם", "אולם", "קייטרינג", "DJ"].map((c, i) => (
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
      {vendors.map(([name, cat, rating]) => (
        <div
          key={name}
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
        >
          <div
            className="h-14"
            style={{
              background:
                "linear-gradient(135deg, rgba(212,176,104,0.30), rgba(168,136,74,0.10))",
            }}
            aria-hidden
          />
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">{name}</div>
              <div
                className="text-[9px]"
                style={{ color: "var(--foreground-muted)" }}
              >
                {cat} · ✓ מאומת
              </div>
            </div>
            <span
              className="text-[10px] font-bold ltr-num"
              style={{ color: "var(--accent)" }}
            >
              ★ {rating}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 7 · Envelope balance ─────────────────────────────────────────── */
export function BalanceScreen() {
  const rows: Array<[string, string, boolean]> = [
    ["משפחת לוי", "₪1,500", false],
    ["דוד ורד", "₪800", true],
    ["חברים מהצבא", "₪1,200", false],
    ["שכנים", "₪600", true],
  ];
  return (
    <div className="pt-9 px-3 pb-1">
      <div
        className="rounded-xl p-3 mb-2 text-center"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(212,176,104,0.16), transparent 60%)",
          border: "1px solid var(--border-gold)",
        }}
      >
        <div className="text-[10px]" style={{ color: "var(--foreground-muted)" }}>
          סך המעטפות
        </div>
        <div className="text-2xl font-extrabold gradient-gold ltr-num">
          ₪62,400
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map(([name, amt, owe]) => (
          <div
            key={name}
            className="rounded-xl px-3 py-2 flex items-center gap-2 text-[11px]"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
          >
            <span className="flex-1 truncate" style={{ color: "var(--foreground-soft)" }}>
              {name}
            </span>
            {owe && (
              <span
                className="text-[9px] rounded-full px-1.5 py-0.5"
                style={{
                  background: "rgba(251,191,36,0.12)",
                  color: "rgb(251,191,36)",
                }}
              >
                ↩ להחזיר
              </span>
            )}
            <span className="font-bold ltr-num">{amt}</span>
          </div>
        ))}
      </div>
      <div
        className="mt-2 rounded-xl py-2 text-center text-[11px] font-bold"
        style={{
          background: "color-mix(in srgb, var(--accent) 8%, var(--input-bg))",
          border: "1px solid var(--border-gold)",
          color: "var(--accent)",
        }}
      >
        🎙️ הזנה קולית מהירה
      </div>
    </div>
  );
}

/* ── 8 · Momentum Live ────────────────────────────────────────────── */
export function LiveScreen() {
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
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)" }}
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
