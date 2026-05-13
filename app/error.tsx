"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

/**
 * Route-level error boundary.
 *
 * Next.js App Router automatically wraps every route segment with this
 * boundary — when a render throws or an effect rejects, the user lands here
 * instead of seeing a white screen.
 *
 * The page deliberately depends on NOTHING from `lib/store` or any other
 * stateful code, because the error itself might be in that code path. We keep
 * it pure UI: render a message, offer a recovery action, log the error so
 * the developer can see what blew up.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the underlying error to whoever is monitoring (DevTools console
    // in development, observability stack in production).
    // We don't ship Sentry yet — when it lands, this is the wire-up point.
    console.error("[momentum/route-error]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-5 relative overflow-hidden">
      <div
        aria-hidden
        className="glow-orb glow-orb-gold w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-25"
      />

      <div className="relative z-10 max-w-md w-full">
        <div className="card-gold p-8 text-center">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-red-300"
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}
          >
            <AlertCircle size={26} />
          </div>

          <h1 className="mt-5 text-2xl font-bold gradient-text">משהו השתבש</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
            המסך נתקל בשגיאה לא צפויה. הנתונים שלך לא אבדו — הם שמורים בדפדפן.
          </p>

          {error.digest && (
            <p
              className="mt-4 text-[11px] font-mono ltr-num"
              style={{ color: "var(--foreground-muted)" }}
            >
              קוד שגיאה: {error.digest}
            </p>
          )}

          <div className="mt-7 grid grid-cols-1 gap-2.5">
            <button
              onClick={reset}
              className="btn-gold inline-flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} /> נסה שוב
            </button>
            <Link
              href="/dashboard"
              className="btn-secondary inline-flex items-center justify-center gap-2"
            >
              <Home size={16} /> חזרה למסע
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
