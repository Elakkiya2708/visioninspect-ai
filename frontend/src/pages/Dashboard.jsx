import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ClipboardCheck, Gauge, Info, ScanSearch, ShieldAlert, Timer } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Card, DecisionBadge, Empty, Loading, PageHeader, SeverityBadge, SEV_HEX, fmtAgo } from '../components/ui'

const PIE = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#f97316']

function Kpi({ icon: Icon, label, value, unit, delta, good, tone }) {
  const up = delta > 0
  const positive = delta === 0 || delta === null ? null : good === 'down' ? !up : up
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
        {delta !== null && delta !== undefined && delta !== 0 && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">{value}<span className="ml-1 text-base font-semibold text-slate-400">{unit}</span></p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
    </div>
  )
}

const LEVEL_STYLE = {
  danger: 'border-rose-200 bg-rose-50 text-rose-800', warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800', info: 'border-sky-200 bg-sky-50 text-sky-800',
}

export default function Dashboard() {
  const { user } = useAuth()
  const [days, setDays] = useState(14)
  const [d, setD] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setD(null)
    Promise.all([api.summary(days), api.trends(days), api.defectTypes(days), api.severity(days), api.insights(days), api.inspections({ page_size: 7 })])
      .then(([summary, trends, types, sev, ins, recent]) => setD({ summary, trends, types, sev, ins, recent }))
      .catch((e) => setError(e.message))
  }, [days])

  if (error) return <Card><p className="text-sm text-rose-600">{error}</p></Card>
  if (!d) return <Loading />
  const { summary: s, trends, types, sev, ins, recent } = d

  return (
    <>
      <PageHeader title={`Hello, ${user.full_name.split(' ')[0]} 👋`} subtitle="Live overview of production quality and inspection activity.">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {[7, 14, 30].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${days === n ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}>{n}d</button>
          ))}
        </div>
        <Link to="/inspect" className="btn-primary"><ScanSearch className="h-4 w-4" /> New inspection</Link>
      </PageHeader>

      {ins.alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {ins.alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="text-sm font-bold">{a.title}</p><p className="text-sm">{a.text}</p></div>
            </div>
          ))}
        </div>
      )}

      {s.total === 0 ? (
        <Card>
          <Empty icon={Activity} title="No inspections in this period yet" text="Run your first inspection, or load the demo dataset, train a model and simulate production history from Models & Dataset.">
            <div className="flex gap-2"><Link to="/inspect" className="btn-primary">New inspection</Link><Link to="/models" className="btn-ghost">Models & Dataset</Link></div>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Kpi icon={ScanSearch} label="Parts inspected" value={s.total} delta={s.total - s.previous.total} tone="bg-indigo-50 text-indigo-600" />
            <Kpi icon={CheckCircle2} label="Pass rate" value={s.pass_rate} unit="%" delta={null} tone="bg-emerald-50 text-emerald-600" />
            <Kpi icon={AlertTriangle} label="Defect rate" value={s.defect_rate} unit="%" delta={s.defect_rate - s.previous.defect_rate} good="down" tone="bg-rose-50 text-rose-600" />
            <Kpi icon={Gauge} label="Avg severity score" value={s.avg_severity} delta={s.avg_severity - s.previous.avg_severity} good="down" tone="bg-amber-50 text-amber-600" />
            <Kpi icon={ClipboardCheck} label="Awaiting review" value={s.pending_review} delta={null} tone="bg-sky-50 text-sky-600" />
            <Kpi icon={Timer} label="Avg processing" value={s.avg_processing_ms} unit="ms" delta={null} tone="bg-fuchsia-50 text-fuchsia-600" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2" title="Inspection volume & defect rate" subtitle="Daily parts inspected (bars) and share not passed (line)">
              <div className="h-72">
                <ResponsiveContainer>
                  <ComposedChart data={trends} margin={{ left: -15, right: 5, top: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="r" orientation="right" unit="%" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="l" dataKey="inspected" name="Inspected" fill="#c7d2fe" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="r" dataKey="defect_rate" name="Defect rate %" stroke="#e11d48" strokeWidth={2.5} dot={false} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Defect types" subtitle="Most severe defect per part">
              {types.types.length === 0 ? <Empty title="No defects found" /> : (
                <>
                  <div className="h-48">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={types.types} dataKey="count" nameKey="type" innerRadius={48} outerRadius={78} paddingAngle={3} stroke="none">
                          {types.types.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {types.types.slice(0, 5).map((t, i) => (
                      <li key={t.type} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />{t.type}</span>
                        <b className="text-slate-800">{t.count}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card title="Severity distribution">
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={sev.levels} margin={{ left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="level" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>{sev.levels.map((l) => <Cell key={l.level} fill={SEV_HEX[l.level]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Operational insights" className="xl:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {ins.insights.map((i, k) => (
                  <div key={k} className={`rounded-xl border p-3.5 ${LEVEL_STYLE[i.level] || LEVEL_STYLE.info}`}>
                    <p className="flex items-center gap-2 text-sm font-bold"><Info className="h-4 w-4" />{i.title}</p>
                    <p className="mt-1 text-xs opacity-90">{i.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="mt-5" title="Recent inspections" action={<Link to="/inspections" className="text-xs font-semibold text-brand-600 hover:underline">View all</Link>} pad={false}>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Report</th><th className="th">Category</th><th className="th">Top defect</th><th className="th">Severity</th><th className="th">Decision</th><th className="th">When</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="td"><Link className="font-semibold text-brand-600 hover:underline" to={`/inspections/${r.id}`}>{r.code}</Link></td>
                      <td className="td text-slate-600">{r.category}</td>
                      <td className="td text-slate-600">{r.top_defect || '—'}</td>
                      <td className="td"><SeverityBadge v={r.severity_level} score={r.severity_score} /></td>
                      <td className="td"><DecisionBadge v={r.decision} /></td>
                      <td className="td text-xs text-slate-500">{fmtAgo(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  )
}
