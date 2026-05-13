import type { LucideIcon } from "lucide-react";
import { Home, Users, Briefcase, ListChecks, Menu } from "lucide-react";

/**
 * Navigation sources for the two nav surfaces. They diverge intentionally:
 *
 * - **`NAV_ITEMS`** powers the mobile bottom bar, which is a 5-column grid
 *   with iconography. Adding more items here would shrink each tap target
 *   below comfortable size; removing one would break the grid math.
 *
 * - **`HEADER_NAV`** powers the desktop top bar, where horizontal space is
 *   abundant. R15 restored the original 7-item label-only set so users can
 *   jump straight to הושבה / תקציב / מאזן from any page.
 *
 * Pages reachable on desktop top bar but NOT in mobile bottom bar (seating,
 * budget, balance) are still reachable on mobile via the dashboard's
 * "כלי עזר" grid + direct URL.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "המסע", icon: Home },
  { href: "/guests", label: "אורחים", icon: Users },
  { href: "/vendors", label: "ספקים", icon: Briefcase },
  { href: "/checklist", label: "משימות", icon: ListChecks },
  { href: "/settings", label: "עוד", icon: Menu },
] as const;

export interface HeaderNavItem {
  href: string;
  label: string;
}

/** Desktop top-bar navigation. 7 items, label-only. Order matches the
 *  pre-R14 header for muscle-memory continuity. */
export const HEADER_NAV: readonly HeaderNavItem[] = [
  { href: "/dashboard", label: "המסע" },
  { href: "/checklist", label: "צ׳קליסט" },
  { href: "/vendors", label: "ספקים" },
  { href: "/guests", label: "מוזמנים" },
  { href: "/seating", label: "הושבה" },
  { href: "/budget", label: "תקציב" },
  { href: "/balance", label: "מאזן" },
] as const;
