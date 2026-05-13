export function Logo({ className = "", size = 28 }: { className?: string; size?: number }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} dir="ltr">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="lg-gold" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F4DEA9" />
            <stop offset="0.5" stopColor="#D4B068" />
            <stop offset="1" stopColor="#A8884A" />
          </linearGradient>
          <filter id="lg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>
        <path
          d="M4 23 L10 11 L16 19 L22 7 L28 23"
          stroke="url(#lg-gold)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#lg-glow)"
          opacity="0.55"
        />
        <path
          d="M4 23 L10 11 L16 19 L22 7 L28 23"
          stroke="url(#lg-gold)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="28" cy="23" r="1.8" fill="url(#lg-gold)" />
      </svg>
      <span
        className="font-bold tracking-tight"
        style={{ fontSize: size * 0.72, letterSpacing: "-0.02em" }}
      >
        Momentum
      </span>
    </div>
  );
}
