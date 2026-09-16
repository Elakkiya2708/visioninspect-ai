interface BarRow {
  label: string;
  value: number;
  sub?: string;
}

/**
 * Ranked horizontal bars — used for defect-type frequency, where what
 * matters is the ordering and relative size, not precise axis values.
 */
export default function HorizontalBars({ rows, emptyMessage = "No data yet." }: {
  rows: BarRow[];
  emptyMessage?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) {
    return <p className="text-sm text-fg-subtle py-4">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-fg-muted">{r.label}</span>
            <span className="text-xs font-mono font-semibold">
              {r.value}
              {r.sub && <span className="text-fg-subtle font-normal ml-2">{r.sub}</span>}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
