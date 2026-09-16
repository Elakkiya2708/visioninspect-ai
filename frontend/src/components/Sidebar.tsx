import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canViewUsers } from "../lib/api";
import Logo from "./Logo";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

// Grouped so the rail reads as a workflow (capture -> inspect -> review)
// rather than a flat list of links.
const WORKSPACE_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "grid" },
  { to: "/upload", label: "Image Acquisition", icon: "upload" },
  { to: "/inspect", label: "Defect Inspection", icon: "shield" },
  { to: "/detect", label: "Object Detection", icon: "scan" },
];

const INSIGHTS_ITEMS: NavItem[] = [{ to: "/analytics", label: "Analytics", icon: "analytics" }];

const ACCOUNT_ITEMS: NavItem[] = [{ to: "/profile", label: "Profile", icon: "user" }];
const USER_MANAGEMENT_ITEM: NavItem = { to: "/users", label: "User Management", icon: "users" };

function Icon({ name }: { name: string }) {
  const common = { stroke: "currentColor", strokeWidth: 1.3, fill: "none" } as const;
  switch (name) {
    case "grid":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" {...common} />
          <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" {...common} />
          <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" {...common} />
          <rect x="9" y="9" width="5.5" height="5.5" rx="1" {...common} />
        </svg>
      );
    case "shield":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5l5.5 2v3.8c0 3.4-2.3 5.9-5.5 7.2-3.2-1.3-5.5-3.8-5.5-7.2V3.5L8 1.5z" {...common} strokeLinejoin="round" />
          <path d="M5.7 8.1l1.6 1.6 3-3.2" {...common} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "scan":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 5.5V3.5A1.5 1.5 0 013.5 2h2" {...common} strokeLinecap="round" />
          <path d="M14 5.5V3.5A1.5 1.5 0 0012.5 2h-2" {...common} strokeLinecap="round" />
          <path d="M2 10.5v2A1.5 1.5 0 003.5 14h2" {...common} strokeLinecap="round" />
          <path d="M14 10.5v2a1.5 1.5 0 01-1.5 1.5h-2" {...common} strokeLinecap="round" />
          <circle cx="8" cy="8" r="2" {...common} />
        </svg>
      );
    case "analytics":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 13.5h12" {...common} strokeLinecap="round" />
          <path d="M4 13.5V8M7.3 13.5V4.5M10.6 13.5V10M13.9 13.5V6.5" {...common} strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5.2" r="2.4" {...common} />
          <path d="M2.8 13.2c.9-2.6 2.9-4 5.2-4s4.3 1.4 5.2 4" {...common} strokeLinecap="round" />
        </svg>
      );
    case "users":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="5.5" cy="5" r="2" {...common} />
          <path d="M1.8 13c.7-2.2 2-3.4 3.7-3.4s3 1.2 3.7 3.4" {...common} strokeLinecap="round" />
          <circle cx="11" cy="5.3" r="1.6" {...common} />
          <path d="M10.3 9.8c1.6.1 2.7 1.3 3.2 3" {...common} strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 11V2M8 2L4.5 5.5M8 2l3.5 3.5" {...common} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 11.5v1a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-1" {...common} strokeLinecap="round" />
        </svg>
      );
  }
}

function NavSection({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div className="mb-5">
      <p className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-sidebar-fg/45">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-fg hover:bg-sidebar-active/50 hover:text-sidebar-fg-active"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent" />
                )}
                <span className={isActive ? "text-accent" : ""}>
                  <Icon name={item.icon} />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const accountItems =
    user && canViewUsers(user.role) ? [...ACCOUNT_ITEMS, USER_MANAGEMENT_ITEM] : ACCOUNT_ITEMS;

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 border-r border-sidebar-border bg-sidebar flex flex-col">
      <Link to="/dashboard" className="px-5 py-5 border-b border-sidebar-border block">
        <Logo onDark />
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-sidebar-fg/55 mt-1.5">
          Inspection System
        </p>
      </Link>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <NavSection label="Workspace" items={WORKSPACE_ITEMS} />
        <NavSection label="Insights" items={INSIGHTS_ITEMS} />
        <NavSection label="Account" items={accountItems} />
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
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
