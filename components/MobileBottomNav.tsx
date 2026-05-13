"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV_ITEMS } from "@/lib/navigation";

/**
 * Mobile-only bottom navigation. Sticky to the viewport bottom, gold accent
 * on the active item with a thin indicator above. Items + order come from
 * `lib/navigation.ts` (NAV_ITEMS), a 5-item icon set tuned for the 5-column
 * grid. The desktop Header uses a separate, longer `HEADER_NAV` from the
 * same module — see that file for the rationale.
 *
 * Hidden on outbound / pre-onboarding pages where the nav would distract
 * from the marketing flow (`/`, `/signup`, `/rsvp`, `/live/*`, `/privacy`,
 * `/terms`, `/pricing`). Hidden on desktop via `md:hidden`.
 */

const HIDDEN_PREFIXES = [
  "/signup",
  "/rsvp",
  "/live",
  "/privacy",
  "/terms",
  "/pricing",
  "/onboarding",
  "/start",
  "/auth",
];

export function MobileBottomNav() {
  const pathname = usePathname() ?? "/";
  // Exact-match the home page, prefix-match the outbound list.
  if (pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <nav
      aria-label="ניווט מובייל"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 no-print"
      style={{
        // Respect the iPhone home-bar / Android gesture inset; min keeps a
        // sensible padding even on devices without an inset.
        paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
        background: "color-mix(in srgb, var(--background) 88%, transparent)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <ul className="grid grid-cols-5 h-14">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // Match by prefix so /vendors/anything still highlights "ספקים".
          // None of our NAV_ITEMS hrefs are "/", so a plain prefix check is safe.
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="relative">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className="h-full w-full flex flex-col items-center justify-center gap-0.5 transition focus-visible:outline-none"
                style={{ color: active ? "var(--accent)" : "var(--foreground-muted)" }}
              >
                {/* Indicator line above the active item — gold, 28px wide. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-7 rounded-b-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <Icon size={20} aria-hidden />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
