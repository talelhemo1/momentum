"use client";

/**
 * Card-shaped skeleton with a gold shimmer sweeping right→left (RTL-aware).
 * Renders 6 by default — same shape as VendorCard so the layout doesn't shift
 * once real data arrives.
 */
export function VendorSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <VendorSkeletonCard key={i} />
      ))}
    </div>
  );
}

function VendorSkeletonCard() {
  return (
    <div className="card overflow-hidden flex flex-col" role="presentation">
      <div className="aspect-[16/10] w-full skeleton-shimmer" />
      <div className="p-5 flex flex-col gap-3">
        <div className="h-5 w-2/3 rounded skeleton-shimmer" />
        <div className="h-3 w-1/3 rounded skeleton-shimmer" />
        <div className="h-3 w-full rounded skeleton-shimmer" />
        <div className="h-3 w-5/6 rounded skeleton-shimmer" />
        <div className="flex gap-2 mt-2">
          <div className="h-5 w-14 rounded-full skeleton-shimmer" />
          <div className="h-5 w-12 rounded-full skeleton-shimmer" />
          <div className="h-5 w-16 rounded-full skeleton-shimmer" />
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="h-7 w-20 rounded skeleton-shimmer" />
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-full skeleton-shimmer" />
            <div className="h-9 w-9 rounded-full skeleton-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
