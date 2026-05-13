"use client";

import { Printer } from "lucide-react";

/**
 * Triggers the browser's native Print → Save as PDF dialog.
 * Combined with the @media print CSS rules in globals.css, this gives users
 * a clean, branded PDF without any external library or backend.
 */
export function PrintButton({ label = "ייצוא PDF" }: { label?: string }) {
  const onPrint = () => {
    if (typeof window !== "undefined") window.print();
  };
  return (
    <button
      onClick={onPrint}
      className="text-sm rounded-full inline-flex items-center gap-2 px-4 py-2 transition no-print"
      style={{ border: "1px solid var(--border-strong)", color: "var(--foreground-soft)" }}
    >
      <Printer size={14} />
      {label}
    </button>
  );
}
