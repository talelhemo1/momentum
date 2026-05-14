"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  User,
  Star,
  CreditCard,
  Eye,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Sidebar / bottom-nav for vendor accounts.
 *
 * Renders on every `/vendors/*` page (used inside the layout). Desktop
 * shows a left-side rail; mobile collapses to a sticky bottom nav.
 * Active route is highlighted via a gold pill behind the icon.
 *
 * Note we INTENTIONALLY don't try to share components with the couples'
 * `MobileBottomNav.tsx` — the two roles' nav items diverge enough that
 * abstracting would just hide the differences.
 */

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/vendors/dashboard", label: "דשבורד", icon: <LayoutDashboard size={18} aria-hidden /> },
  { href: "/vendors/dashboard/leads", label: "לידים", icon: <Inbox size={18} aria-hidden /> },
  { href: "/dashboard/vendor-studio", label: "פרופיל", icon: <User size={18} aria-hidden /> },
  { href: "/vendors/dashboard/reviews", label: "ביקורות", icon: <Star size={18} aria-hidden /> },
  { href: "/vendors/dashboard/billing", label: "תשלומים", icon: <CreditCard size={18} aria-hidden /> },
];

export function VendorNav({ publicSlug }: { publicSlug?: string | null }) {
  const pathname = usePathname() ?? "";

  return (
    <>
      {/* Desktop sidebar — fixed on the right (RTL). Hidden under md. */}
      <aside
        className="hidden md:flex fixed top-0 end-0 h-full w-60 flex-col py-8 px-4 z-40"
        style={{
          background: "var(--surface-1)",
          borderInlineStart: "1px solid var(--border)",
        }}
      >
        <div className="text-xs uppercase tracking-wider mb-6" style={{ color: "var(--foreground-muted)" }}>
          איזור הספק
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl flex items-center gap-3 px-3 py-2.5 text-sm transition"
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, rgba(244,222,169,0.18), rgba(168,136,74,0.08))",
                        border: "1px solid var(--border-gold)",
                        color: "var(--accent)",
                      }
                    : { color: "var(--foreground-soft)" }
                }
              >
                <span className={active ? "text-[--accent]" : ""}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {publicSlug && (
          <Link
            href={`/vendor/${publicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 rounded-xl flex items-center gap-2 px-3 py-2.5 text-xs"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
              color: "var(--foreground-muted)",
            }}
          >
            <Eye size={14} aria-hidden /> צפה בדף הציבורי
          </Link>
        )}
      </aside>

      {/* Mobile — sticky bottom nav. Honors safe-area inset for iOS. */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 backdrop-blur-md"
        style={{
          background: "rgba(20,16,12,0.92)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center py-2 text-[10px]"
              style={{ color: active ? "var(--accent)" : "var(--foreground-muted)" }}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              <span className="mt-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
