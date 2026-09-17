interface StatCardProps {
  label: string;
  value: string | number;
  accent?: "accent" | "success" | "critical" | "warning" | "info" | "purple" | "pink" | "teal" | "neutral";
  suffix?: string;
}

const TEXT_MAP: Record<string, string> = {
  accent: "text-accent",
  success: "text-success",
  critical: "text-critical",
  warning: "text-warning",
  info: "text-info",
  purple: "text-purple-500 dark:text-purple-400",
  pink: "text-pink-500 dark:text-pink-400",
  teal: "text-teal-500 dark:text-teal-400",
  neutral: "text-fg",
};

// Literal class strings (not interpolated) so Tailwind's scanner picks
// them up — a colored top edge gives each card an identity at a glance
// even before reading the number.
const BAR_MAP: Record<string, string> = {
  accent: "bg-accent",
  success: "bg-success",
  critical: "bg-critical",
  warning: "bg-warning",
  info: "bg-info",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
  neutral: "bg-border-strong",
};

export default function StatCard({ label, value, accent = "neutral", suffix }: StatCardProps) {
  return (
    <div className="bracket-frame card overflow-hidden">
      <div className={`h-1 w-full ${BAR_MAP[accent]}`} />
      <div className="px-5 py-4">
        <p className="label-eyebrow">{label}</p>
        <p className={`font-mono text-2xl font-semibold mt-2 ${TEXT_MAP[accent]}`}>
          {value}
          {suffix && <span className="text-sm text-fg-subtle ml-1">{suffix}</span>}
        </p>
      </div>
    </div>
  );
}
