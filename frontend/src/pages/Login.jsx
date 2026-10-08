import { useState } from 'react'
import { Eye, Factory, Loader2, ScanSearch, ShieldCheck, Zap } from 'lucide-react'
import { useAuth } from '../auth'

const DEMO = [
  { label: 'Admin', email: 'admin@visioninspect.ai', password: 'Admin@123' },
  { label: 'Quality Engineer', email: 'engineer@visioninspect.ai', password: 'Engineer@123' },
  { label: 'Supervisor', email: 'supervisor@visioninspect.ai', password: 'Supervisor@123' },
]

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ email: '', password: '', full_name: '', role: 'quality_engineer' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { if (mode === 'login') await login(f.email, f.password); else await register(f) }
    catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-400"><ShieldCheck className="h-6 w-6" /></div>
          <span className="text-xl font-extrabold tracking-tight">VisionInspect <span className="text-cyan-300">AI</span></span>
        </div>
        <div className="relative">
          <div className="relative mb-10 h-56 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-700 to-slate-800 shadow-2xl">
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 2px,transparent 2px 7px)' }} />
            <div className="absolute left-[38%] top-[30%] h-16 w-24 rounded-md border-2 border-rose-400"><span className="absolute -top-5 left-0 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold">Crack 96%</span></div>
            <div className="absolute left-[15%] top-[62%] h-8 w-28 rounded-md border-2 border-amber-400"><span className="absolute -top-5 left-0 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold">Scratch 81%</span></div>
            <div className="scan-line absolute left-0 right-0 h-0.5 bg-cyan-300 shadow-[0_0_14px_3px_rgba(103,232,249,.7)]" />
          </div>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">Catch defects before they leave the line.</h2>
          <p className="mt-4 max-w-md text-slate-400">Computer-vision inspection, explainable severity scoring and live production analytics in one platform.</p>
          <div className="mt-8 flex gap-6 text-sm text-slate-300">
            <span className="flex items-center gap-2"><Eye className="h-4 w-4 text-cyan-300" /> Anomaly detection</span>
            <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-cyan-300" /> Real-time QC</span>
            <span className="flex items-center gap-2"><Factory className="h-4 w-4 text-cyan-300" /> Industry 4.0</span>
          </div>
        </div>
        <p className="relative text-xs text-slate-500">VisionInspect AI · Manufacturing Quality Inspection System</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="fade-in w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden"><ScanSearch className="h-6 w-6 text-brand-600" /><b className="text-lg">VisionInspect AI</b></div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-2 text-sm text-slate-500">{mode === 'login' ? 'Sign in to the inspection console.' : 'Register as a quality engineer or factory supervisor.'}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === 'register' && (
              <>
                <div><label className="label">Full name</label><input className="input" required minLength={2} value={f.full_name} onChange={set('full_name')} placeholder="Jane Doe" /></div>
                <div><label className="label">Role</label>
                  <select className="input" value={f.role} onChange={set('role')}>
                    <option value="quality_engineer">Quality Engineer</option><option value="factory_supervisor">Factory Supervisor</option>
                  </select></div>
              </>
            )}
            <div><label className="label">Email</label><input className="input" type="email" required value={f.email} onChange={set('email')} placeholder="you@company.com" /></div>
            <div><label className="label">Password</label><input className="input" type="password" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'} /></div>
            {err && <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{err}</div>}
            <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? "Don't have an account?" : 'Already registered?'}{' '}
            <button className="font-semibold text-brand-600 hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>
              {mode === 'login' ? 'Register' : 'Sign in'}</button>
          </p>

          {mode === 'login' && (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts · click to fill</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button key={d.label} type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                    onClick={() => setF({ ...f, email: d.email, password: d.password })}>{d.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
