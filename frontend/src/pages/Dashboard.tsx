import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import StatCard from "../components/StatCard";
import ImageCard from "../components/ImageCard";
import { api, ImageStats, ProductImage } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [statsRes, imagesRes] = await Promise.all([
          api.get<ImageStats>("/api/images/stats"),
          api.get<ProductImage[]>("/api/images", {
            params: { limit: 24, ...(statusFilter ? { status_filter: statusFilter } : {}) },
          }),
        ]);
        if (!cancelled) {
          setStats(statsRes.data);
          setImages(imagesRes.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const filters = [
    { value: "", label: "All" },
    { value: "validated", label: "Validated" },
    { value: "uploaded", label: "Uploaded" },
    { value: "rejected", label: "Rejected" },
    { value: "queued_for_inspection", label: "Queued" },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 max-w-[1400px]">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="label-eyebrow mb-1">Inspection Dashboard</p>
            <h1 className="font-display text-2xl font-semibold">Production Overview</h1>
          </div>
          <Link to="/upload" className="btn-primary">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Upload images
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total Images" value={stats?.total_images ?? "—"} accent="neutral" />
          <StatCard label="Validated" value={stats?.validated ?? "—"} accent="success" />
          <StatCard label="Uploaded" value={stats?.uploaded ?? "—"} accent="info" />
          <StatCard label="Rejected" value={stats?.rejected ?? "—"} accent="critical" />
          <StatCard
            label="Storage Used"
            value={stats?.total_storage_mb ?? "—"}
            suffix="MB"
            accent="neutral"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="label-eyebrow">Recent Captures</p>
          <div className="flex items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                  statusFilter === f.value
                    ? "border-accent/50 text-accent bg-accent/10"
                    : "border-border text-fg-subtle hover:text-fg hover:border-border-strong"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="font-mono text-xs text-fg-subtle tracking-widest animate-pulse py-16 text-center">
            LOADING CAPTURE FEED…
          </div>
        ) : images.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-16 text-center">
            <p className="text-fg font-medium mb-1">No images yet</p>
            <p className="text-sm text-fg-subtle mb-5">
              Upload your first product images to start the inspection pipeline.
            </p>
            <Link to="/upload" className="btn-secondary inline-flex">
              Go to Image Acquisition
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img) => (
              <ImageCard key={img.id} image={img} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
