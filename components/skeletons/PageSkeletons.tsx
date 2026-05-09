/**
 * Page-level skeleton screens. One file because all 13 share the same
 * `<Header /> + main wrapper` pattern and we want a single import surface.
 *
 * Convention: every page skeleton renders inside `<>...</>` and assumes the
 * caller wraps with `<Header />` + main. That keeps the skeleton consistent
 * with the real page's chrome (sticky header, scroll behavior).
 */

import { Skeleton } from "./SkeletonBase";

function ShellMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 pb-24 relative" aria-busy>
      <div aria-hidden className="glow-orb glow-orb-gold w-[600px] h-[600px] -top-40 right-0 opacity-20" />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 relative z-10">
        {children}
      </div>
    </main>
  );
}

function HeroPlaceholder() {
  return (
    <div className="card-gold p-6 md:p-8 mt-7">
      <Skeleton height={14} width={80} />
      <div className="mt-3 space-y-2">
        <Skeleton height={36} width="60%" />
        <Skeleton height={36} width="45%" />
      </div>
      <Skeleton height={16} width="55%" className="mt-3" />
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Skeleton height={92} radius="lg" />
        <Skeleton height={92} radius="lg" />
        <Skeleton height={92} radius="lg" />
      </div>
    </ShellMain>
  );
}

export function DashboardSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      {/* Stat strip */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
        <Skeleton height={88} radius="lg" />
        <Skeleton height={88} radius="lg" />
        <Skeleton height={88} radius="lg" />
      </div>
      {/* Tools rail */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={104} radius="lg" />
        ))}
      </div>
      {/* Journey list */}
      <div className="mt-10 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={86} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

export function GuestsSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <Skeleton height={48} radius="md" className="mt-6" />
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={84} radius="lg" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={72} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

export function BudgetSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <Skeleton height={120} radius="lg" />
        <Skeleton height={120} radius="lg" />
        <Skeleton height={120} radius="lg" />
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={64} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

export function SeatingSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton height={130} width={130} radius="pill" />
            <Skeleton height={12} width={60} />
            <Skeleton height={10} width={40} />
          </div>
        ))}
      </div>
    </ShellMain>
  );
}

export function CompareSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <Skeleton height={180} radius="lg" />
            {Array.from({ length: 6 }).map((_, row) => (
              <Skeleton key={row} height={32} />
            ))}
          </div>
        ))}
      </div>
    </ShellMain>
  );
}

export function ChecklistSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 space-y-5">
        {Array.from({ length: 4 }).map((_, p) => (
          <div key={p} className="card p-5">
            <Skeleton height={20} width="40%" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={40} radius="md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ShellMain>
  );
}

export function TimelineSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton width={48} height={48} radius="pill" />
            <div className="flex-1">
              <Skeleton height={16} width="50%" />
              <Skeleton height={12} width="30%" className="mt-1" />
            </div>
          </div>
        ))}
      </div>
    </ShellMain>
  );
}

export function BalanceSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={96} radius="lg" />
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={56} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

export function EventDaySkeleton() {
  return (
    <ShellMain>
      <Skeleton height={180} radius="lg" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={120} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

export function SettingsSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={140} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

export function InboxSkeleton() {
  return (
    <ShellMain>
      <HeroPlaceholder />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={88} radius="lg" />
        ))}
      </div>
    </ShellMain>
  );
}

/** RSVP page is its own shell (no Header). Renders a compact loading frame. */
export function RsvpSkeleton() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6" aria-busy>
      <div className="w-full max-w-xl space-y-5">
        <Skeleton height={200} radius="lg" />
        <Skeleton height={48} radius="md" />
        <Skeleton height={48} radius="md" />
        <Skeleton height={48} radius="md" />
      </div>
    </main>
  );
}
