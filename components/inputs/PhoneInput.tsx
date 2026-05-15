"use client";

/**
 * R18 §L — shared phone input.
 *
 * Fixed "+972" country chip + a local-number field. Emits the raw local
 * string the user typed (callers normalize via lib/phone when they need
 * E.164); the chip is purely a visual anchor so users don't prefix the
 * country code themselves and double it up.
 */
interface PhoneInputProps {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "50-1234567",
  id,
  ariaLabel = "מספר טלפון",
  disabled,
}: PhoneInputProps) {
  return (
    <div
      className="flex items-stretch rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--input-bg)" }}
    >
      <span
        className="flex items-center justify-center px-3 text-sm font-semibold select-none ltr-num"
        style={{ background: "var(--surface-2)", color: "var(--foreground-soft)" }}
        aria-hidden
      >
        +972
      </span>
      <input
        id={id}
        dir="ltr"
        type="tel"
        inputMode="tel"
        disabled={disabled}
        aria-label={ariaLabel}
        className="flex-1 bg-transparent px-3 py-3 text-start ltr-num outline-none disabled:opacity-50"
        style={{ color: "var(--foreground)" }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
