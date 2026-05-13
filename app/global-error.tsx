"use client";

import { useEffect } from "react";

/**
 * Top-level error boundary — catches errors that propagate above the root
 * layout (errors in `app/layout.tsx` itself, font loading failures, etc.).
 *
 * Next.js mounts this OUTSIDE `<RootLayout>`, so it must render its own
 * `<html>` and `<body>` tags. We keep the markup minimal: no fonts, no
 * imports from `lib/`, no theme variables — anything that touches the rest
 * of the app could rethrow.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[momentum/global-error]", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0B",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            textAlign: "center",
            padding: "2rem",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "1rem",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            תקלה כללית
          </h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
            לא הצלחנו לטעון את האפליקציה. רענן את הדף ונסה שוב.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.4)",
                marginTop: "1rem",
                fontFamily: "monospace",
                direction: "ltr",
              }}
            >
              {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "linear-gradient(135deg,#F4DEA9,#A8884A)",
              color: "#000",
              fontWeight: 700,
              padding: "0.75rem 1.5rem",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            רענן
          </button>
        </div>
      </body>
    </html>
  );
}
