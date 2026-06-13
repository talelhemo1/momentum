/**
 * R102 — Centralised motion language.
 *
 * One source of truth for easing curves, durations and the handful of
 * reusable Framer Motion variant sets the app leans on. Keeping them here
 * (mirrored by the --ease-* / --duration-* CSS tokens in globals.css) means
 * every animated surface shares the same signature curve instead of each
 * component inventing its own `transition={{ duration: 0.3 }}`.
 *
 * Usage:
 *   import { transitions, durations, easings } from "@/lib/motion";
 *   <motion.div variants={transitions.fadeUp} initial="hidden" animate="visible" />
 *   <motion.ul  variants={transitions.stagger} initial="hidden" animate="visible" />
 *
 * Accessibility: pair with Framer's `useReducedMotion()` and pass the result
 * to `maybe()` so animations collapse to instant for users who ask for it —
 * the established pattern in this codebase.
 */
import type { Transition, Variants } from "framer-motion";

// Cubic-bezier definitions. `out` is the expressive settle curve used for
// almost everything entering the screen; `inOut` is symmetric for motion
// that reverses; `spring` adds a gentle overshoot for playful accents.
export type Bezier = [number, number, number, number];

export const easings = {
  out: [0.16, 1, 0.3, 1] as Bezier,
  inOut: [0.65, 0, 0.35, 1] as Bezier,
  spring: [0.34, 1.56, 0.64, 1] as Bezier,
} as const;

// Seconds (Framer Motion's unit). Mirrors --duration-* (ms) in globals.css.
export const durations = {
  fast: 0.15,
  base: 0.22,
  slow: 0.38,
  story: 0.6,
} as const;

/** Base transition for entering content — the app's default "settle". */
export const baseTransition: Transition = {
  duration: durations.slow,
  ease: easings.out,
};

/**
 * Reusable variant sets. Each exposes `hidden` + `visible` so they can be
 * driven with `initial="hidden"` + `animate="visible"` (or `whileInView`).
 */
export const transitions = {
  /** Content rising into place — cards, sections, hero copy. */
  fadeUp: {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: durations.slow, ease: easings.out },
    },
  } satisfies Variants,

  /** Container that reveals children one after another. */
  stagger: {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
  } satisfies Variants,

  /** A single staggered child — use inside a `stagger` container. */
  staggerChild: {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: durations.base, ease: easings.out },
    },
  } satisfies Variants,

  /** Modal/dialog content scaling up from slightly small. */
  scaleIn: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: durations.base, ease: easings.out },
    },
    exit: {
      opacity: 0,
      scale: 0.97,
      transition: { duration: durations.fast, ease: easings.inOut },
    },
  } satisfies Variants,

  /** Mobile bottom-sheet sliding up from the bottom edge. */
  sheetUp: {
    hidden: { y: "100%" },
    visible: {
      y: 0,
      transition: { duration: durations.slow, ease: easings.out },
    },
    exit: {
      y: "100%",
      transition: { duration: durations.base, ease: easings.inOut },
    },
  } satisfies Variants,

  /** Backdrop fade for overlays. */
  backdrop: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: durations.base } },
    exit: { opacity: 0, transition: { duration: durations.fast } },
  } satisfies Variants,
} as const;

/**
 * Collapse a variant set to instant when the user prefers reduced motion.
 * Returns the variants unchanged otherwise. Keeps call sites a one-liner:
 *
 *   const reduce = useReducedMotion();
 *   <motion.div variants={maybe(reduce, transitions.fadeUp)} ... />
 */
export function maybe(prefersReduced: boolean | null, variants: Variants): Variants {
  if (!prefersReduced) return variants;
  // Strip transforms + transitions so the element simply appears.
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0 } },
    exit: { opacity: 0, transition: { duration: 0 } },
  };
}

/** Shared `whileInView` viewport config — animate once, a bit before fully on-screen. */
export const viewportOnce = { once: true, margin: "0px 0px -12% 0px" } as const;
