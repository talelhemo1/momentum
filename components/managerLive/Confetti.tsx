"use client";

import { useEffect, useState } from "react";

interface Piece {
  left: number;
  dx: string;
  rot: string;
  dur: string;
  delay: string;
  color: string;
  w: number;
  key: number;
}

/**
 * R26 — CSS gold confetti (no canvas-confetti dependency). Renders a
 * one-shot burst of fixed-position pieces that fall + drift + spin via
 * the `.r26-confetti-piece` keyframe. Mount it for ~2.8s then unmount.
 * Disabled automatically under prefers-reduced-motion (CSS).
 */
const GOLDS = ["#F4DEA9", "#E6C887", "#D4B068", "#A8884A", "#FFFFFF"];

export function Confetti({ count = 64 }: { count?: number }) {
  // React 19 purity: Math.random() can't run during render (incl.
  // useMemo / lazy init). Generate the burst once, in an effect.
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    // One-shot post-mount generation. Math.random() can't run during
    // render (React 19 purity), so the effect is the only valid place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPieces(
      Array.from({ length: count }).map((_, i) => ({
        left: Math.random() * 100,
        dx: `${(Math.random() - 0.5) * 220}px`,
        rot: `${360 + Math.random() * 720}deg`,
        dur: `${2.2 + Math.random() * 1.4}s`,
        delay: `${Math.random() * 0.5}s`,
        color: GOLDS[i % GOLDS.length],
        w: 6 + Math.random() * 6,
        key: i,
      })),
    );
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.key}
          className="r26-confetti-piece"
          style={
            {
              left: `${p.left}vw`,
              width: p.w,
              height: p.w * 1.6,
              background: p.color,
              animationDuration: p.dur,
              animationDelay: p.delay,
              "--dx": p.dx,
              "--rot": p.rot,
              "--dur": p.dur,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
