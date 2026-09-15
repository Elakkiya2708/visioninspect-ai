import { DailyActivity } from "../lib/api";

interface ActivityChartProps {
  data: DailyActivity[];
  title?: string;
}

/**
 * A small hand-rolled SVG line/area chart — no charting library dependency
 * (keeps the frontend install lightweight and avoids another npm package
 * that could fail to resolve). Plots total inspections per day, with the
 * pass/fail split shown underneath as a thin stacked bar per day.
 */
export default function ActivityChart({ data, title = "Inspection Activity" }: ActivityChartProps) {
  const width = 720;
  const height = 160;
  const padding = { top: 12, right: 12, bottom: 22, left: 28 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxValue = Math.max(1, ...data.map((d) => d.total));
  const hasActivity = data.some((d) => d.total > 0);

  const points = data.map((d, i) => {
    const x = padding.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
    const y = padding.top + innerH - (d.total / maxValue) * innerH;
    return { x, y, d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`
      : "";

  // Show at most 5 date labels along the x-axis so they don't overlap.
  const labelStep = Math.max(1, Math.ceil(data.length / 5));

  return (
    <div className="card p-4">
      <p className="label-eyebrow mb-2">{title}</p>
      {!hasActivity ? (
        <div className="h-32 flex items-center justify-center text-sm text-fg-subtle">
          No inspections in this period yet.
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--c-accent))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(var(--c-accent))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal gridlines */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + innerH * f}
              y2={padding.top + innerH * f}
              stroke="rgb(var(--c-border))"
              strokeWidth="1"
            />
          ))}

          <path d={areaPath} fill="url(#activityFill)" />
          <path d={linePath} fill="none" stroke="rgb(var(--c-accent))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) =>
            p.d.total > 0 ? <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="rgb(var(--c-accent))" /> : null
          )}

          {points
            .filter((_, i) => i % labelStep === 0)
            .map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={height - 4}
                fontSize="9"
                textAnchor="middle"
                fill="rgb(var(--c-fg-subtle))"
                fontFamily="'JetBrains Mono', monospace"
              >
                {p.d.date.slice(5)}
              </text>
            ))}
        </svg>
      )}
    </div>
  );
}
