interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  onDark?: boolean;
}

/**
 * Brand mark: a viewfinder frame with two open corners — the same
 * bounding-box motif used throughout the product to highlight a
 * detected object.
 */
export default function Logo({ size = 22, showWordmark = true, onDark = false }: LogoProps) {
  const wordmarkClass = onDark ? "text-sidebar-fg-active" : "text-fg";
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M3 8V4.5A1.5 1.5 0 014.5 3H8" stroke="rgb(var(--c-accent))" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M21 8V4.5A1.5 1.5 0 0019.5 3H16" stroke="rgb(var(--c-accent))" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 16v3.5A1.5 1.5 0 004.5 21H8" stroke="rgb(var(--c-accent))" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M21 16v3.5a1.5 1.5 0 01-1.5 1.5H16" stroke="rgb(var(--c-accent))" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3.1" className={wordmarkClass} stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {showWordmark && (
        <span className={`font-display font-semibold text-[15px] tracking-tight ${wordmarkClass}`}>
          VisionInspect <span className="text-accent">AI</span>
        </span>
      )}
    </div>
  );
}
