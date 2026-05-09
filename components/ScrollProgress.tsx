"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin gold scroll progress bar — fixed top of the viewport. Hidden on
 * outbound / pre-onboarding pages where it would feel out of place.
 *
 * Implementation note: scrollY is read on `scroll` events with a passive
 * listener and `requestAnimationFrame` debounce so we don't thrash layout.
 * The bar uses `scaleX` instead of `width` because scaleX doesn't trigger
 * layout — the browser composites it on the GPU.
 */

const HIDDEN_PREFIXES = ["/signup", "/rsvp", "/live", "/privacy", "/terms", "/auth"];

export function ScrollProgress() {
  const pathname = usePathname() ?? "/";
  const [scaleX, setScaleX] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const doc = document.documentElement;
      const max = (doc.scrollHeight - doc.clientHeight) || 1;
      const pct = Math.min(1, Math.max(0, doc.scrollTop / max));
      setScaleX(pct);
      raf = 0;
    };
    const onScroll = () => {
      if (raf === 0) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [pathname]);

  // Hidden routes: outbound / public-share pages.
  if (pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-[60] pointer-events-none no-print"
      style={{
        height: 2,
        // The progress fills via transform — scaleX from 0 to 1.
        background: "transparent",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "100%",
          transformOrigin: "right center", // RTL: progress fills right→left
          transform: `scaleX(${scaleX})`,
          background: "linear-gradient(90deg, var(--gold-100) 0%, var(--gold-300) 50%, var(--gold-500) 100%)",
          transition: "transform 80ms linear",
        }}
      />
    </div>
  );
}
