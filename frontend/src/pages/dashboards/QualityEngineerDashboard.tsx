import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RoleBanner from "../../components/RoleBanner";
import IconStat from "../../components/IconStat";
import ImageCard from "../../components/ImageCard";
import ProgressBar from "../../components/ProgressBar";
import { api, ProductImage, UserStats } from "../../lib/api";

/**
 * Personal-activity focused — a Quality Engineer's job is to upload and
 * inspect product images, so this dashboard leads with their own numbers
 * (via /api/auth/me/stats, scoped to this account) and their own recent
 * uploads, not the whole factory's totals.
 */
export default function QualityEngineerDashboard() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [myImages, setMyImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<UserStats>("/api/auth/me/stats"),
      api.get<ProductImage[]>("/api/images", { params: { mine: true, limit: 8 } }),
    ])
      .then(([statsRes, imagesRes]) => {
        if (cancelled) return;
        setStats(statsRes.data);
        setMyImages(imagesRes.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <RoleBanner
        eyebrow="Quality Engineer"
        title="Your Inspection Workspace"
        gradient="from-accent to-teal-600"
        badge={stats?.pass_rate_pct != null ? `${stats.pass_rate_pct}% pass rate` : undefined}
      />

      {loading ? (
        <div className="font-mono text-xs text-fg-subtle tracking-widest animate-pulse py-16 text-center">
          LOADING YOUR ACTIVITY…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <IconStat label="Images Uploaded" value={stats?.total_images ?? 0} tone="accent" icon="image" />
            <IconStat label="Validated" value={stats?.validated_images ?? 0} tone="success" icon="check" />
            <IconStat label="Inspections Run" value={stats?.total_inspections ?? 0} tone="info" icon="chart" />
            <IconStat
              label="Your Pass Rate"
              value={stats?.pass_rate_pct != null ? `${stats.pass_rate_pct}%` : "—"}
              tone="accent"
              icon="trend"
            />
          </div>

          <div className="card p-4 mb-8 max-w-md space-y-4">
            <p className="label-eyebrow">Your Rate Overview</p>
            <ProgressBar label="Pass Rate" valuePct={stats?.pass_rate_pct ?? null} tone="success" />
            <ProgressBar
              label="Validation Rate"
              valuePct={
                stats && stats.total_images > 0 ? (stats.validated_images / stats.total_images) * 100 : null
              }
              tone="info"
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="label-eyebrow">Your Recent Uploads</p>
            <div className="flex gap-2">
              <Link to="/upload" className="btn-secondary !text-xs !px-3 !py-1.5">
                Upload images
              </Link>
              <Link to="/inspect" className="btn-primary !text-xs !px-3 !py-1.5">
                Run inspection
              </Link>
            </div>
          </div>

          {myImages.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg py-16 text-center">
              <p className="text-fg font-medium mb-1">You haven't uploaded any images yet</p>
              <p className="text-sm text-fg-subtle mb-5">Start the inspection pipeline with your first upload.</p>
              <Link to="/upload" className="btn-secondary inline-flex">
                Go to Image Acquisition
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {myImages.map((img) => (
                <ImageCard key={img.id} image={img} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
