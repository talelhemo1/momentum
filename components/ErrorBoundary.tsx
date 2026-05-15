"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * R15 §3G — component-level error boundary.
 *
 * Next.js App Router already wraps every *route* with `app/error.tsx`,
 * but that's all-or-nothing: one throwing component blanks the whole
 * page. This boundary is finer-grained — wrap just the main content of a
 * page with it so that if (say) a single card or the vendor grid throws,
 * the surrounding chrome (header, nav) stays alive and the user gets a
 * scoped "this section failed" panel with a retry, instead of the entire
 * route falling back to the error screen.
 *
 * React only triggers error boundaries via a class component's
 * `getDerivedStateFromError` / `componentDidCatch`. There is no hook
 * equivalent, so this stays a class on purpose.
 */
interface Props {
  children: ReactNode;
  /** Optional label so the recovery panel can say which section failed. */
  section?: string;
  /** Override the default fallback entirely if a caller needs custom UI. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Same tag as app/error.tsx so support can give one instruction:
    // "send a screenshot of the [momentum/error-boundary] line".
    console.error(
      "[momentum/error-boundary]",
      this.props.section ?? "(unnamed section)",
      error,
      info.componentStack,
    );
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="max-w-md mx-auto my-16 px-5">
        <div className="card-gold p-8 text-center">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-red-300"
            style={{
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.3)",
            }}
          >
            <AlertCircle size={26} aria-hidden />
          </div>
          <h2 className="mt-5 text-xl font-bold gradient-text">
            המקטע הזה נתקל בשגיאה
          </h2>
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--foreground-soft)" }}
          >
            שאר העמוד עובד כרגיל. הנתונים שלך שמורים. אפשר לנסות לטעון את
            המקטע מחדש.
          </p>
          <button
            onClick={this.reset}
            className="btn-gold mt-6 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} aria-hidden /> נסה שוב
          </button>
        </div>
      </div>
    );
  }
}
