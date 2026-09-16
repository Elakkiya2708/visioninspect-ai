import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import RoleBanner from "../components/RoleBanner";
import StatCard from "../components/StatCard";
import DonutChart from "../components/DonutChart";
import HorizontalBars from "../components/HorizontalBars";
import ActivityChart from "../components/ActivityChart";
import { api, AnalyticsOverview, SEVERITY_COLORS } from "../lib/api";

/**
 * Milestone 3 — Manufacturing Analytics Dashboard.
 * Defect trend analysis, severity mix, defect-type distribution and a
 * per-product-line production quality report. Every number here comes
 * from stored inspection results; nothing is simulated.
 */
export default function Analytics() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AnalyticsOverview>("/api/inspection/analytics", { params: { days: 14 } })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sev = data?.severity_distribution;
  const severitySlices = [
    { label: "Critical", value: sev?.critical ?? 0, color: SEVERITY_COLORS.Critical },
    { label: "High", value: sev?.high ?? 0, color: SEVERITY_COLORS.High },
    { label: "Medium", value: sev?.medium ?? 0, color: SEVERITY_COLORS.Medium },
    { label: "Low", value: sev?.low ?? 0, color: SEVERITY_COLORS.Low },
  ];

  return (
    <PageShell section="Analytics">
      <RoleBanner
        eyebrow="Manufacturing Analytics"
        title="Production Quality Insights"
        gradient="from-accent to-indigo-700"
        badge={data ? `${data.total_inspections} inspections analysed` : undefined}
      />

      {loading ? (
        <div className="font-mono text-xs text-fg-subtle tracking-widest animate-pulse py-20 text-center">
          AGGREGATING INSPECTION DATA…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Inspections" value={data?.total_inspections ?? 0} accent="info" />
            <StatCard label="Defects Found" value={data?.total_defects ?? 0} accent="warning" />
            <StatCard label="Avg. Severity" value={data?.avg_severity ?? 0} accent="accent" />
            <StatCard
              label="Reject Rate"
              value={data?.reject_rate_pct != null ? `${data.reject_rate_pct}%` : "—"}
              accent="critical"
            />
          </div>

          <div className="mb-6">
            <ActivityChart
              data={(data?.trend ?? []).map((t) => ({
                date: t.date,
                total: t.defects,
                passed: 0,
                failed: 0,
              }))}
              title="Defect Trend — last 14 days"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="card p-5">
              <p className="label-eyebrow mb-4">Severity Distribution</p>
              <DonutChart slices={severitySlices} centerLabel="defects" />
            </div>

            <div className="card p-5">
              <p className="label-eyebrow mb-4">Defect Type Distribution</p>
              <HorizontalBars
                rows={(data?.defect_types ?? []).map((t) => ({
                  label: t.label,
                  value: t.count,
                  sub: `avg sev ${t.avg_severity}`,
                }))}
                emptyMessage="No classified defects yet — run an inspection to populate this."
              />
            </div>
          </div>

          <p className="label-eyebrow mb-3">Production Quality Report — by Product Line</p>
          {(data?.by_product_line ?? []).length === 0 ? (
            <div className="card px-5 py-8 text-center">
              <p className="text-sm text-fg-subtle">
                No inspections recorded yet. Run a defect inspection to build this report.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="label-eyebrow font-normal px-4 py-3">Product Line</th>
                    <th className="label-eyebrow font-normal px-4 py-3">Inspections</th>
                    <th className="label-eyebrow font-normal px-4 py-3">Passed</th>
                    <th className="label-eyebrow font-normal px-4 py-3">Rework</th>
                    <th className="label-eyebrow font-normal px-4 py-3">Rejected</th>
                    <th className="label-eyebrow font-normal px-4 py-3">Pass Rate</th>
                    <th className="label-eyebrow font-normal px-4 py-3">Avg Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.by_product_line ?? []).map((line) => (
                    <tr key={line.product_line} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium capitalize">{line.product_line}</td>
                      <td className="px-4 py-3 font-mono">{line.inspections}</td>
                      <td className="px-4 py-3 font-mono text-success">{line.passed}</td>
                      <td className="px-4 py-3 font-mono text-warning">{line.rework}</td>
                      <td className="px-4 py-3 font-mono text-critical">{line.rejected}</td>
                      <td className="px-4 py-3 font-mono">
                        {line.pass_rate_pct != null ? `${line.pass_rate_pct}%` : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">{line.avg_severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
