import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, FileText, Lightbulb, Trash2, Wrench, XCircle } from 'lucide-react'
import { api, downloadBlob } from '../api'
import { useAuth } from '../auth'
import { AuthImage, Badge, Card, DecisionBadge, Loading, Modal, ScoreBar, SeverityBadge, SEV_HEX, fmtDate, useToast } from '../components/ui'

const VIEWS = [['overlay', 'Detections'], ['original', 'Original'], ['processed', 'Preprocessed'], ['heatmap', 'Anomaly heatmap']]
const DEC_BANNER = {
  PASS: 'from-emerald-500 to-teal-500', REVIEW: 'from-amber-500 to-yellow-500',
  REWORK: 'from-orange-500 to-amber-500', REJECT: 'from-rose-600 to-red-500',
}
const GRADE_TONE = { A: 'bg-emerald-50 text-emerald-700', B: 'bg-sky-50 text-sky-700', C: 'bg-amber-50 text-amber-700', D: 'bg-rose-50 text-rose-700' }

export default function InspectionDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const [ins, setIns] = useState(null)
  const [view, setView] = useState('overlay')
  const [hover, setHover] = useState(null)
  const [sel, setSel] = useState(0)
  const [review, setReview] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(() => api.inspection(id).then(setIns).catch((e) => setErr(e.message)), [id])
  useEffect(() => { load() }, [load])

  if (err) return <Card><p className="text-sm text-rose-600">{err}</p><Link to="/inspections" className="btn-ghost mt-4">Back</Link></Card>
  if (!ins) return <Loading />

  const defects = ins.defects
  const d = defects[sel] || null
  const submitReview = async () => {
    try { setIns(await api.review(ins.id, { action: review, note })); toast('Review recorded', 'success'); setReview(null); setNote('') }
    catch (e) { toast(e.message, 'error') }
  }
  const pdf = async () => { try { downloadBlob(await api.pdf(ins.id), `${ins.code}.pdf`) } catch (e) { toast(e.message, 'error') } }
  const del = async () => {
    if (!window.confirm(`Delete ${ins.code}? This cannot be undone.`)) return
    try { await api.deleteInspection(ins.id); nav('/inspections') } catch (e) { toast(e.message, 'error') }
  }
  const canReview = can('admin', 'factory_supervisor')
  const q = ins.quality

  return (
    <>
      <Link to="/inspections" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Inspections</Link>

      <div className={`mb-5 overflow-hidden rounded-2xl bg-gradient-to-r ${DEC_BANNER[ins.decision]} p-5 text-white shadow-lg`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-80">{ins.code} · {ins.category}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{ins.decision === 'PASS' ? 'Product passed' : ins.decision === 'REJECT' ? 'Product rejected' : ins.decision === 'REWORK' ? 'Send for rework' : 'Manual review required'}</h1>
            <p className="mt-1 max-w-2xl text-sm opacity-95">{ins.recommendation}</p>
          </div>
          <div className="flex items-center gap-6 text-center">
            <div><p className="text-4xl font-extrabold">{Math.round(ins.severity_score)}</p><p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Severity</p></div>
            <div><p className="text-4xl font-extrabold">{defects.length}</p><p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Defects</p></div>
            <div><p className="text-4xl font-extrabold">{ins.processing_ms}<span className="text-lg">ms</span></p><p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Processing</p></div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          <Card pad={false}>
            <div className="flex flex-wrap gap-1 border-b border-slate-100 p-3">
              {VIEWS.map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${view === k ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
              ))}
            </div>
            <div className="bg-slate-900 p-4">
              <div className="relative mx-auto w-fit max-w-full">
                <AuthImage id={ins.id} kind={view === 'overlay' ? 'original' : view} alt={view} className="block max-h-[560px] max-w-full rounded-lg" />
                {view === 'overlay' && defects.map((x, i) => (
                  <div key={x.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setSel(i)}
                    className="absolute cursor-pointer rounded-sm transition"
                    style={{ left: `${x.bbox[0] * 100}%`, top: `${x.bbox[1] * 100}%`, width: `${x.bbox[2] * 100}%`, height: `${x.bbox[3] * 100}%`,
                      border: `2px solid ${SEV_HEX[x.severity_level]}`, boxShadow: hover === i || sel === i ? `0 0 0 3px ${SEV_HEX[x.severity_level]}55` : 'none',
                      background: hover === i || sel === i ? `${SEV_HEX[x.severity_level]}22` : 'transparent' }}>
                    <span className="absolute -top-5 left-[-2px] whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: SEV_HEX[x.severity_level] }}>{i + 1}. {x.type.split(' /')[0]} {Math.round(x.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
              {view === 'overlay' && defects.length === 0 && <p className="mt-3 text-center text-sm text-emerald-300">No defects detected on this part.</p>}
              {view === 'heatmap' && <p className="mt-3 text-center text-xs text-slate-400">Warmer colours = higher anomaly score relative to the model threshold.</p>}
              {view === 'processed' && <p className="mt-3 text-center text-xs text-slate-400">Model input: resized, denoised and contrast-enhanced ({ins.preprocessing?.input_size}×{ins.preprocessing?.input_size}).</p>}
            </div>
          </Card>

          <Card title="Detected defects" subtitle="Click a row to see its severity breakdown" pad={false}>
            {defects.length === 0 ? <p className="p-5 pt-3 text-sm text-slate-500">Nothing to report — the part is within learned normal variation.</p> : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full">
                  <thead><tr>{['#', 'Type', 'Category', 'Area', 'Confidence', 'Severity'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {defects.map((x, i) => (
                      <tr key={x.id} onClick={() => setSel(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                        className={`cursor-pointer ${sel === i ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}>
                        <td className="td font-bold text-slate-400">{i + 1}</td>
                        <td className="td font-semibold text-slate-800">{x.type}</td>
                        <td className="td text-slate-500">{x.category}</td>
                        <td className="td text-slate-600">{(x.area_ratio * 100).toFixed(2)}%</td>
                        <td className="td"><span className={x.confidence < 0.7 ? 'font-semibold text-amber-600' : 'text-slate-600'}>{Math.round(x.confidence * 100)}%</span></td>
                        <td className="td"><SeverityBadge v={x.severity_level} score={x.severity_score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-2">
          {d && (
            <Card title={`Severity breakdown · defect ${sel + 1}`} subtitle="Score = 30% size + 25% location + 25% type + 20% confidence">
              <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div><p className="text-xs font-medium text-slate-500">{d.type}</p><p className="text-3xl font-extrabold" style={{ color: SEV_HEX[d.severity_level] }}>{d.severity_score}</p></div>
                <SeverityBadge v={d.severity_level} />
              </div>
              <div className="space-y-3.5">
                <ScoreBar label="Defect size" weight={30} value={d.scores.size} color="#6366f1" />
                <ScoreBar label="Defect location" weight={25} value={d.scores.location} color="#06b6d4" />
                <ScoreBar label="Defect type" weight={25} value={d.scores.type} color="#f59e0b" />
                <ScoreBar label="Detection confidence" weight={20} value={d.scores.confidence} color="#10b981" />
              </div>
              {d.confidence < 0.7 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Confidence is below 70% — this detection requires manual review.</p>}
            </Card>
          )}

          <Card title="Quality-control action">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><div><p className="font-semibold text-slate-800">Recommendation</p><p className="text-slate-600">{ins.recommendation}</p></div></div>
              {ins.root_cause && <div className="flex items-start gap-3"><Wrench className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" /><div><p className="font-semibold text-slate-800">Probable root cause</p><p className="text-slate-600">{ins.root_cause}</p></div></div>}
              {ins.review_status && (
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div>
                  <p className="font-semibold text-slate-800">Reviewed: <span className="capitalize">{ins.review_status}</span></p>
                  <p className="text-xs text-slate-500">{ins.reviewer} · {fmtDate(ins.reviewed_at)}</p>{ins.review_note && <p className="mt-1 text-slate-600">{ins.review_note}</p>}</div></div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canReview && <>
                <button className="btn-ghost !text-emerald-700" onClick={() => setReview('approved')}><CheckCircle2 className="h-4 w-4" /> Approve</button>
                <button className="btn-ghost !text-orange-700" onClick={() => setReview('rework')}><Wrench className="h-4 w-4" /> Rework</button>
                <button className="btn-ghost !text-rose-700" onClick={() => setReview('rejected')}><XCircle className="h-4 w-4" /> Reject</button>
              </>}
              <button className="btn-ghost" onClick={pdf}><FileText className="h-4 w-4" /> PDF certificate</button>
              {can('admin') && <button className="btn-ghost !text-rose-600" onClick={del}><Trash2 className="h-4 w-4" /></button>}
            </div>
          </Card>

          {q && (
            <Card title="Image quality report" action={<Badge className={`${GRADE_TONE[q.grade]} ring-transparent`}>Grade {q.grade} · {q.overall}</Badge>}>
              <div className="space-y-3">
                {Object.entries(q.metrics).map(([k, m]) => (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-medium capitalize text-slate-600">{k}</span><span className="text-slate-500">{m.raw} <span className="text-slate-400">({m.label})</span></span></div>
                    <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${m.score}%` }} /></div>
                  </div>
                ))}
              </div>
              {q.warnings.length > 0 && <ul className="mt-4 space-y-1.5">{q.warnings.map((w, i) => <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{w}</li>)}</ul>}
            </Card>
          )}

          <Card title="Processing details">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              {[['File', ins.filename], ['Resolution', `${ins.width}×${ins.height}`], ['Source', ins.source], ['Operator', ins.operator || '—'],
                ['Model', ins.model_name], ['Mode', ins.model_mode], ['Anomaly score', `${ins.anomaly_score}× threshold`], ['Captured', fmtDate(ins.created_at)]].map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-xs text-slate-400">{k}</dt><dd className="truncate font-medium text-slate-700" title={String(v)}>{v}</dd></div>
              ))}
            </dl>
            {ins.preprocessing?.steps && (
              <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
                {ins.preprocessing.steps.map((s, i) => (
                  <li key={i} className="flex items-center justify-between text-xs"><span className="text-slate-600"><b className="text-slate-800">{s.step}</b> — {s.detail}</span><span className="text-slate-400">{s.ms} ms</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} title={`Record review: ${review}`}>
        <label className="label">Note (optional)</label>
        <textarea className="input min-h-[96px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Reason, observations, follow-up actions…" />
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReview(null)}>Cancel</button><button className="btn-primary" onClick={submitReview}>Confirm</button></div>
      </Modal>
    </>
  )
}
