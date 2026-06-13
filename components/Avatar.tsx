/**
 * Deterministic gradient avatar.
 *
 * Without an `id`: falls back to the existing gold gradient (host avatars,
 * generic initials).
 * With an `id`: hashes (FNV-1a) → picks one of 12 calibrated dark-friendly
 * gradients. Same id always renders the same gradient — useful for guests
 * and vendors so the dashboard feels alive without random colors flickering
 * between renders.
 *
 * RTL-aware: the first letter is rendered LTR-stable so a name starting with
 * Latin or Hebrew both center correctly.
 */

interface AvatarProps {
  name: string;
  /** Stable identifier; without it we use the gold fallback gradient. */
  id?: string;
  /** Pixel size, default 40. */
  size?: number;
  /** Override class for ring/border behaviors per surface. */
  className?: string;
  /**
   * R102 — optional presence dot in the corner. Omit for no dot.
   * Colors map to the semantic status tokens.
   */
  status?: "online" | "busy" | "away";
}

// R102 — semantic dot colors for the optional presence indicator.
const STATUS_COLOR: Record<NonNullable<AvatarProps["status"]>, string> = {
  online: "var(--success)",
  busy: "var(--error)",
  away: "var(--warning)",
};

const GRADIENTS: Array<[string, string]> = [
  // Each pair is [from, to] for a 135deg linear-gradient. Picked to read on
  // dark backgrounds (each is at least 30% saturation, ≥ 60% lightness).
  ["#F4DEA9", "#A8884A"], // gold (also the fallback)
  ["#F8B4D9", "#9C2671"], // rose
  ["#A6E3F4", "#1F6FA0"], // sky
  ["#C4B5FD", "#5B21B6"], // violet
  ["#A7F3D0", "#047857"], // mint
  ["#FCD34D", "#B45309"], // amber
  ["#FDA4AF", "#9F1239"], // crimson
  ["#93C5FD", "#1E3A8A"], // indigo
  ["#FBA74F", "#7C2D12"], // rust
  ["#86EFAC", "#14532D"], // forest
  ["#F0ABFC", "#701A75"], // fuchsia
  ["#A5F3FC", "#0E7490"], // cyan
];

const FALLBACK = GRADIENTS[0];

/** FNV-1a 32-bit. Tiny, fast, well-distributed for short strings. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h;
}

export function Avatar({ name, id, size = 40, className = "", status }: AvatarProps) {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  const [from, to] = id ? GRADIENTS[hash(id) % GRADIENTS.length] : FALLBACK;
  const fontSize = Math.max(11, Math.round(size * 0.42));
  // R102 — dot scales with the avatar (≈28% of size), min 8px.
  const dotSize = Math.max(8, Math.round(size * 0.28));
  return (
    <span
      role="img"
      aria-label={name ? `אווטר של ${name}` : "אווטר"}
      className={`relative inline-flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-pill)",
        background: `linear-gradient(135deg, ${from}, ${to})`,
        color: "rgba(0,0,0,0.85)",
        fontSize,
        lineHeight: 1,
        // R102 — a hairline inset ring + top sheen so the avatar keeps its
        // edge on a gold card (where it used to melt into the background)
        // and reads as a lit, raised token.
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    >
      {initial}
      {status && (
        <span
          aria-hidden
          className="absolute"
          style={{
            width: dotSize,
            height: dotSize,
            // Bottom-left in RTL reads as the "start" corner.
            insetInlineStart: 0,
            bottom: 0,
            borderRadius: "var(--radius-pill)",
            background: STATUS_COLOR[status],
            boxShadow: "0 0 0 2px var(--surface)",
          }}
        />
      )}
    </span>
  );
}
