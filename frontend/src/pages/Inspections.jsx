import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, FileSearch, Search } from 'lucide-react'
import { api, downloadBlob } from '../api'
import { Card, DecisionBadge, Empty, Loading, PageHeader, SeverityBadge, fmtDate, useToast } from '../components/ui'

const EMPTY = { search: '', decision: '', severity: '', source: '', category: '', needs_review: '' }

export default function Inspections() {
  const toast = useToast()
  const [f, setF] = useState(EMPTY)
  const [q, setQ] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [cats, setCats] = useState([])

  useEffect(() => { api.dataset().then((d) => setCats(d.categories)).catch(() => {}) }, [])
  const load = useCallback(() => {
    const params = { ...q, page, page_size: 15, needs_review: q.needs_review === '' ? '' : q.needs_review }
    api.inspections(params).then(setData).catch((e) => toast(e.message, 'error'))
  }, [q, page, toast])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setTimeout(() => { setQ(f); setPage(1) }, 350); return () => clearTimeout(t) }, [f])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const exportCsv = async () => {
    try { const { page: _p, ...p } = { ...q }; downloadBlob(await api.csv(p), 'visioninspect_inspections.csv') } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHeader title="Inspections" subtitle="Searchable history of every inspected part.">
        <button className="btn-ghost" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</button>
      </PageHeader>
      <Card pad={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search report, file or category…" value={f.search} onChange={set('search')} />
          </div>
          <select className="input" value={f.decision} onChange={set('decision')}>
            <option value="">All decisions</option>{['PASS', 'REVIEW', 'REWORK', 'REJECT'].map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="input" value={f.severity} onChange={set('severity')}>
            <option value="">All severities</option>{['Critical', 'High', 'Medium', 'Low', 'None'].map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="input" value={f.category} onChange={set('category')}>
            <option value="">All categories</option><option value="general">general</option>{cats.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
          <select className="input" value={f.needs_review} onChange={set('needs_review')}>
            <option value="">Any review state</option><option value="true">Needs review</option>
          </select>
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? (
          <Empty icon={FileSearch} title="No inspections match" text="Adjust the filters or run a new inspection." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>{['Report', 'File', 'Category', 'Source', 'Defects', 'Severity', 'Decision', 'Quality', 'When'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="td"><Link className="font-semibold text-brand-600 hover:underline" to={`/inspections/${r.id}`}>{r.code}</Link></td>
                      <td className="td max-w-[180px] truncate text-slate-600" title={r.filename}>{r.filename}</td>
                      <td className="td text-slate-600">{r.category}</td>
                      <td className="td capitalize text-slate-500">{r.source}</td>
                      <td className="td text-slate-600">{r.defect_count ? `${r.defect_count} · ${r.top_defect}` : '—'}</td>
                      <td className="td"><SeverityBadge v={r.severity_level} score={r.severity_score} /></td>
                      <td className="td"><div className="flex items-center gap-1.5"><DecisionBadge v={r.decision} />{r.review_status && <span className="text-[11px] text-slate-400">({r.review_status})</span>}</div></td>
                      <td className="td text-slate-500">{r.quality_grade || '—'}</td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <span>{data.total} result{data.total !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost !px-2.5 !py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
                <span>Page {data.page} of {data.pages}</span>
                <button className="btn-ghost !px-2.5 !py-1.5" disabled={page >= data.pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
