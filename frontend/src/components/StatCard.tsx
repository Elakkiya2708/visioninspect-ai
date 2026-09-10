interface StatCardProps {
  label: string;
  value: string | number;
  accent?: "accent" | "success" | "critical" | "warning" | "info" | "neutral";
  suffix?: string;
}

const ACCENT_MAP: Record<string, string> = {
  accent: "text-accent",
  success: "text-success",
  critical: "text-critical",
  warning: "text-warning",
  info: "text-info",
  neutral: "text-fg",
};

export default function StatCard({ label, value, accent = "neutral", suffix }: StatCardProps) {
  return (
    <div className="bracket-frame card px-5 py-4">
      <p className="label-eyebrow">{label}</p>
      <p className={`font-mono text-2xl font-semibold mt-2 ${ACCENT_MAP[accent]}`}>
        {value}
        {suffix && <span className="text-sm text-fg-subtle ml-1">{suffix}</span>}
      </p>
    </div>
  );
}
