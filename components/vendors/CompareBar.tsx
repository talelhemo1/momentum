"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Trophy, ArrowRight, Heart } from "lucide-react";

interface CompareBarProps {
  count: number;
}
interface SelectedBarProps {
  count: number;
}

const SLIDE_TRANSITION = { type: "spring" as const, stiffness: 380, damping: 32 };

export function CompareBar({ count }: CompareBarProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      key="compare-bar"
      initial={reducedMotion ? false : { y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reducedMotion ? undefined : { y: 80, opacity: 0 }}
      transition={SLIDE_TRANSITION}
      className="glass-strong rounded-full flex items-center justify-between px-3 py-2 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7)]"
      style={{ border: "1px solid var(--border-gold)" }}
      role="region"
      aria-label="ספקים בהשוואה"
    >
      <div className="flex items-center gap-3 px-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ltr-num"
          style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border-gold)" }}
          aria-hidden
        >
          {count}
        </div>
        <div className="text-sm">
          <div className="font-semibold">ספקים בהשוואה</div>
          <div className="text-xs" style={{ color: "var(--foreground-muted)" }}>בחר עד 3 לראות זה לצד זה</div>
        </div>
      </div>
      <Link
        href="/compare"
        className="rounded-full text-sm py-2 px-5 inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-gold)", color: "var(--accent)" }}
        aria-label="פתח עמוד השוואת ספקים"
      >
        פתח השוואה
        <Trophy size={14} aria-hidden />
      </Link>
    </motion.div>
  );
}

export function SelectedBar({ count }: SelectedBarProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      key="selected-bar"
      initial={reducedMotion ? false : { y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reducedMotion ? undefined : { y: 80, opacity: 0 }}
      transition={SLIDE_TRANSITION}
      className="glass-strong rounded-full flex items-center justify-between px-3 py-2 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7)] border border-white/15"
      role="region"
      aria-label="ספקים שמורים"
    >
      <div className="flex items-center gap-3 px-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F4DEA9] to-[#A8884A] text-black flex items-center justify-center font-bold text-sm ltr-num" aria-hidden>
          {count}
        </div>
        <div className="text-sm">
          <div className="font-semibold inline-flex items-center gap-1.5">
            <Heart size={12} className="text-[--accent]" fill="currentColor" aria-hidden />
            ספקים נבחרו
          </div>
          <div className="text-xs text-white/55">המשך לתקציב כדי לבדוק את העלות</div>
        </div>
      </div>
      <Link
        href="/budget"
        className="btn-gold text-sm py-2 px-5 inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]"
        aria-label="המשך לעמוד התקציב"
      >
        המשך לתקציב
        <ArrowRight size={14} aria-hidden />
      </Link>
    </motion.div>
  );
}
