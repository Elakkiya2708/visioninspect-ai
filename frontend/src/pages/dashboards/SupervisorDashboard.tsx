import { Link } from "react-router-dom";
import RoleBanner from "../../components/RoleBanner";
import FactoryOverview from "../../components/FactoryOverview";

/**
 * Floor-wide health, not personal activity — a Factory Supervisor cares
 * about "how is the whole production line doing today", plus a way to
 * see who's on the team (read-only; only a Production Manager can edit
 * roles, enforced both here in the link's destination and by the
 * backend on the User Management page itself).
 */
export default function SupervisorDashboard() {
  return (
    <>
      <RoleBanner
        eyebrow="Factory Supervisor"
        title="Factory Overview"
        gradient="from-indigo-600 to-accent"
        badge="Live"
      />

      <FactoryOverview />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Team accounts</p>
            <p className="text-xs text-fg-subtle mt-0.5">View every Quality Engineer and their account status.</p>
          </div>
          <Link to="/users" className="btn-secondary !text-xs !px-3 !py-1.5 whitespace-nowrap">
            View team →
          </Link>
        </div>
        <div className="card px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Quality analytics</p>
            <p className="text-xs text-fg-subtle mt-0.5">Defect trends, severity mix and per-line quality reports.</p>
          </div>
          <Link to="/analytics" className="btn-secondary !text-xs !px-3 !py-1.5 whitespace-nowrap">
            Open analytics →
          </Link>
        </div>
      </div>
    </>
  );
}
