import { useId } from "react";

/**
 * Jobia logo: a friendly robot head on the brand gradient, plus the wordmark.
 * Pure SVG (sharp at any size, no network request). Keep in sync with app/icon.svg.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false" className="logo-mark">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5bf6" />
          <stop offset=".6" stopColor="#a855f7" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}g)`} />
      <line x1="20" y1="6.5" x2="20" y2="11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle className="logo-antenna" cx="20" cy="6" r="2.4" fill="#fbbf24" />
      <rect x="8.5" y="11.5" width="23" height="19" rx="7" fill="#fff" />
      <rect x="11.5" y="14.5" width="17" height="12" rx="5" fill="#0f1530" />
      <circle className="logo-eye" cx="16.5" cy="20" r="2.2" fill="#67e8f9" />
      <circle className="logo-eye" cx="23.5" cy="20" r="2.2" fill="#67e8f9" />
      <path d="M17.5 23.6 Q20 25.4 22.5 23.6" fill="none" stroke="#67e8f9" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">
        Job<span className="gradient-text">ia</span>
      </span>
    </span>
  );
}
