interface IconStatProps {
  label: string;
  value: string | number;
  tone: "accent" | "success" | "critical" | "warning" | "info";
  icon: "check" | "cross" | "chart" | "image" | "trend";
}

const TONE_CLASSES: Record<string, string> = {
  accent: "bg-accent/12 text-accent",
  success: "bg-success/12 text-success",
  critical: "bg-critical/12 text-critical",
  warning: "bg-warning/12 text-warning",
  info: "bg-info/12 text-info",
};

function IconGlyph({ name }: { name: IconStatProps["icon"] }) {
  if (name === "check") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5l3 3 7-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "cross") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13.5V9M6 13.5V5.5M10 13.5V7M14 13.5V2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "trend") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 11l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 4h3.5v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
      <path d="M3 11l3-3 2 2 3.5-3.5L14 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A richer stat presentation than the plain StatCard — a colored circular
 * icon badge alongside the number. Used on the Profile page to visually
 * separate "your personal activity" from the Dashboard's flat system-wide
 * StatCards.
 */
export default function IconStat({ label, value, tone, icon }: IconStatProps) {
  return (
    <div className="card px-4 py-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
        <IconGlyph name={icon} />
      </div>
      <div className="min-w-0">
        <p className="label-eyebrow truncate">{label}</p>
        <p className="font-mono text-lg font-semibold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
