"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Briefcase,
  CreditCard,
  HelpCircle,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Moon,
  Settings,
  Shield,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
// R90 — ChatBell removed (in-app chat retired).
import { NotificationsBell } from "./NotificationsBell";
import { EventSwitcher } from "./EventSwitcher";
import { UpgradePlanModal } from "./UpgradePlanModal";
import { DeleteEventModal } from "./DeleteEventModal";
import { useTheme } from "@/lib/theme";
import { useUser, userActions } from "@/lib/user";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useVendorContext } from "@/lib/useVendorContext";
// R90 — useChatUnread retired with ChatBell.
import { eventSlots, useEventSlots } from "@/lib/eventSlots";
import { setupCloudSync } from "@/lib/sync";
import { HEADER_NAV, VENDOR_HEADER_NAV, MORE_MENU_NAV } from "@/lib/navigation";
import { useAppState } from "@/lib/store";
import { useNow, daysUntil } from "@/lib/useNow";

/**
 * R72 (R61) — Two-tier premium Header.
 *
 *   Tier 1 (h-14): logo · event date + countdown · ChatBell + Avatar
 *   Tier 2 (h-12): 6 navigation pills · "..." overflow dropdown
 *
 * Anonymous landing variant: Tier 1 only, with anchor links and
 * signup/signin CTAs (no nav pill row).
 *
 * The sync-status badge and the inline admin/vendor/theme buttons all
 * collapse into the Avatar dropdown — Tier 1 stays uncluttered.
 *
 * Mobile (<768px): the pill row scrolls horizontally; EventSwitcher
 * moves into the Avatar dropdown.
 *
 * Accessibility: focus order is Tier 1 RTL (logo → event/switcher →
 * chat → avatar), then Tier 2 RTL (pills → "..."); each dropdown is a
 * proper menu with role="menu" / role="menuitem"; Escape + outside-click
 * close on both dropdowns; prefers-reduced-motion respected by every
 * transition through Tailwind's default behavior.
 */

// Icon name → component lookup for MORE_MENU_NAV (the nav module
// exports string icon names to keep its bundle lean).
const MORE_ICONS: Record<string, LucideIcon> = {
  Activity,
  Briefcase,
  Shield,
  Mail,
  Settings,
};

/**
 * R147 — Decide whether a nav item is the active one for the current
 * pathname. Active iff:
 *   • EXACT match (pathname === item.href), OR
 *   • prefix match (pathname starts with item.href + "/") AND no
 *     other nav item is a LONGER prefix match for this pathname.
 *
 * The longest-matching nav item wins. Used by both the desktop and
 * mobile pill rows so the gold-glowing state always identifies
 * exactly one pill — the one that maps to the user's current page.
 */
function isMostSpecificMatch(
  pathname: string,
  href: string,
  all: ReadonlyArray<{ href: string }>,
): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // Some other nav entry is a deeper-prefix → it should win, not this one.
  return !all.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(`${href}/`) &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}

interface MoreItemContext {
  isAdmin: boolean;
  isVendor: boolean;
  hasInboxUnread: boolean;
  daysToEvent: number | null;
}

/**
 * Decide which MORE_MENU_NAV items to render based on the user's
 * context. Conditional rules:
 *   - /event-day  → only when event is <= 21 days away
 *   - /vendors/dashboard → only when isVendor
 *   - /admin/dashboard   → only when isAdmin
 *   - /inbox      → only when there are unread chats
 *   - /seating, /settings → always
 */
function visibleMoreItems(ctx: MoreItemContext) {
  return MORE_MENU_NAV.filter((m) => {
    if (m.href === "/event-day") {
      return ctx.daysToEvent != null && ctx.daysToEvent <= 21;
    }
    if (m.href === "/vendors/dashboard") return ctx.isVendor;
    if (m.href === "/admin/dashboard") return ctx.isAdmin;
    if (m.href === "/inbox") return ctx.hasInboxUnread;
    return true;
  });
}

export function Header() {
  const pathname = usePathname();
  const { theme, toggle, mounted } = useTheme();
  const { user, hydrated } = useUser();
  const isAdmin = useIsAdmin();
  const { isVendor, vendorLanding } = useVendorContext();
  const { state } = useAppState();
  const nowMs = useNow();
  // R90 — `unread` was driven by useChatUnread (chat retired). Fixed
  // to 0 so the surviving usage sites (the inbox-unread MORE menu
  // gate + the avatar dropdown badge) stay quiet without code churn.
  const unread = 0;
  const { slots } = useEventSlots();

  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Landing-mode variant: when on "/" with no signed-in user.
  const isLanding = pathname === "/" && hydrated && !user;

  // R114 — vendor-aware top nav. Vendors get a completely different
  // primary nav (dashboard / leads / inbox / analytics / my page /
  // catalog) instead of the host's "guests / budget / seating" set,
  // which doesn't apply to them. Stays as HEADER_NAV for everyone
  // else (anon visitors, hosts, admins).
  //
  // R142 — path-based fallback. While `useVendorContext` is still
  // resolving (or if its lookup misfires — e.g., a vendor whose
  // landing row's owner_user_id was never linked), a vendor browsing
  // the vendor dashboard / their own profile editor would briefly
  // see the HOST nav (אורחים / תקציב / הושבה) — confusing AND wrong.
  // Anyone actively inside a vendor-OWNER surface gets the vendor
  // nav unconditionally. `/vendors` (catalog) and `/vendors/[slug]`
  // (public profile) stay isVendor-driven so an anon visitor sees
  // the marketing nav, not the dashboard nav.
  const onVendorOwnerPath =
    pathname.startsWith("/vendors/dashboard") ||
    pathname.startsWith("/vendors/my") ||
    pathname.startsWith("/vendors/join");
  const effectiveNav = isVendor || onVendorOwnerPath ? VENDOR_HEADER_NAV : HEADER_NAV;

  // Boot the cloud sync writer + event-slot snapshot listener exactly
  // once, just like the previous Header did. These run as side effects
  // even though the UI no longer surfaces sync status.
  useEffect(() => {
    setupCloudSync();
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => eventSlots.saveSnapshot(), 500);
    };
    window.addEventListener("momentum:update", onUpdate);
    return () => {
      window.removeEventListener("momentum:update", onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Scroll → "scrolled" state for the more-opaque variant.
  // R120 — was raw `setScrolled(scrollY > 40)` on every scroll event.
  // The boolean only flips ONCE (at the 40px threshold), but React
  // still recomputed the entire Header on every scroll frame because
  // setState fires whether the new value matches or not. On mobile
  // that meant 60 re-renders/sec while scrolling, which compounded
  // with the other compositor work into visible jank. Two fixes:
  // (1) wrap the read in requestAnimationFrame so we coalesce
  // multiple scroll events per frame; (2) gate the setState call so
  // it only fires when the boolean actually changes.
  useEffect(() => {
    let raf: number | null = null;
    let current = false;
    const tick = () => {
      raf = null;
      const next = window.scrollY > 40;
      if (next !== current) {
        current = next;
        setScrolled(next);
      }
    };
    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, []);

  // "..." dropdown — outside click + Escape close.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const eventDateRaw = state.event?.date;
  const eventDate =
    hydrated && eventDateRaw ? new Date(eventDateRaw) : null;
  const validEventDate =
    eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null;
  const days = validEventDate ? daysUntil(validEventDate, nowMs) : null;

  const moreCtx: MoreItemContext = {
    isAdmin,
    isVendor,
    hasInboxUnread: unread > 0,
    daysToEvent: days,
  };
  const moreItems = visibleMoreItems(moreCtx);

  const handleSignOut = () => {
    // R78 — non-blocking. signOutAndRedirect() bounces the user
    // immediately (with a 1.5s belt-and-suspenders retry) and runs the
    // Supabase revoke + localStorage purge in the background. Target
    // is the landing page so signed-out users land on a clear
    // "מתחילים מחדש" surface instead of the signup form.
    userActions.signOutAndRedirect("/");
  };

  // R89 / R146 — vendor-aware logo destination.
  //
  // R89: pathname-based check (signed-out users on the landing page
  //      just refresh "/"; everyone else goes home).
  // R146: vendors should NEVER bounce through /dashboard (the host
  //       "events" page). Pre-R146, a vendor clicking the logo from
  //       any inner page hit /dashboard for ~150ms before
  //       useVendorRedirect kicked them to /vendors/dashboard —
  //       visible as a flash of host UI ("פתאום זה לוקח אותי לדף
  //       אירועים"). Now: if isVendor OR we're on a vendor-owner
  //       path, logo points directly to /vendors/dashboard.
  const headerHome =
    pathname === "/"
      ? "/"
      : isVendor || onVendorOwnerPath
        ? "/vendors/dashboard"
        : "/dashboard";

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "header-scrolled" : ""
      }`}
      style={{
        // R88 (R71) — was hardcoded `rgba(10,10,15,…)` (dark even in
        // light mode → unreadable header on light pages). Now uses
        // color-mix on --background which flips automatically with
        // [data-theme="light"]. The glass-strong / glass-bg CSS vars
        // also vary by theme (defined in globals.css), but we want a
        // slightly more opaque background here to hide content as the
        // user scrolls.
        background: scrolled
          ? "color-mix(in srgb, var(--background) 92%, transparent)"
          : "color-mix(in srgb, var(--background) 72%, transparent)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: "1px solid var(--border-gold)",
        boxShadow: scrolled
          ? "0 2px 20px color-mix(in srgb, var(--foreground) 12%, transparent)"
          : "none",
      }}
    >
      {/* ─── Tier 1 — Brand bar (h-14) ─── */}
      <div className="w-full px-4 sm:px-6 lg:px-10 h-14 flex items-center justify-between gap-3">
        {/* Right cluster (RTL): logo + (event chip OR landing anchors) */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={headerHome}
            className="flex items-center shrink-0 hover:opacity-90 transition"
            aria-label="Momentum — חזרה לעמוד הראשי"
          >
            {/* R87 (R69-5) — Logo already renders the "Momentum"
                wordmark next to its SVG glyph. The previous duplicate
                <span> wordmark right here showed "Momentum" twice in
                the top-right of the header. Now just the Logo. */}
            <Logo size={30} />
          </Link>

          {/* Landing anchors live here (anon /). Hidden on small screens. */}
          {isLanding && (
            <nav
              aria-label="קישורי דף נחיתה"
              className="hidden md:flex items-center gap-1 ms-2"
            >
              <LandingAnchor href="#showcase" label="תכונות" />
              <LandingAnchor href="#pricing" label="השקה חינמית" />
            </nav>
          )}
        </div>

        {/* Center — for vendors, the business-name brand chip (R145);
            for hosts, the event date + countdown OR EventSwitcher.
            Hidden on landing / anonymous to avoid the empty state.

            R145 — vendors used to see the host's "X ימים לאירוע"
            countdown at the top of every page. That countdown is
            meaningless for a vendor (they don't HAVE an event date —
            they have lots of weddings on their calendar). Now they
            see THEIR OWN BUSINESS NAME in gold serif, on every page,
            as the brand anchor. Hosts continue to see the countdown
            as before. */}
        {!isLanding && hydrated && user && (
          <div className="hidden md:flex items-center min-w-0 max-w-[40%]">
            {(isVendor || onVendorOwnerPath) && vendorLanding?.name ? (
              <VendorBrandChip name={vendorLanding.name} />
            ) : slots.length > 1 ? (
              <EventSwitcher />
            ) : validEventDate ? (
              <EventChip date={validEventDate} days={days} />
            ) : null}
          </div>
        )}

        {/* Left cluster — controls. Different sets for anon vs signed-in. */}
        <div className="flex items-center gap-2 shrink-0">
          {hydrated && user ? (
            <>
              <NotificationsBell />
              {/* R90 — ChatBell removed (in-app chat retired). */}
              {/* R88 (R70-2) — the mobile compact `Nי׳` countdown chip
                  was removed: it duplicated the center EventChip on
                  larger screens and competed visually with the big
                  countdown on /dashboard's IntimateHero. The single
                  remaining countdown is the center EventChip (≥ md). */}
              <AvatarMenu
                name={user.name}
                isAdmin={isAdmin}
                isVendor={isVendor}
                unread={unread}
                theme={theme}
                themeMounted={mounted}
                onToggleTheme={toggle}
                onSignOut={handleSignOut}
              />
            </>
          ) : (
            // R118 — anonymous CTA cluster now has THREE actions:
            //   1. "כניסה כספק" (vendor login)  → /signup?mode=signin&role=vendor
            //      Hidden on mobile to keep the header compact; vendor
            //      visitors find it on the landing hero or via the
            //      "כבר רשום? כניסה" toggle inside /signup itself.
            //   2. "כניסה" (host login)          → /signup?mode=signin
            //   3. "התחל בחינם" (host signup)     → /signup
            // The host signup stays the loudest action — Momentum is
            // primarily a host product; the vendor side is a smaller,
            // gated funnel.
            <div className="flex items-center gap-2">
              <Link
                href="/signup?mode=signin&role=vendor"
                className="hidden sm:inline-flex text-xs items-center gap-1 rounded-full px-3 transition"
                style={{
                  border: "1px solid var(--border-gold)",
                  color: "var(--accent)",
                  minHeight: 34,
                  background:
                    "color-mix(in srgb, var(--gold-100) 6%, transparent)",
                }}
              >
                כניסה כספק
              </Link>
              <Link
                href="/signup?mode=signin"
                className="btn-secondary text-sm py-1.5 px-3 sm:px-4"
              >
                כניסה
              </Link>
              <Link
                href="/signup"
                className="btn-gold text-sm py-1.5 px-3 sm:px-5"
              >
                התחל בחינם
              </Link>
            </div>
          )}

          {/* Mobile hamburger — opens a drawer with the pill row + secondary items. */}
          {hydrated && user && (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "סגור תפריט" : "פתח תפריט"}
              aria-expanded={mobileOpen}
              className="md:hidden w-10 h-10 rounded-full inline-flex items-center justify-center hover:bg-[var(--secondary-button-bg)] transition"
              style={{ border: "1px solid var(--border)" }}
            >
              {mobileOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
            </button>
          )}
        </div>
      </div>

      {/* ─── Tier 2 — Nav pill row (h-12) — signed-in only, hidden on landing ─── */}
      {hydrated && user && !isLanding && (
        <nav
          aria-label="ניווט ראשי"
          className="hidden md:flex w-full px-4 sm:px-6 lg:px-10 h-12 items-center gap-1.5"
          style={{ borderTop: "1px solid color-mix(in srgb, var(--border-gold) 50%, transparent)" }}
        >
          {/* R92 — phantom spacer mirroring the "..." button's
              width (36px) on the opposite side so the centered pill
              row sits at the true horizontal middle of the
              viewport, not offset by the overflow control. */}
          <div aria-hidden className="shrink-0 w-9" />
          {/* R92 — pill row centered horizontally on the page (was
              left/start-aligned with flex-1 → all pills pinned to
              the right edge in RTL, which felt cramped against the
              avatar/notifications cluster). Now: pills sit in a
              centered group with the "..." overflow on the side.
              The wrapper still gets flex-1 so the centering math
              uses the full available width, not just the pills'
              natural width. Active-pill logic (R147) unchanged.

              Pills wrap is `justify-center` so a long nav (vendor
              area has 5 pills) self-centers. On mobile (md:hidden)
              the separate scroll row below stays start-aligned for
              swipe ergonomics. */}
          <div className="flex items-center justify-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
            {effectiveNav.map((n) => {
              const active = isMostSpecificMatch(pathname, n.href, effectiveNav);
              return <NavPill key={n.href} href={n.href} label={n.label} active={active} />;
            })}
          </div>

          {/* "..." overflow */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              aria-label="עוד אפשרויות"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center transition hover:bg-[var(--secondary-button-bg)]"
              style={{
                border: "1px solid var(--border)",
                background: moreOpen ? "var(--secondary-button-bg)" : "transparent",
              }}
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>

            {moreOpen && (
              <div
                role="menu"
                className="absolute end-0 top-full mt-2 min-w-[220px] rounded-2xl z-[60] py-1.5 overflow-hidden"
                style={{
                  background:
                    "linear-gradient(170deg, var(--surface) 0%, var(--background) 100%)",
                  border: "1px solid var(--border-gold)",
                  boxShadow: "0 20px 60px -20px rgba(0,0,0,0.55)",
                }}
              >
                {moreItems.length === 0 ? (
                  <div
                    className="px-4 py-3 text-xs text-center"
                    style={{ color: "var(--foreground-muted)" }}
                  >
                    אין פריטים נוספים כרגע
                  </div>
                ) : (
                  moreItems.map((m) => {
                    const Icon = MORE_ICONS[m.icon] ?? Settings;
                    const active =
                      pathname === m.href ||
                      pathname.startsWith(`${m.href}/`);
                    return (
                      <Link
                        key={m.href}
                        href={m.href}
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-2.5 mx-1.5 px-3 py-2.5 text-sm rounded-lg transition"
                        style={{
                          color: active
                            ? "var(--accent)"
                            : "var(--foreground-soft)",
                          background: active
                            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                            : "transparent",
                          fontWeight: active ? 600 : 500,
                        }}
                      >
                        <Icon size={15} aria-hidden />
                        <span className="flex-1">{m.label}</span>
                        {m.href === "/inbox" && unread > 0 && (
                          <span
                            className="text-[10px] font-bold ltr-num min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center"
                            style={{
                              background: "var(--accent)",
                              color: "var(--background)",
                            }}
                          >
                            {unread}
                          </span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </nav>
      )}

      {/* Mobile pill drawer — scrolls horizontally below Tier 1 on small screens. */}
      {hydrated && user && (
        <div
          className="md:hidden w-full px-3"
          style={{ borderTop: "1px solid color-mix(in srgb, var(--border-gold) 35%, transparent)" }}
        >
          <div
            className="flex items-center gap-1.5 h-12 overflow-x-auto scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            aria-label="ניווט ראשי"
          >
            {effectiveNav.map((n) => {
              // R147 — same most-specific-match logic as the desktop pill row.
              const active = isMostSpecificMatch(pathname, n.href, effectiveNav);
              return (
                <NavPill
                  key={n.href}
                  href={n.href}
                  label={n.label}
                  active={active}
                  compact
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile drawer — fallback overlay menu when the hamburger opens.
          Carries the full "..." menu items + theme/logout in one sheet
          so nothing on mobile is unreachable. */}
      {mobileOpen && hydrated && user && (
        <div
          className="md:hidden w-full"
          style={{
            // R88 (R71) — theme-aware. Was `rgba(10,10,15,0.97)` =
            // dark in both themes; now flips via --background.
            background: "color-mix(in srgb, var(--background) 97%, transparent)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div className="px-4 py-3 flex flex-col gap-1">
            {moreItems.map((m) => {
              const Icon = MORE_ICONS[m.icon] ?? Settings;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition"
                  style={{ color: "var(--foreground-soft)" }}
                >
                  <Icon size={16} aria-hidden />
                  <span className="flex-1">{m.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                toggle();
                setMobileOpen(false);
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-start transition"
              style={{ color: "var(--foreground-soft)" }}
            >
              {mounted &&
                (theme === "dark" ? <Sun size={16} /> : <Moon size={16} />)}
              <span className="flex-1">
                {theme === "dark" ? "מצב בהיר" : "מצב כהה"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                void handleSignOut();
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-start transition mt-1"
              style={{ color: "rgb(252,165,165)" }}
            >
              <LogOut size={16} aria-hidden />
              <span>התנתק ({user.name})</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ─────────────────────── child components ─────────────────────── */

function NavPill({
  href,
  label,
  active,
  compact = false,
}: {
  href: string;
  label: string;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 inline-flex items-center justify-center rounded-full transition-all duration-200 ${
        compact ? "px-3 py-1.5" : "px-4 py-1.5"
      }`}
      style={{
        fontSize: "0.875rem",
        fontWeight: active ? 600 : 500,
        minHeight: "36px",
        background: active
          ? "linear-gradient(135deg, var(--gold-100), var(--gold-500))"
          : "transparent",
        color: active ? "var(--background)" : "var(--foreground-soft)",
        boxShadow: active
          ? "0 4px 14px -4px color-mix(in srgb, var(--accent) 35%, transparent)"
          : "none",
      }}
    >
      {label}
    </Link>
  );
}

function LandingAnchor({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="text-sm px-3 py-1.5 rounded-full transition hover:bg-[var(--secondary-button-bg)]"
      style={{ color: "var(--foreground-soft)" }}
    >
      {label}
    </a>
  );
}

function EventChip({ date, days }: { date: Date; days: number | null }) {
  const dateLabel = date.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div
      className="flex items-baseline gap-2 px-3 py-1.5 rounded-full min-w-0"
      style={{
        background: "color-mix(in srgb, var(--accent) 7%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
      }}
      aria-label={`${dateLabel} · ${days ?? 0} ימים לאירוע`}
      title={dateLabel}
    >
      <span
        className="text-xs ltr-num truncate"
        style={{ color: "var(--foreground-soft)" }}
      >
        {dateLabel}
      </span>
      {days != null && days > 0 && (
        <span
          className="text-sm font-bold ltr-num"
          style={{ color: "var(--accent)" }}
        >
          🌟 <span>{days}</span> ימים
        </span>
      )}
    </div>
  );
}

/**
 * R145 — VendorBrandChip
 *
 * Shows the vendor's business name in the same horizontal slot the
 * host's EventChip occupies. Serif (Frank Ruhl Libre) + gold-shimmer
 * gradient + hairline gold border + a subtle inner sheen — same
 * visual language as the dashboard hero, just sized for the header.
 *
 * Why a separate component (vs. inline conditional in Header):
 *   - Encapsulates the premium styling so future tweaks live in one
 *     place.
 *   - Keeps the main Header function body focused on routing /
 *     visibility logic.
 *
 * Visible on every page a vendor lands on, so they always see THEIR
 * brand at the top of the app — not a countdown that belongs to
 * someone else's wedding.
 */
function VendorBrandChip({ name }: { name: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full min-w-0"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 5%, transparent))",
        border: "1px solid var(--border-gold)",
        boxShadow:
          "inset 0 1px 0 rgba(244,222,169,0.18), 0 2px 10px -4px var(--accent-glow)",
      }}
      title={name}
      aria-label={`עמוד הספק של ${name}`}
    >
      {/* Tiny gold dot — acts as a "brand bullet". Catches the eye
          without competing with the name itself. */}
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background:
            "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
          boxShadow: "0 0 6px var(--accent-glow)",
        }}
      />
      <span
        className="font-bold gradient-gold-shimmer truncate"
        style={{
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: "clamp(0.9rem, 1.6vw, 1.05rem)",
          letterSpacing: "0.005em",
          lineHeight: 1.1,
          maxWidth: "32ch",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function AvatarMenu({
  name,
  isAdmin,
  isVendor,
  unread,
  theme,
  themeMounted,
  onToggleTheme,
  onSignOut,
}: {
  name: string;
  isAdmin: boolean;
  isVendor: boolean;
  unread: number;
  theme: string;
  themeMounted: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="תפריט משתמש"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-full overflow-hidden transition hover:scale-105"
        style={{ border: "1.5px solid var(--border-gold)" }}
      >
        <Avatar name={name} size={36} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full mt-2 w-64 rounded-2xl z-[60] overflow-hidden"
          style={{
            background: "linear-gradient(170deg, var(--surface) 0%, var(--background) 100%)",
            border: "1px solid var(--border-gold)",
            boxShadow: "0 20px 60px -20px rgba(0,0,0,0.55)",
          }}
        >
          {/* Header — name */}
          <div
            className="px-4 py-3 flex items-center gap-3"
            style={{ background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}
          >
            <Avatar name={name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{name}</div>
              <div
                className="text-[11px] flex items-center gap-1.5 mt-0.5"
                style={{ color: "var(--foreground-muted)" }}
              >
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  חינם
                </span>
                <span>שדרג למסלול פרימיום</span>
              </div>
            </div>
          </div>

          <div className="py-1.5">
            {isAdmin && (
              <AvatarMenuLink
                href="/admin/dashboard"
                icon={<Shield size={15} />}
                label="לוח בקרת מנהל"
                onClick={() => setOpen(false)}
              />
            )}
            {isVendor && (
              <AvatarMenuLink
                href="/vendors/dashboard"
                icon={<Briefcase size={15} />}
                label="דשבורד הספק"
                onClick={() => setOpen(false)}
              />
            )}
            <AvatarMenuLink
              href="/settings"
              icon={<Settings size={15} />}
              label="הגדרות"
              onClick={() => setOpen(false)}
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowUpgrade(true);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 mx-1.5 px-3 py-2.5 text-sm rounded-lg transition hover:bg-[var(--secondary-button-bg)]"
              style={{ color: "var(--foreground-soft)", width: "calc(100% - 12px)" }}
            >
              <CreditCard size={15} aria-hidden />
              <span className="flex-1 text-start">מסלול ותשלומים</span>
              <span
                className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--gold-100), var(--gold-500))",
                  color: "var(--background)",
                }}
              >
                שדרג
              </span>
            </button>
            {unread > 0 && (
              <AvatarMenuLink
                href="/inbox"
                icon={<MessageCircle size={15} />}
                label="הודעות"
                badge={unread}
                onClick={() => setOpen(false)}
              />
            )}
            <button
              type="button"
              onClick={() => {
                onToggleTheme();
                setOpen(false);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 mx-1.5 px-3 py-2.5 text-sm rounded-lg transition hover:bg-[var(--secondary-button-bg)]"
              style={{ color: "var(--foreground-soft)", width: "calc(100% - 12px)" }}
            >
              {themeMounted &&
                (theme === "dark" ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />)}
              <span className="flex-1 text-start">
                {theme === "dark" ? "מצב בהיר" : "מצב כהה"}
              </span>
            </button>
            <AvatarMenuLink
              href="mailto:support@momentum.app"
              icon={<HelpCircle size={15} />}
              label="עזרה ותמיכה"
              onClick={() => setOpen(false)}
            />
          </div>

          {/* R102 — destructive zone: "delete event & start over" sits
              above the sign-out, both styled in soft-red so the user
              recognizes the section. Clicking opens the type-to-confirm
              modal; the menu itself just closes. */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowDelete(true);
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition hover:bg-[var(--secondary-button-bg)]"
              style={{ color: "rgb(252,165,165)" }}
            >
              <Trash2 size={15} aria-hidden />
              <span className="flex-1 text-start">מחק אירוע והתחל מחדש</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void onSignOut();
              }}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition hover:bg-[var(--secondary-button-bg)]"
              style={{
                color: "rgb(252,165,165)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <LogOut size={15} aria-hidden />
              <span>התנתק</span>
            </button>
          </div>
        </div>
      )}

      {showUpgrade && (
        <UpgradePlanModal onClose={() => setShowUpgrade(false)} />
      )}
      {showDelete && (
        <DeleteEventModal onClose={() => setShowDelete(false)} />
      )}
    </div>
  );
}

function AvatarMenuLink({
  href,
  icon,
  label,
  badge,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-2.5 mx-1.5 px-3 py-2.5 text-sm rounded-lg transition hover:bg-[var(--secondary-button-bg)]"
      style={{ color: "var(--foreground-soft)" }}
    >
      <span style={{ color: "var(--accent)" }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="text-[10px] font-bold ltr-num min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center"
          style={{
            background: "var(--accent)",
            color: "var(--background)",
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
