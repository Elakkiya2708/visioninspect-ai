import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

const ROLE_LABELS: Record<string, string> = {
  quality_engineer: "Quality Engineer",
  factory_supervisor: "Factory Supervisor",
  production_manager: "Production Manager",
  admin: "Admin",
};

/**
 * Persistent header across every workspace page: breadcrumb on the left,
 * live system status / clock / account on the right. Gives the app the
 * "operator console" feel a factory-floor tool should have, and means
 * the current user and their role are always visible — useful when the
 * whole point is that different roles see different things.
 */
export default function TopBar({ section }: { section: string }) {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const initials =
    user?.full_name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  return (
    <header className="sticky top-0 z-20 bg-surface/90 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between px-8 py-3 gap-4">
        <nav className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-fg-subtle truncate">
            VisionInspect <span className="text-fg-subtle/50">/</span>{" "}
            <span className="text-accent">{section}</span>
          </p>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Inspection engine online
          </span>

          <span className="hidden lg:block text-[11px] font-mono text-fg-subtle tabular-nums">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>

          <ThemeToggle />

          <Link to="/profile" className="flex items-center gap-2.5 pl-3 border-l border-border group">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium leading-tight group-hover:text-accent transition-colors">
                {user?.full_name}
              </p>
              <p className="text-[10px] text-fg-subtle leading-tight">
                {user ? ROLE_LABELS[user.role] : ""}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-indigo-600 text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials}
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
