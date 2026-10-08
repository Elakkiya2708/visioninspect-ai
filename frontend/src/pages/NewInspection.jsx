import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Camera, CheckCircle2, FileImage, Info, Layers, Play, UploadCloud, X } from 'lucide-react'
import { api } from '../api'
import { Card, DecisionBadge, PageHeader, SeverityBadge, Spinner, useToast } from '../components/ui'

export default function NewInspection() {
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState('upload')
  const [cats, setCats] = useState([])
  const [category, setCategory] = useState('general')
  const [files, setFiles] = useState([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState(null)
  const [cam, setCam] = useState({ count: 3, p: 35 })
  const input = useRef()

  useEffect(() => { api.dataset().then((d) => setCats(d.categories)).catch(() => {}) }, [])
  const active = cats.find((c) => c.name === category)?.active_model

  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files])
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews])

  const add = useCallback((list) => {
    const arr = Array.from(list).filter((f) => f.type.startsWith('image/') || /\.(tiff?|bmp)$/i.test(f.name))
    setFiles((old) => [...old, ...arr].slice(0, 50)); setOut(null)
  }, [])

  const run = async () => {
    setBusy(true); setOut(null)
    try {
      const r = await api.inspect(files, category)
      if (r.summary.total === 1 && r.results[0].status === 'completed') { nav(`/inspections/${r.results[0].id}`); return }
      setOut(r); setFiles([])
      toast(`${r.summary.completed} inspected, ${r.summary.invalid} rejected by validation`, r.summary.invalid ? 'warn' : 'success')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const capture = async () => {
    setBusy(true); setOut(null)
    try {
      const r = await api.camera({ category, count: cam.count, defect_probability: cam.p / 100 })
      if (r.results.length === 1) { nav(`/inspections/${r.results[0].id}`); return }
      setOut({ results: r.results.map((x) => ({ status: 'completed', ...x })), summary: { total: r.results.length, completed: r.results.length, invalid: 0 } })
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="New inspection" subtitle="Upload product images or simulate a production-line camera. Each image is validated, enhanced, analysed and scored." />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <div className="flex w-fit rounded-xl border border-slate-200 bg-white p-1">
            {[['upload', 'Image upload / batch', UploadCloud], ['camera', 'Camera simulation', Camera]].map(([k, l, I]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}><I className="h-4 w-4" />{l}</button>
            ))}
          </div>

          {tab === 'upload' ? (
            <Card>
              <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }} onClick={() => input.current.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60 hover:border-brand-500 hover:bg-brand-50/50'}`}>
                <div className="mb-3 rounded-2xl bg-white p-3 text-brand-600 shadow"><UploadCloud className="h-7 w-7" /></div>
                <p className="font-semibold text-slate-800">Drop product images here, or click to browse</p>
                <p className="mt-1 text-xs text-slate-500">JPG · PNG · BMP · TIFF · WebP — up to 20 MB each, 50 images per batch</p>
                <input ref={input} type="file" multiple accept="image/*,.tif,.tiff,.bmp" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
              </div>

              {files.length > 0 && (
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-slate-400" />{files.length} image{files.length > 1 ? 's' : ''} queued{files.length > 1 && <span className="text-xs font-normal text-slate-500">(batch mode)</span>}</p>
                    <button className="text-xs font-semibold text-slate-500 hover:text-rose-600" onClick={() => setFiles([])}>Clear all</button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                    {previews.map((p, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                        <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 hidden rounded-full bg-slate-900/70 p-1 text-white group-hover:block"><X className="h-3 w-3" /></button>
                        <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 px-1.5 pb-1 pt-4 text-[10px] text-white">{p.f.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button className="btn-primary mt-5 w-full py-3" disabled={!files.length || busy} onClick={run}>
                {busy ? <><Spinner className="h-4 w-4" /> Analysing…</> : <><Play className="h-4 w-4" /> Run inspection{files.length > 1 ? ` (${files.length} images)` : ''}</>}
              </button>
            </Card>
          ) : (
            <Card title="Production-line camera simulation" subtitle="Generates frames as a line camera would deliver them and inspects each one automatically.">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="label">Frames to capture: {cam.count}</label>
                  <input type="range" min={1} max={10} value={cam.count} onChange={(e) => setCam({ ...cam, count: +e.target.value })} className="w-full accent-brand-600" />
                </div>
                <div>
                  <label className="label">Simulated defect probability: {cam.p}%</label>
                  <input type="range" min={0} max={100} step={5} value={cam.p} onChange={(e) => setCam({ ...cam, p: +e.target.value })} className="w-full accent-brand-600" />
                </div>
              </div>
              
              <button className="btn-primary mt-5 w-full py-3" disabled={busy} onClick={capture}>
                {busy ? <><Spinner className="h-4 w-4" /> Capturing…</> : <><Camera className="h-4 w-4" /> Capture & inspect</>}
              </button>
            </Card>
          )}

          {out && (
            <Card title="Batch results" subtitle={`${out.summary.completed} completed · ${out.summary.invalid} failed validation`} pad={false}>
              <div className="mt-3 divide-y divide-slate-100">
                {out.results.map((r, i) => r.status === 'completed' ? (
                  <Link key={i} to={`/inspections/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.filename}</span>
                    <span className="hidden text-xs text-slate-500 sm:block">{r.top_defect || 'No defects'}</span>
                    <SeverityBadge v={r.severity_level} score={r.severity_score} /><DecisionBadge v={r.decision} />
                  </Link>
                ) : (
                  <div key={i} className="flex items-center gap-3 bg-rose-50/50 px-5 py-3">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.filename}</span>
                    <span className="text-xs text-rose-700">{r.error}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Product category" subtitle="Selects the trained model used for detection">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="general">general (baseline detector)</option>
              {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <div className={`mt-3 rounded-xl p-3 text-xs ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              {active ? <><b>Trained model active:</b> {active.name}{active.metrics?.auroc ? ` · AUROC ${active.metrics.auroc}` : ''}</>
                : <><b>Baseline detector.</b> No trained model for this category — the image is compared with its own statistics. Train a model in Models & Dataset for best accuracy.</>}
            </div>
          </Card>
          <Card title="What happens to each image">
            <ol className="space-y-3 text-sm">
              {['Validation — format, size, decodability', 'Quality analysis — blur, exposure, noise', 'Preprocessing — resize, denoise, CLAHE', 'Anomaly detection & localisation', 'Defect classification & severity scoring', 'Pass / review / rework / reject decision'].map((t, i) => (
                <li key={i} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span><span className="text-slate-600">{t}</span></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  )
}
