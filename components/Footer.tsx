import Link from "next/link";
import { Logo } from "./Logo";

/**
 * Site footer. Uses CSS-variable colors instead of `text-white/X` utilities so
 * light-theme contrast stays clean without depending on the light-mode CSS
 * override sheet.
 */
export function Footer() {
  return (
    <footer className="mt-24" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo size={26} />
          <p className="mt-4 text-sm max-w-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
            הדרך החכמה לתכנן אירועים. מרעיון ראשון ועד האורח האחרון — במקום אחד.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">מוצר</h4>
          <ul className="space-y-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/dashboard">המסע</Link></li>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/vendors">ספקים</Link></li>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/guests">מוזמנים</Link></li>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/budget">תקציב</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">חברה</h4>
          <ul className="space-y-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/onboarding">התחל</Link></li>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/privacy">פרטיות</Link></li>
            <li><Link className="hover:text-[--foreground] focus-visible:text-[--foreground]" href="/terms">תנאים</Link></li>
          </ul>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs" style={{ color: "var(--foreground-muted)" }}>
          <span>© {new Date().getFullYear()} Momentum. כל הזכויות שמורות.</span>
          <span>נבנה בישראל · עברית מימין לשמאל</span>
        </div>
      </div>
    </footer>
  );
}
