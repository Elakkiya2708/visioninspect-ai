import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RoleBanner from "../../components/RoleBanner";
import FactoryOverview from "../../components/FactoryOverview";
import { api, User, UserRole } from "../../lib/api";

const ROLE_LABELS: Record<UserRole, string> = {
  quality_engineer: "Quality Engineers",
  factory_supervisor: "Factory Supervisors",
  production_manager: "Production Managers",
  admin: "Admins",
};

/**
 * Everything the Supervisor dashboard has, plus team composition and
 * direct access to role management — the one capability that's
 * genuinely exclusive to this role (and Admin).
 */
export default function ManagerDashboard() {
  const [roleCounts, setRoleCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<User[]>("/api/auth/users")
      .then((res) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        res.data.forEach((u) => {
          counts[u.role] = (counts[u.role] || 0) + 1;
        });
        setRoleCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setRoleCounts({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <RoleBanner
        eyebrow="Production Manager"
        title="Manager Console"
        gradient="from-accent to-purple-700"
        badge="Full Access"
      />

      <FactoryOverview />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="label-eyebrow mb-3">Team Composition</p>
          {roleCounts === null ? (
            <p className="text-sm text-fg-subtle">Loading…</p>
          ) : (
            <div className="space-y-2.5">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                <div key={role} className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">{ROLE_LABELS[role]}</span>
                  <span className="font-mono font-semibold">{roleCounts[role] || 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card px-5 py-5 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium mb-1">User role management</p>
            <p className="text-xs text-fg-subtle">
              Reassign any account's role — Quality Engineer, Factory Supervisor, Production Manager, or Admin.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <Link to="/users" className="btn-primary !text-xs !px-3 !py-1.5">
              Manage roles →
            </Link>
            <Link to="/analytics" className="btn-secondary !text-xs !px-3 !py-1.5">
              Analytics →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
