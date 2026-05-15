"use client";

/**
 * R18 §L — shared money input.
 *
 * Fixed "₪" prefix, thousands-separated placeholder, and a parser that
 * strips commas/spaces so callers always receive a clean numeric string.
 * Replaces the half-dozen ad-hoc `inputMode="numeric"` + manual ₪ markup
 * scattered across budget / quote / pricing screens.
 */
interface MoneyInputProps {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  /** Passed straight through for a11y / forms. */
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

/** Strip everything that isn't a digit or a decimal point. */
export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function MoneyInput({
  value,
  onChange,
  placeholder = "12,500",
  id,
  ariaLabel = "סכום בשקלים",
  disabled,
}: MoneyInputProps) {
  return (
    <div
      className="flex items-stretch rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--input-bg)" }}
    >
      <span
        className="flex items-center justify-center px-3 text-lg font-bold select-none"
        style={{ background: "var(--surface-2)", color: "var(--accent)" }}
        aria-hidden
      >
        ₪
      </span>
      <input
        id={id}
        dir="ltr"
        inputMode="decimal"
        type="text"
        disabled={disabled}
        aria-label={ariaLabel}
        className="flex-1 bg-transparent px-3 py-3 text-lg text-start ltr-num outline-none disabled:opacity-50"
        style={{ color: "var(--foreground)" }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          // Keep digits, commas (visual), spaces and a single dot — the
          // caller can run parseMoney() when it needs the number.
          const v = e.target.value.replace(/[^\d.,\s]/g, "");
          onChange(v);
        }}
      />
    </div>
  );
}
