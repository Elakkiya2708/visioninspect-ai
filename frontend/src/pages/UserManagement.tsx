import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { api, User, UserRole, canEditRoles } from "../lib/api";

const ROLE_LABELS: Record<UserRole, string> = {
  quality_engineer: "Quality Engineer",
  factory_supervisor: "Factory Supervisor",
  production_manager: "Production Manager",
  admin: "Admin",
};

const ROLE_OPTIONS: UserRole[] = ["quality_engineer", "factory_supervisor", "production_manager", "admin"];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [message, setMessage] = useState<{ id: string; text: string; tone: "success" | "critical" } | null>(null);

  const canEdit = currentUser ? canEditRoles(currentUser.role) : false;

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<User[]>("/api/auth/users");
      setUsers(res.data);
    } catch (err: any) {
      setLoadError(err?.response?.data?.detail || "You don't have permission to view this page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleSaveRole(userId: string) {
    const newRole = pendingRoles[userId];
    if (!newRole) return;
    setSavingId(userId);
    setMessage(null);
    try {
      await api.patch<User>(`/api/auth/users/${userId}/role`, { role: newRole });
      setUsers((list) => list.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setMessage({ id: userId, text: "Role updated.", tone: "success" });
    } catch (err: any) {
      setMessage({ id: userId, text: err?.response?.data?.detail || "Could not update role.", tone: "critical" });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 max-w-[1100px]">
        <p className="label-eyebrow mb-1">User Management Module</p>
        <h1 className="font-display text-2xl font-semibold mb-1">Team Accounts</h1>
        <p className="text-sm text-fg-subtle mb-8">
          {canEdit
            ? "View every account and reassign roles."
            : "View every account on the platform. Role changes require a Production Manager or Admin account."}
        </p>

        {loading ? (
          <div className="font-mono text-xs text-fg-subtle tracking-widest animate-pulse py-16 text-center">
            LOADING ACCOUNTS…
          </div>
        ) : loadError ? (
          <div className="card border-critical/30 px-5 py-4">
            <p className="text-sm text-critical">{loadError}</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-eyebrow font-normal px-4 py-3">Name</th>
                  <th className="label-eyebrow font-normal px-4 py-3">Email</th>
                  <th className="label-eyebrow font-normal px-4 py-3">Role</th>
                  <th className="label-eyebrow font-normal px-4 py-3">Status</th>
                  <th className="label-eyebrow font-normal px-4 py-3">Joined</th>
                  {canEdit && <th className="label-eyebrow font-normal px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const pendingRole = pendingRoles[u.id] ?? u.role;
                  const hasChange = pendingRole !== u.role;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {u.full_name}
                        {isSelf && <span className="text-fg-subtle font-normal"> (you)</span>}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{u.email}</td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <select
                            value={pendingRole}
                            onChange={(e) =>
                              setPendingRoles((p) => ({ ...p, [u.id]: e.target.value as UserRole }))
                            }
                            className="input-field !py-1.5 !text-xs w-auto"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-medium bg-accent/10 text-accent border border-accent/25 rounded-full px-2.5 py-1">
                            {ROLE_LABELS[u.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium border rounded-full px-2.5 py-1 ${
                            u.is_active
                              ? "bg-success/10 text-success border-success/25"
                              : "bg-critical/10 text-critical border-critical/25"
                          }`}
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-fg-subtle font-mono text-xs">
                        {new Date(u.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveRole(u.id)}
                              disabled={!hasChange || savingId === u.id}
                              className="btn-secondary !px-3 !py-1.5 !text-xs"
                            >
                              {savingId === u.id ? "Saving…" : "Save"}
                            </button>
                            {message?.id === u.id && (
                              <span className={`text-xs ${message.tone === "success" ? "text-success" : "text-critical"}`}>
                                {message.text}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
