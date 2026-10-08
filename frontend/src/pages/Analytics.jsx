import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download } from 'lucide-react'
import { api, downloadBlob } from '../api'
import { Card, Empty, Loading, PageHeader, SeverityBadge, SEV_HEX, DEC_HEX, useToast } from '../components/ui'

const tip = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 } }
const axis = { tick: { fontSize: 11 }, tickLine: false, axisLine: false }

function riskLevel(avg) { return avg >= 80 ? 'Critical' : avg >= 60 ? 'High' : avg >= 40 ? 'Medium' : 'Low' }

export default function Analytics() {
  const toast = useToast()
  const [days, setDays] = useState(30)
  const [d, setD] = useState(null)

  useEffect(() => {
    setD(null)
    Promise.all([api.summary(days), api.trends(Math.min(days, 90)), api.defectTypes(days), api.severity(days), api.categories(days)])
      .then(([summary, trends, types, sev, cats]) => setD({ summary, trends, types, sev, cats })).catch((e) => toast(e.message, 'error'))
  }, [days, toast])

  const exportCsv = async () => {
    try { downloadBlob(await api.csv({}), 'production_quality_report.csv') } catch (e) { toast(e.message, 'error') }
  }
  if (!d) return <Loading />
  const { summary: s, trends, types, sev, cats } = d

  return (
    <>
      <PageHeader title="Manufacturing analytics" subtitle="Defect trends, production quality and quality-risk assessment.">
        <select className="input !w-auto" value={days} onChange={(e) => setDays(+e.target.value)}>
          {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>Last {n} days</option>)}
        </select>
        <button className="btn-ghost" onClick={exportCsv}><Download className="h-4 w-4" /> Production report (CSV)</button>
      </PageHeader>

      {s.total === 0 ? <Card><Empty icon={BarChart3} title="No data for this period" text="Run inspections or simulate production history from Models & Dataset." /></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[['Inspection automation rate', `${s.automation_rate}%`, 'Parts decided without manual review'],
              ['Avg. processing time', `${s.avg_processing_ms} ms`, 'Per image, end to end'],
              ['Rejected parts', s.rejected, `${s.critical} critical defects`],
              s.accuracy !== undefined ? ['Decision accuracy', `${s.accuracy}%`, `${s.labelled_samples} labelled samples`] : ['Pass rate', `${s.pass_rate}%`, `${s.passed} of ${s.total} parts`]].map(([l, v, sub]) => (
              <div key={l} className="card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{v}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div>
            ))}
          </div>
          {s.accuracy !== undefined && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[['Detection rate (defective parts caught)', s.detection_rate], ['False defect rate (good parts flagged)', s.false_defect_rate], ['Overall decision accuracy', s.accuracy]].map(([l, v]) => (
                <div key={l} className="card p-4"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-xl font-extrabold text-slate-900">{v}%</p></div>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Card title="Decisions per day" subtitle="Stacked by quality-control outcome">
              <div className="h-72"><ResponsiveContainer>
                <BarChart data={trends} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis {...axis} allowDecimals={false} />
                  <Tooltip {...tip} cursor={{ fill: '#f1f5f9' }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pass" name="Pass" stackId="a" fill={DEC_HEX.PASS} /><Bar dataKey="review" name="Review" stackId="a" fill={DEC_HEX.REVIEW} />
                  <Bar dataKey="rework" name="Rework" stackId="a" fill={DEC_HEX.REWORK} /><Bar dataKey="reject" name="Reject" stackId="a" fill={DEC_HEX.REJECT} radius={[4, 4, 0, 0]} />
                </BarChart></ResponsiveContainer></div>
            </Card>
            <Card title="Defect-rate & severity trend" subtitle="Trend monitoring of quality drift">
              <div className="h-72"><ResponsiveContainer>
                <LineChart data={trends} margin={{ left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis {...axis} domain={[0, 100]} />
                  <Tooltip {...tip} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="defect_rate" name="Defect rate %" stroke="#e11d48" strokeWidth={2.5} dot={false} type="monotone" />
                  <Line dataKey="avg_severity" name="Avg severity" stroke="#6366f1" strokeWidth={2.5} dot={false} type="monotone" />
                </LineChart></ResponsiveContainer></div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card title="Severity levels">
              <div className="h-56"><ResponsiveContainer>
                <BarChart data={sev.levels} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="level" {...axis} width={60} />
                  <Tooltip {...tip} cursor={{ fill: '#f1f5f9' }} /><Bar dataKey="count" radius={[0, 6, 6, 0]}>{sev.levels.map((l) => <Cell key={l.level} fill={SEV_HEX[l.level]} />)}</Bar>
                </BarChart></ResponsiveContainer></div>
            </Card>
            <Card title="Quality risk assessment" subtitle="Average severity per defect type" className="xl:col-span-2" pad={false}>
              {types.types.length === 0 ? <p className="p-5 pt-3 text-sm text-slate-500">No defects recorded.</p> : (
                <div className="mt-3 overflow-x-auto"><table className="w-full">
                  <thead><tr><th className="th">Defect type</th><th className="th">Occurrences</th><th className="th">Avg severity</th><th className="th">Risk</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {types.types.map((t) => (
                      <tr key={t.type}><td className="td font-semibold text-slate-800">{t.type}</td><td className="td text-slate-600">{t.count}</td>
                        <td className="td"><div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${t.avg_severity}%`, background: SEV_HEX[riskLevel(t.avg_severity)] }} /></div><span className="text-xs text-slate-600">{t.avg_severity}</span></div></td>
                        <td className="td"><SeverityBadge v={riskLevel(t.avg_severity)} /></td></tr>
                    ))}
                  </tbody></table></div>
              )}
            </Card>
          </div>

          <Card className="mt-5" title="Production quality by product category" pad={false}>
            <div className="mt-3 overflow-x-auto"><table className="w-full">
              <thead><tr>{['Category', 'Inspected', 'Defect rate', 'Avg severity', 'Rejected', 'Top defect'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cats.map((c) => (
                  <tr key={c.category} className="hover:bg-slate-50/70"><td className="td font-semibold text-slate-800">{c.category}</td><td className="td">{c.inspected}</td>
                    <td className="td"><span className={c.defect_rate > 30 ? 'font-semibold text-rose-600' : 'text-slate-600'}>{c.defect_rate}%</span></td>
                    <td className="td text-slate-600">{c.avg_severity}</td><td className="td text-slate-600">{c.rejected}</td><td className="td text-slate-600">{c.top_defect || '—'}</td></tr>
                ))}
              </tbody></table></div>
          </Card>
        </>
      )}
    </>
  )
}
