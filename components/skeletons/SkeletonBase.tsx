import type { CSSProperties } from "react";

interface SkeletonProps {
  /** CSS width — number = px, string = passthrough. Defaults to 100%. */
  width?: number | string;
  height?: number | string;
  /** Border-radius token: "sm" | "md" | "lg" | "pill" or any CSS string. */
  radius?: "sm" | "md" | "lg" | "pill" | string;
  className?: string;
}

const RADIUS_MAP: Record<string, string> = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  pill: "var(--radius-pill)",
};

/**
 * Atomic skeleton block — the only element that renders the gold shimmer
 * animation. Every page-level skeleton composes these. Marked `aria-hidden`
 * because the loading state is conveyed via a parent `aria-busy` if needed.
 *
 * Sized by props so callers can mirror the real layout (e.g. height={140}
 * for a hero card). Use the `radius` prop to match the surrounding token.
 */
export function Skeleton({ width, height, radius = "md", className = "" }: SkeletonProps) {
  const style: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width ?? "100%",
    height: typeof height === "number" ? `${height}px` : height ?? "1em",
    borderRadius: RADIUS_MAP[radius] ?? radius,
  };
  return (
    <div
      aria-hidden
      className={`skeleton-shimmer no-print ${className}`}
      style={style}
    />
  );
}
