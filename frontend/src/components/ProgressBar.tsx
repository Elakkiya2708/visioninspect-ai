interface ProgressBarProps {
  label: string;
  valuePct: number | null; // 0-100, or null when there's no data yet
  tone?: "accent" | "success" | "info" | "warning";
}

const TONE_BAR: Record<string, string> = {
  accent: "bg-accent",
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
};

/** A labeled horizontal progress bar — used for rate-style metrics
 * (pass rate, similarity) where seeing the fill visually adds something
 * a bare number doesn't. */
export default function ProgressBar({ label, valuePct, tone = "accent" }: ProgressBarProps) {
  const pct = valuePct == null ? 0 : Math.max(0, Math.min(100, valuePct));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="text-xs font-mono font-semibold">{valuePct != null ? `${valuePct.toFixed(2)}%` : "—"}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${TONE_BAR[tone]} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
