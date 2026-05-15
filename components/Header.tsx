"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { Menu, X, Sun, Moon, LogOut, Cloud, CloudOff, RefreshCw, AlertTriangle, Settings, CreditCard, Shield, HelpCircle, Crown, Building2 } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useUser, userActions } from "@/lib/user";
import { useSyncStatus, setupCloudSync, getLastSyncError, type SyncStatus } from "@/lib/sync";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useVendorContext } from "@/lib/useVendorContext";
import { UpgradePlanModal } from "./UpgradePlanModal";
import { EventSwitcher } from "./EventSwitcher";
import { eventSlots } from "@/lib/eventSlots";
import { HEADER_NAV } from "@/lib/navigation";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggle, mounted } = useTheme();
  const { user, hydrated } = useUser();
  const syncStatus = useSyncStatus();
  // Admin badge — visible only when the signed-in email is in
  // `admin_emails`. The hook caches the answer for the session so we
  // don't re-query on every page navigation.
  const isAdmin = useIsAdmin();
  // R14 — vendor pill in the header, visible only when the signed-in
  // user owns a vendor_landing. Same UI pattern as AdminBadge.
  const { isVendor } = useVendorContext();

  // Wire the cloud sync writer once when the app mounts.
  useEffect(() => {
    setupCloudSync();
  }, []);

  // Persist event-slot snapshots whenever local state changes (debounced via the same event).
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // (We close the mobile menu directly inside the Link onClick handlers below,
  // rather than via a pathname-watching effect — keeps the close action where
  // the user can see why it happens.)

  const handleSignOut = async () => {
    // R12+ — was a fire-and-forget call that navigated before the
    // Supabase signOut completed, leaving the user signed in for the
    // next page render. Await fully + hard-reload so every in-memory
    // cache (useIsAdmin, supabase client, useUser snapshot) starts
    // fresh on the home page.
    try {
      await userActions.signOut();
    } finally {
      // window.location.href forces a real navigation, not Next's
      // client-side route swap. This wipes the React tree + module
      // scope, guaranteeing no stale state survives the sign-out.
      window.location.href = "/";
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? "glass-strong" : "bg-transparent"
      }`}
      style={{ borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center hover:opacity-90 transition">
          <Logo size={32} />
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm rounded-full glass px-1.5 py-1.5">
          {HEADER_NAV.map((n) => {
            // R17: exact-match + child-prefix only. The naive `startsWith`
            // would mark "/vendors" active when the user is on "/vendorshop"
            // or any path that simply shares a prefix; the `/` boundary
            // restricts it to actual descendants (e.g. /vendors/my).
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  active
                    ? "bg-[var(--secondary-button-bg-hover)] shadow-inner"
                    : "hover:bg-[var(--secondary-button-bg)] opacity-65 hover:opacity-100"
                }`}
                style={active ? { color: "var(--foreground)" } : { color: "var(--foreground-soft)" }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {isAdmin && <AdminBadge />}
          {isVendor && <VendorBadge />}
          <EventSwitcher />
          <SyncBadge status={syncStatus} />

          <button
            onClick={toggle}
            aria-label="החלף ערכת נושא"
            className="w-10 h-10 rounded-full border border-[var(--border-strong)] hover:bg-[var(--secondary-button-bg)] flex items-center justify-center transition"
          >
            {mounted && (theme === "dark" ? <Sun size={16} /> : <Moon size={16} />)}
          </button>

          {hydrated && user ? (
            <UserMenu name={user.name} onSignOut={handleSignOut} />
          ) : (
            // Anonymous users on the home page get a softer CTA — the hero
            // already has a dominant gold "התחל בחינם", so a second one in
            // the header would just compete. On other public pages we keep
            // it as gold to drive conversion.
            <Link
              href="/signup"
              className={`text-sm py-2 px-5 ${pathname === "/" ? "btn-secondary" : "btn-gold"}`}
            >
              התחל
            </Link>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          {isAdmin && <AdminBadge compact />}
          {isVendor && <VendorBadge compact />}
          <button
            onClick={toggle}
            aria-label="החלף ערכת נושא"
            // R12 §4W — WCAG 2.1 SC 2.5.5 calls for ≥44×44 CSS px on touch
            // targets. The old 36 / 40px buttons triggered "missed tap"
            // toasts on iOS Safari for users with larger fingers.
            className="w-11 h-11 rounded-full border border-[var(--border-strong)] flex items-center justify-center"
          >
            {mounted && (theme === "dark" ? <Sun size={14} /> : <Moon size={14} />)}
          </button>
          <button
            aria-label="פתח תפריט"
            className="w-11 h-11 -ms-1 flex items-center justify-center rounded-full hover:bg-[var(--secondary-button-bg)] transition"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden glass-strong border-t border-[var(--border)] scale-in">
          <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col gap-1">
            {HEADER_NAV.map((n) => {
              // R17: exact-match + child-prefix only. The naive `startsWith`
            // would mark "/vendors" active when the user is on "/vendorshop"
            // or any path that simply shares a prefix; the `/` boundary
            // restricts it to actual descendants (e.g. /vendors/my).
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`py-2.5 px-3 rounded-xl text-base transition`}
                  style={{
                    background: active ? "var(--secondary-button-bg-hover)" : "transparent",
                    color: active ? "var(--foreground)" : "var(--foreground-soft)",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
            {hydrated && user ? (
              <button
                onClick={handleSignOut}
                className="mt-3 py-2.5 px-3 rounded-xl text-base text-start inline-flex items-center gap-2"
                style={{ color: "var(--foreground-soft)" }}
              >
                <LogOut size={16} /> התנתק ({user.name})
              </button>
            ) : (
              <Link href="/signup" className="btn-gold mt-3 text-center">
                התחל
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  if (status === "disabled") return null; // No badge if cloud sync isn't configured.
  const ui = (() => {
    switch (status) {
      case "synced":
        return { icon: <Cloud size={12} />, label: "מסונכרן", color: "rgb(110,231,183)", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.3)", title: "כל השינויים שמורים בענן" };
      case "syncing":
        return { icon: <RefreshCw size={12} className="animate-spin" />, label: "מסנכרן", color: "var(--accent)", bg: "rgba(212,176,104,0.1)", border: "var(--border-gold)", title: "שומר בענן..." };
      case "offline":
        return { icon: <CloudOff size={12} />, label: "לא מקוון", color: "rgb(252,211,77)", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", title: "אין חיבור לאינטרנט. השינויים יסתנכרנו כשהחיבור יחזור." };
      case "signed-out":
        return { icon: <CloudOff size={12} />, label: "לא מחובר", color: "var(--foreground-muted)", bg: "var(--input-bg)", border: "var(--border)", title: "התחבר כדי לסנכרן את הנתונים שלך לענן" };
      case "error": {
        const err = getLastSyncError();
        return {
          icon: <AlertTriangle size={12} />,
          label: "שגיאת סנכרון",
          color: "rgb(248,113,113)",
          bg: "rgba(248,113,113,0.1)",
          border: "rgba(248,113,113,0.3)",
          title: err ? `שגיאת סנכרון: ${err}` : "שגיאת סנכרון. נסה לרענן את הדף.",
        };
      }
    }
  })();
  if (!ui) return null;
  return (
    <span
      className="hidden lg:inline-flex items-center gap-1.5 text-[11px] rounded-full px-2.5 py-1.5 border"
      style={{ background: ui.bg, borderColor: ui.border, color: ui.color }}
      title={ui.title}
    >
      {ui.icon}
      {ui.label}
    </span>
  );
}

function UserMenu({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  // R18 §R — open the upgrade modal in place instead of navigating away
  // to /pricing (kept reachable from inside the modal).
  const [showUpgrade, setShowUpgrade] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-[var(--border-strong)] hover:bg-[var(--secondary-button-bg)] py-1.5 ps-1.5 pe-3 transition"
      >
        <Avatar name={name} size={28} />
        <span className="text-sm font-medium max-w-[120px] truncate">{name}</span>
      </button>
      {open && (
        <>
          <button onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" aria-hidden />
          <div className="absolute end-0 top-full mt-2 w-72 glass-strong rounded-2xl border border-[var(--border-strong)] z-50 overflow-hidden">
            {/* Profile header */}
            <div className="p-4 flex items-center gap-3" style={{ background: "var(--surface-2)" }}>
              <Avatar name={name} size={44} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{name}</div>
                <div className="text-xs flex items-center gap-1" style={{ color: "var(--foreground-muted)" }}>
                  <span className="pill pill-gold !text-[10px] !py-0 !px-1.5">חינם</span>
                  שדרג למסלול פרימיום
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1">
              <MenuItem href="/settings" icon={<Settings size={14} />} label="הגדרות" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowUpgrade(true);
                }}
                className="w-full rounded-xl flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-[var(--secondary-button-bg)] transition text-start"
                style={{ color: "var(--foreground-soft)" }}
              >
                <span className="text-[--accent]"><CreditCard size={14} /></span>
                <span className="flex-1">מסלול ותשלומים</span>
                <span className="pill pill-gold !text-[10px] !py-0 !px-1.5">שדרג</span>
              </button>
              <MenuItem href="/privacy" icon={<Shield size={14} />} label="פרטיות ותנאים" />
              <MenuItem href="mailto:support@momentum.app" icon={<HelpCircle size={14} />} label="עזרה ותמיכה" />
            </div>

            <div className="border-t" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={onSignOut}
                className="w-full text-start px-4 py-3 text-sm hover:bg-[var(--secondary-button-bg)] inline-flex items-center gap-2.5"
                style={{ color: "rgb(252, 165, 165)" }}
              >
                <LogOut size={14} /> התנתק
              </button>
            </div>
          </div>
        </>
      )}
      {showUpgrade && <UpgradePlanModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

function MenuItem({ href, icon, label, badge }: { href: string; icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-[var(--secondary-button-bg)] transition"
      style={{ color: "var(--foreground-soft)" }}
    >
      <span className="text-[--accent]">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && <span className="pill pill-gold !text-[10px] !py-0 !px-1.5">{badge}</span>}
    </Link>
  );
}

/**
 * Gold "Admin" badge that appears in the Header only for emails in
 * `admin_emails`. Links to the admin dashboard. `compact` mode shows
 * just the crown icon (mobile); full mode shows the crown + label.
 */
function AdminBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/admin/dashboard"
      aria-label="לוח בקרת מנהל"
      className={`inline-flex items-center gap-1.5 rounded-full font-bold transition hover:translate-y-[-1px] ${
        compact ? "w-11 h-11 justify-center" : "px-3.5 py-2 text-xs"
      }`}
      style={{
        background: "linear-gradient(135deg, #F4DEA9, #A8884A)",
        color: "#1A1310",
        boxShadow: "0 4px 14px -4px rgba(212,176,104,0.5)",
      }}
    >
      <Crown size={compact ? 18 : 13} aria-hidden />
      {!compact && <span>אדמין</span>}
    </Link>
  );
}

/**
 * R14 — gold "Vendor" badge in the Header. Visible only when the
 * signed-in user owns a `vendor_landings` row (via `useVendorContext`).
 * Mirrors AdminBadge styling so the two pills sit side-by-side cleanly
 * when a user happens to be both an admin and a vendor. Tapping it
 * jumps straight to `/vendors/dashboard`, the same destination as the
 * homepage and footer entry points.
 */
function VendorBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/vendors/dashboard"
      aria-label="דשבורד הספק"
      className={`inline-flex items-center gap-1.5 rounded-full font-bold transition hover:translate-y-[-1px] ${
        compact ? "w-11 h-11 justify-center" : "px-3.5 py-2 text-xs"
      }`}
      style={{
        // Slightly inverted accent ramp from AdminBadge so the two pills
        // are distinguishable when they appear together. Both still read
        // as "gold" but the vendor pill leans warmer/lighter.
        background: "linear-gradient(135deg, #E8C77A, #B58A3E)",
        color: "#1A1310",
        boxShadow: "0 4px 14px -4px rgba(212,176,104,0.5)",
      }}
    >
      <Building2 size={compact ? 18 : 13} aria-hidden />
      {!compact && <span>ספק</span>}
    </Link>
  );
}
