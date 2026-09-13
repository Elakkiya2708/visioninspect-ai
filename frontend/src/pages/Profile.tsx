import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import IconStat from "../components/IconStat";
import { useAuth } from "../context/AuthContext";
import { api, UserStats } from "../lib/api";

const ROLE_LABELS: Record<string, string> = {
  quality_engineer: "Quality Engineer",
  factory_supervisor: "Factory Supervisor",
  production_manager: "Production Manager",
  admin: "Admin",
};

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<UserStats>("/api/auth/me/stats")
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initial = user?.full_name?.trim()?.[0]?.toUpperCase() || "?";
  const joined = user ? new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 max-w-[1100px]">
        <p className="label-eyebrow mb-1">Account</p>
        <h1 className="font-display text-2xl font-semibold mb-6">My Profile</h1>

        {/* Signature banner — the one deliberately richer moment in the UI,
            reserved for this page only so it reads as an accent rather
            than a pattern repeated everywhere. */}
        <div className="rounded-xl bg-gradient-to-r from-accent to-indigo-700 px-6 py-5 mb-6 flex items-center justify-between text-white">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.14em] text-white/70">
              {user ? ROLE_LABELS[user.role] : ""}
            </p>
            <p className="font-display text-lg font-semibold mt-0.5">Manage your account & activity</p>
          </div>
          <span className="text-xs font-medium bg-white/15 border border-white/25 rounded-full px-3 py-1.5 whitespace-nowrap">
            {user?.is_active ? "Active Account" : "Inactive"}
          </span>
        </div>

        <div className="card p-5 mb-8 flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-indigo-700 text-white flex items-center justify-center font-display text-xl font-semibold shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-base">{user?.full_name}</p>
            <p className="text-sm text-fg-muted">{user?.email}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-medium bg-accent/10 text-accent border border-accent/25 rounded-full px-3 py-1.5">
              {user ? ROLE_LABELS[user.role] : ""}
            </span>
            {user?.department && (
              <span className="text-xs font-medium bg-surface-2 text-fg-muted border border-border rounded-full px-3 py-1.5">
                {user.department}
              </span>
            )}
            <span className="text-xs font-medium bg-success/10 text-success border border-success/25 rounded-full px-3 py-1.5">
              Joined {joined}
            </span>
          </div>
        </div>

        <p className="label-eyebrow mb-3">Your Inspection Activity</p>
        <p className="text-sm text-fg-subtle mb-4 -mt-2">
          Scoped to images you've uploaded and inspections you've run — not the whole team's.
        </p>

        {loading ? (
          <div className="font-mono text-xs text-fg-subtle tracking-widest animate-pulse py-10 text-center">
            LOADING YOUR ACTIVITY…
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IconStat label="Images Uploaded" value={stats?.total_images ?? 0} tone="accent" icon="image" />
            <IconStat label="Validated" value={stats?.validated_images ?? 0} tone="success" icon="check" />
            <IconStat label="Rejected" value={stats?.rejected_images ?? 0} tone="critical" icon="cross" />
            <IconStat label="Inspections Run" value={stats?.total_inspections ?? 0} tone="info" icon="chart" />
            <IconStat label="Passed" value={stats?.passed_inspections ?? 0} tone="success" icon="check" />
            <IconStat label="Failed" value={stats?.failed_inspections ?? 0} tone="critical" icon="cross" />
            <IconStat
              label="Your Pass Rate"
              value={stats?.pass_rate_pct != null ? `${stats.pass_rate_pct}%` : "—"}
              tone="accent"
              icon="trend"
            />
          </div>
        )}
      </main>
    </div>
  );
}
