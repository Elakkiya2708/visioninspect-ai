import { useEffect, useState } from "react";
import StatCard from "./StatCard";
import ActivityChart from "./ActivityChart";
import ProgressBar from "./ProgressBar";
import { api, DailyActivity, DefectPrediction, ImageStats, InspectionStats } from "../lib/api";

const VERDICT_DOT: Record<string, string> = {
  pass: "bg-success",
  fail: "bg-critical",
  inconclusive: "bg-warning",
};

/**
 * System-wide production health: shared by the Factory Supervisor and
 * Production Manager dashboards (both need "how is the whole floor
 * doing", not just their own activity — that's the Quality Engineer
 * dashboard's job).
 */
export default function FactoryOverview() {
  const [imageStats, setImageStats] = useState<ImageStats | null>(null);
  const [inspectionStats, setInspectionStats] = useState<InspectionStats | null>(null);
  const [predictions, setPredictions] = useState<DefectPrediction[]>([]);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<ImageStats>("/api/images/stats"),
      api.get<InspectionStats>("/api/inspection/stats"),
      api.get<DefectPrediction[]>("/api/inspection/predictions", { params: { limit: 6 } }),
      api.get<DailyActivity[]>("/api/inspection/activity", { params: { days: 14 } }),
    ])
      .then(([imgRes, insRes, predRes, activityRes]) => {
        if (cancelled) return;
        setImageStats(imgRes.data);
        setInspectionStats(insRes.data);
        setPredictions(predRes.data);
        setActivity(activityRes.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="font-mono text-xs text-fg-subtle tracking-widest animate-pulse py-16 text-center">
        LOADING FACTORY DATA…
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Images" value={imageStats?.total_images ?? "—"} accent="teal" />
        <StatCard label="Validated" value={imageStats?.validated ?? "—"} accent="success" />
        <StatCard label="Rejected" value={imageStats?.rejected ?? "—"} accent="critical" />
        <StatCard label="Inspections Run" value={inspectionStats?.total_inspections ?? "—"} accent="purple" />
        <StatCard
          label="Team Pass Rate"
          value={inspectionStats?.pass_rate_pct != null ? `${inspectionStats.pass_rate_pct}%` : "—"}
          accent="accent"
        />
        <StatCard
          label="Avg. Similarity"
          value={inspectionStats?.avg_similarity_pct != null ? `${inspectionStats.avg_similarity_pct}%` : "—"}
          accent="pink"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 mb-8">
        <ActivityChart data={activity} title="Inspection Activity — last 14 days" />
        <div className="card p-4 space-y-4">
          <p className="label-eyebrow">Rate Overview</p>
          <ProgressBar label="Team Pass Rate" valuePct={inspectionStats?.pass_rate_pct ?? null} tone="success" />
          <ProgressBar label="Avg. Similarity" valuePct={inspectionStats?.avg_similarity_pct ?? null} tone="accent" />
          <ProgressBar
            label="Validation Rate"
            valuePct={
              imageStats && imageStats.total_images > 0
                ? (imageStats.validated / imageStats.total_images) * 100
                : null
            }
            tone="info"
          />
        </div>
      </div>

      <p className="label-eyebrow mb-3">Recent Team Inspections</p>
      {predictions.length === 0 ? (
        <p className="text-sm text-fg-subtle mb-8">No inspections have been run yet.</p>
      ) : (
        <div className="card overflow-hidden mb-8">
          {predictions.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${VERDICT_DOT[p.verdict] || "bg-fg-subtle"}`} />
                <span className="text-sm font-medium capitalize">{p.verdict}</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-fg-muted">
                <span>{(p.similarity_score * 100).toFixed(1)}% similar</span>
                <span>
                  {p.defect_count} defect{p.defect_count === 1 ? "" : "s"}
                </span>
                <span>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
