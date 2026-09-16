import PageShell from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import QualityEngineerDashboard from "./dashboards/QualityEngineerDashboard";
import SupervisorDashboard from "./dashboards/SupervisorDashboard";
import ManagerDashboard from "./dashboards/ManagerDashboard";

/**
 * Router, not a view: which dashboard renders depends entirely on the
 * logged-in account's role, so two accounts with different roles see
 * genuinely different content here — not just a different label on the
 * same data.
 */
export default function Dashboard() {
  const { user } = useAuth();

  function renderRoleDashboard() {
    switch (user?.role) {
      case "factory_supervisor":
        return <SupervisorDashboard />;
      case "production_manager":
      case "admin":
        return <ManagerDashboard />;
      case "quality_engineer":
      default:
        return <QualityEngineerDashboard />;
    }
  }

  return <PageShell section="Dashboard">{renderRoleDashboard()}</PageShell>;
}
