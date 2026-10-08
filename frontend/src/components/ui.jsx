import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import { api } from '../api'

export const DECISION = {
  PASS: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  REVIEW: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  REWORK: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  REJECT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}
export const SEVERITY = {
  Critical: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  High: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Low: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  None: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}
export const SEV_HEX = { Critical: '#e11d48', High: '#f97316', Medium: '#f59e0b', Low: '#0ea5e9', None: '#94a3b8' }
export const DEC_HEX = { PASS: '#10b981', REVIEW: '#f59e0b', REWORK: '#f97316', REJECT: '#e11d48' }

export function Badge({ children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>{children}</span>
}
export const DecisionBadge = ({ v }) => <Badge className={DECISION[v] || SEVERITY.None}>{v}</Badge>
export const SeverityBadge = ({ v, score }) => (
  <Badge className={SEVERITY[v] || SEVERITY.None}>{v}{score ? ` · ${Math.round(score)}` : ''}</Badge>
)

export function Card({ title, subtitle, action, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5' }) { return <Loader2 className={`animate-spin ${className}`} /> }
export function Loading({ text = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner /> {text}</div>
}
export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      {Icon && <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-400"><Icon className="h-6 w-6" /></div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Progress({ value, className = '' }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400 transition-all duration-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

export function ScoreBar({ label, value, weight, color = '#6366f1' }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-slate-600">{label} <span className="text-slate-400">· {weight}%</span></span>
        <span className="font-bold text-slate-800">{Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} /></div>
    </div>
  )
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card fade-in w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* authenticated image: <img> cannot send the bearer token, so fetch as blob */
export function AuthImage({ id, kind, alt, className = '' }) {
  const [src, setSrc] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let url, alive = true
    setSrc(null); setErr(false)
    api.imageBlob(id, kind).then((b) => { if (alive) { url = URL.createObjectURL(b); setSrc(url) } }).catch(() => alive && setErr(true))
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [id, kind])
  if (err) return <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className}`}>Image unavailable</div>
  if (!src) return <div className={`animate-pulse bg-slate-100 ${className}`} />
  return <img src={src} alt={alt} className={className} draggable={false} />
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setItems((x) => [...x, { id, message, type }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500)
  }, [])
  const icon = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, error: <XCircle className="h-5 w-5 text-rose-500" />,
    info: <Info className="h-5 w-5 text-sky-500" />, warn: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="card fade-in flex items-start gap-3 p-3.5 text-sm">
            {icon[t.type]}<p className="flex-1 text-slate-700">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const fmtDate = (s) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—')
export const fmtAgo = (s) => {
  if (!s) return ''
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}
