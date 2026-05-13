"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Per-navigation template — Next.js mounts this fresh on every route change
 * (unlike layout, which persists). We use it to animate route transitions:
 * the children fade + slide in on each path change.
 *
 * Implementation note: We track the current pathname in state. When it changes
 * (HMR re-mounts can also trigger this), we briefly toggle `key` to retrigger
 * the CSS animation. The `route-fade` class is defined in globals.css.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [animKey, setAnimKey] = useState(0);
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setAnimKey((k) => k + 1);
    }
  }, [pathname]);

  return (
    <div key={animKey} className="route-fade flex-1 flex flex-col">
      {children}
    </div>
  );
}
