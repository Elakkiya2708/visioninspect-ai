import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";

const ROLES = [
  { value: "quality_engineer", label: "Quality Engineer" },
  { value: "factory_supervisor", label: "Factory Supervisor" },
  { value: "production_manager", label: "Production Manager" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "quality_engineer",
    department: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg bg-grid-pattern bg-grid flex items-center justify-center px-4 py-10 relative">
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size={26} />
        </div>

        <div className="bracket-frame card p-7 shadow-elevated">
          <p className="label-eyebrow mb-1">New Account</p>
          <h1 className="font-display text-xl font-semibold mb-6">Create your account</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">Full name</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                placeholder="Priya Raman"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">Work email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@plant.com"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="At least 8 characters"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">Role</label>
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value)}
                className="input-field"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">
                Department <span className="text-fg-subtle">(optional)</span>
              </label>
              <input
                value={form.department}
                onChange={(e) => update("department", e.target.value)}
                placeholder="Line 3 — Assembly"
                className="input-field"
              />
            </div>

            {error && (
              <p className="text-xs text-critical bg-critical/10 border border-critical/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-fg-subtle mt-5">
          Already registered?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
