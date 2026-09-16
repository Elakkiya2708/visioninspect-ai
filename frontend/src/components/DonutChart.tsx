interface Slice {
  label: string;
  value: number;
  color: string;
}

/**
 * Hand-rolled SVG donut — no charting library, so nothing extra to
 * install and nothing that can fail to resolve on a fresh npm install.
 * Used for the severity mix, where the whole is meaningful (every
 * defect falls into exactly one severity band).
 */
export default function DonutChart({ slices, centerLabel, centerValue }: {
  slices: Slice[];
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 160;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--c-surface-2))"
            strokeWidth={stroke}
          />
          {total > 0 &&
            slices.map((s) => {
              if (s.value === 0) return null;
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold">{centerValue ?? total}</span>
          {centerLabel && <span className="text-[10px] text-fg-subtle mt-0.5">{centerLabel}</span>}
        </div>
      </div>

      <div className="space-y-2 min-w-0">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-fg-muted">{s.label}</span>
            <span className="font-mono font-semibold ml-auto pl-3">{s.value}</span>
          </div>
        ))}
        {total === 0 && <p className="text-xs text-fg-subtle">No defects recorded yet.</p>}
      </div>
    </div>
  );
}
