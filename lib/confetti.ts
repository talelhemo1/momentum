"use client";

/**
 * Tiny celebratory confetti burst — pure Canvas2D, no dependencies.
 *
 * Why a custom impl instead of `canvas-confetti` (16kb)? We only need three
 * milestone moments in the whole app, the visual is fully gold/cream (not
 * a rainbow), and we want full control over the start position and
 * duration. The 80-particle physics is good enough.
 *
 * Honors `prefers-reduced-motion`: returns immediately, drawing nothing.
 *
 * The canvas is appended to `document.body` and removed on completion. The
 * caller owns nothing — fire-and-forget.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
}

const COLORS = [
  "#F4DEA9", // gold-100
  "#E6C887", // gold-200
  "#D4B068", // gold-300 / accent
  "#FFFFFF",
  "#FFF4D6", // cream
];

/**
 * Fire a confetti burst. Returns immediately — animation cleans itself up.
 *
 * @param durationMs how long particles keep rendering before the canvas is
 *   removed. Default 1200ms. The particle physics finishes naturally
 *   within ~1500ms regardless.
 */
export function fireConfetti(durationMs: number = 1200): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Honor reduced motion strictly — no flashing for vestibular users.
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:200;";
  canvas.setAttribute("aria-hidden", "true");
  // dpr-aware so it stays crisp on retina without blowing up memory.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  // Spawn from two top corners — feels celebratory like a stadium.
  const PARTICLE_COUNT = 80;
  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? 0 : w,
      y: 0,
      // Initial velocity points inward + upward + a touch of downward gravity later.
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 6),
      vy: -(2 + Math.random() * 4),
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      width: 6 + Math.random() * 6,
      height: 8 + Math.random() * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  const GRAVITY = 0.18;
  const DRAG = 0.99;

  let raf = 0;
  const tick = (t: number) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      // Fade out in the last 25% so the disappearance is gentle.
      const fadeStart = durationMs * 0.75;
      const alpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
    }

    if (elapsed < durationMs + 600) {
      raf = window.requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  };
  raf = window.requestAnimationFrame(tick);
}

/**
 * One-shot guard: fires confetti at most once for a given milestone key
 * (per browser). Used so we don't celebrate every visit.
 *
 * Returns `true` if confetti fired, `false` if it was suppressed.
 */
export function fireConfettiOnce(key: string, durationMs: number = 1200): boolean {
  if (typeof window === "undefined") return false;
  const fullKey = `momentum.confetti.${key}.fired`;
  try {
    if (window.localStorage.getItem(fullKey) === "1") return false;
    window.localStorage.setItem(fullKey, "1");
  } catch {
    // localStorage disabled — fire anyway (better to celebrate twice than not at all).
  }
  fireConfetti(durationMs);
  return true;
}
