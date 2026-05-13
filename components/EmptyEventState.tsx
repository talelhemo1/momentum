import Link from "next/link";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { Header } from "./Header";

/**
 * R14 — replacement for the silent `router.replace("/onboarding")` that
 * 6 sub-pages used to do when there's no event yet. Showing an explicit
 * empty-state with a CTA tells the user *why* they're being redirected
 * and gives them a clear next action ("צור אירוע") instead of mysteriously
 * landing on onboarding.
 *
 * Caller pattern:
 *   if (hydrated && !state.event) return <EmptyEventState toolName="..." />;
 */
export function EmptyEventState({ toolName }: { toolName: string }) {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center px-5 pb-20">
        <div className="card p-8 text-center max-w-md">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-[--accent]"
            style={{
              background: "rgba(212,176,104,0.10)",
              border: "1px solid var(--border-gold)",
            }}
          >
            <CalendarPlus size={26} aria-hidden />
          </div>
          <h1 className="mt-5 text-xl font-bold">צריך אירוע פעיל קודם</h1>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--foreground-soft)" }}
          >
            כדי להשתמש ב{toolName}, צור קודם אירוע — לוקח פחות משתי דקות.
          </p>
          <Link
            href="/onboarding?gate=ok"
            className="btn-gold mt-6 inline-flex items-center justify-center gap-2"
          >
            צור אירוע
            <ArrowLeft size={14} aria-hidden />
          </Link>
          <Link
            href="/dashboard"
            className="block mt-4 text-xs underline"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    </>
  );
}
