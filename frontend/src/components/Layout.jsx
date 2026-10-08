import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Cpu, LayoutDashboard, ListChecks, LogOut, ScanSearch, ShieldCheck, Users } from 'lucide-react'
import { ROLE_LABEL, useAuth } from '../auth'

export default function Layout() {
  const { user, logout, can } = useAuth()
  const nav = useNavigate()
  const items = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/inspect', label: 'New Inspection', icon: ScanSearch },
    { to: '/inspections', label: 'Inspections', icon: ListChecks },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ...(can('admin', 'quality_engineer') ? [{ to: '/models', label: 'Models & Dataset', icon: Cpu }] : []),
    ...(can('admin') ? [{ to: '/users', label: 'User Management', icon: Users }] : []),
  ]
  const initials = user.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col bg-ink text-slate-300 lg:h-screen lg:w-64">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold tracking-tight text-white">VisionInspect <span className="text-cyan-300">AI</span></p>
            <p className="text-[11px] text-slate-500">Quality Inspection Platform</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white shadow-inner' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <Icon className="h-[18px] w-[18px]" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
              <p className="truncate text-[11px] text-slate-500">{ROLE_LABEL[user.role]}</p>
            </div>
            <button title="Sign out" onClick={() => { logout(); nav('/login') }} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8 fade-in"><Outlet /></div>
      </main>
    </div>
  )
}
