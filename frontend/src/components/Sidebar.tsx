import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canViewUsers } from "../lib/api";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/upload", label: "Image Acquisition", icon: "upload" },
  { to: "/inspect", label: "Defect Inspection", icon: "shield" },
  { to: "/detect", label: "Object Detection", icon: "scan" },
  { to: "/profile", label: "Profile", icon: "user" },
];

const USER_MANAGEMENT_ITEM = { to: "/users", label: "User Management", icon: "users" };

function Icon({ name }: { name: string }) {
  if (name === "grid") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5l5.5 2v3.8c0 3.4-2.3 5.9-5.5 7.2-3.2-1.3-5.5-3.8-5.5-7.2V3.5L8 1.5z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M5.7 8.1l1.6 1.6 3-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.2" r="2.4" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.8 13.2c.9-2.6 2.9-4 5.2-4s4.3 1.4 5.2 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="5.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.8 13c.7-2.2 2-3.4 3.7-3.4s3 1.2 3.7 3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="11" cy="5.3" r="1.6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10.3 9.8c1.6.1 2.7 1.3 3.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "scan") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5.5V3.5A1.5 1.5 0 013.5 2h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M14 5.5V3.5A1.5 1.5 0 0012.5 2h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M2 10.5v2A1.5 1.5 0 003.5 14h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M14 10.5v2a1.5 1.5 0 01-1.5 1.5h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 11V2M8 2L4.5 5.5M8 2l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 11.5v1a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navItems = user && canViewUsers(user.role) ? [...NAV_ITEMS, USER_MANAGEMENT_ITEM] : NAV_ITEMS;

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 border-r border-sidebar-border bg-sidebar flex flex-col">
      <div className="px-5 py-6 border-b border-sidebar-border flex items-center justify-between">
        <div>
          <Logo onDark />
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-sidebar-fg/70 mt-1.5">
            Quality Inspection Platform
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-active text-accent"
                  : "text-sidebar-fg hover:bg-sidebar-active/60 hover:text-sidebar-fg-active"
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between px-3 py-2.5 mb-1">
          <Link to="/profile" className="min-w-0 hover:opacity-90 transition-opacity">
            <p className="text-sm font-medium truncate text-sidebar-fg-active">{user?.full_name}</p>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-sidebar-fg/70 mt-0.5">
              {user?.role.replace("_", " ")}
            </p>
          </Link>
          <ThemeToggle onDark />
        </div>
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 rounded-md text-sm text-sidebar-fg hover:text-critical hover:bg-sidebar-active/60 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
