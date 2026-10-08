import { useCallback, useEffect, useRef, useState } from 'react'
import { BrainCircuit, CheckCircle2, Database, History, Loader2, Play, Sparkles, Zap } from 'lucide-react'
import { api } from '../api'
import { Badge, Card, Empty, Loading, PageHeader, Progress, useToast, fmtDate } from '../components/ui'

const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

function Metric({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-lg font-extrabold text-slate-900">{value}</p><p className="text-[11px] font-medium text-slate-500">{label}</p></div>
}

export default function Models() {
  const toast = useToast()
  const [ds, setDs] = useState(null)
  const [models, setModels] = useState([])
  const [jobs, setJobs] = useState([])
  const [opts, setOpts] = useState({ clusters: 4, max: 200 })
  const [sample, setSample] = useState({ count: 40, days: 14, ratio: 15 })
  const [target, setTarget] = useState('')
  const prevRunning = useRef(0)

  const load = useCallback(async () => {
    const [d, m, j] = await Promise.all([api.dataset(), api.models(), api.jobs()])
    setDs(d); setModels(m); setJobs(j)
    setTarget((t) => t || d.categories[0]?.name || '')
    return j
  }, [])
  useEffect(() => { load().catch((e) => toast(e.message, 'error')) }, [load, toast])

  const running = jobs.filter((j) => j.status === 'running').length
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => load().catch(() => {}), 1500)
    return () => clearInterval(t)
  }, [running, load])
  useEffect(() => {
    if (prevRunning.current > 0 && running === 0) {
      const last = jobs[0]
      toast(last?.status === 'failed' ? `Job failed: ${last.error}` : 'Job finished', last?.status === 'failed' ? 'error' : 'success')
    }
    prevRunning.current = running
  }, [running, jobs, toast])

  const start = async (fn, msg) => {
    try { await fn(); toast(msg, 'info'); await load() } catch (e) { toast(e.message, 'error') }
  }
  if (!ds) return <Loading />
  const cats = ds.categories
  const selected = cats.find((c) => c.name === target)

  return (
    <>
      <PageHeader title="Models & dataset" subtitle="Load MVTec AD categories, train defect-detection models and manage model versions.">
        <button className="btn-ghost" disabled={running > 0} onClick={() => start(api.generateDemo, 'Generating demo dataset…')}><Sparkles className="h-4 w-4" /> Generate demo dataset</button>
      </PageHeader>

      {cats.length === 0 ? (
        <Card><Empty icon={Database} title="No dataset found"
          text={`Place MVTec AD categories (e.g. bottle/, carpet/ …) under ${ds.root}, or click “Generate demo dataset” to create three synthetic product categories in the same folder layout.`}>
          <button className="btn-primary" onClick={() => start(api.generateDemo, 'Generating demo dataset…')}><Sparkles className="h-4 w-4" /> Generate demo dataset</button></Empty></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cats.map((c) => {
            const m = c.active_model?.metrics
            return (
              <div key={c.name} onClick={() => setTarget(c.name)} className={`card cursor-pointer p-5 transition ${target === c.name ? 'ring-2 ring-brand-500' : 'hover:-translate-y-0.5'}`}>
                <div className="flex items-start justify-between">
                  <div><h3 className="font-bold text-slate-900">{c.name}</h3><p className="text-xs text-slate-500">{c.defect_types.length} defect types · {c.has_ground_truth ? 'with masks' : 'no masks'}</p></div>
                  {c.active_model ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20"><CheckCircle2 className="h-3 w-3" />v{c.active_model.version}</Badge> : <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">Untrained</Badge>}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 py-2"><b className="block text-base text-slate-900">{c.train_good}</b>train (good)</div>
                  <div className="rounded-lg bg-slate-50 py-2"><b className="block text-base text-slate-900">{c.test_good}</b>test good</div>
                  <div className="rounded-lg bg-slate-50 py-2"><b className="block text-base text-slate-900">{c.test_defect}</b>test defect</div>
                </div>
                {m?.evaluated && <p className="mt-3 text-xs text-slate-500">AUROC <b className="text-slate-800">{m.auroc}</b> · F1 <b className="text-slate-800">{m.f1}</b> · recall <b className="text-slate-800">{pct(m.recall)}</b></p>}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Card title={`Train model · ${selected.name}`} subtitle="Learns normal appearance from defect-free images, then calibrates and evaluates on the test split.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label">Gaussian clusters (k)</label><input type="number" min={1} max={8} className="input" value={opts.clusters} onChange={(e) => setOpts({ ...opts, clusters: +e.target.value })} />
                <p className="mt-1 text-[11px] text-slate-400">1 for textures, 4–8 for objects</p></div>
              <div><label className="label">Max training images</label><input type="number" min={10} max={1000} className="input" value={opts.max} onChange={(e) => setOpts({ ...opts, max: +e.target.value })} /></div>
            </div>
            <button className="btn-primary mt-5 w-full" disabled={running > 0}
              onClick={() => start(() => api.train({ category: selected.name, clusters: opts.clusters, max_train_images: opts.max }), 'Training started')}>
              {running > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />} Train & activate model</button>
          </Card>

          <Card title="Simulate production history" subtitle="Runs the full pipeline on random test images and back-dates them, so dashboards and trends have data.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label">Number of images</label><input type="number" min={1} max={200} className="input" value={sample.count} onChange={(e) => setSample({ ...sample, count: +e.target.value })} /></div>
              <div><label className="label">Spread over (days)</label><input type="number" min={0} max={90} className="input" value={sample.days} onChange={(e) => setSample({ ...sample, days: +e.target.value })} /></div>
              <div><label className="label">Defective share (%)</label><input type="number" min={0} max={100} className="input" value={sample.ratio} onChange={(e) => setSample({ ...sample, ratio: +e.target.value })} /></div>
            </div>
            <button className="btn-ghost mt-5 w-full" disabled={running > 0}
              onClick={() => start(() => api.inspectSamples({ category: selected.name, count: sample.count, spread_days: sample.days, defect_ratio: sample.ratio / 100 }), 'Inspecting samples…')}>
              <Play className="h-4 w-4" /> Inspect samples</button>
            {!selected.active_model && <p className="mt-3 text-xs text-amber-700">No trained model yet — samples will use the baseline detector. Train first for realistic results.</p>}
          </Card>
        </div>
      )}

      {jobs.length > 0 && (
        <Card className="mt-5" title="Jobs" action={running > 0 ? <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-600"><Zap className="h-3.5 w-3.5" />{running} running</span> : null}>
          <ul className="space-y-4">
            {jobs.slice(0, 6).map((j) => (
              <li key={j.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-semibold text-slate-800">{j.label}</span>
                  <span className={`text-xs font-semibold ${j.status === 'failed' ? 'text-rose-600' : j.status === 'completed' ? 'text-emerald-600' : 'text-brand-600'}`}>{j.status === 'failed' ? 'Failed' : j.message}</span></div>
                <Progress value={j.status === 'completed' ? 1 : j.progress} />
                {j.error && <p className="mt-1 text-xs text-rose-600">{j.error}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-5" title="Model registry" subtitle="Every training run is versioned. Activate any version to roll back." pad={false}>
        {models.length === 0 ? <Empty icon={History} title="No trained models yet" text="Train a category above to create the first version." /> : (
          <div className="mt-3 overflow-x-auto"><table className="w-full">
            <thead><tr>{['Model', 'Category', 'Trained', 'Accuracy', 'Precision', 'Recall', 'F1', 'AUROC', 'False alarms', 'Pixel IoU', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {models.map((m) => {
                const x = m.metrics || {}
                return (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="td font-semibold text-slate-800">{m.name}</td><td className="td text-slate-600">{m.category}</td><td className="td whitespace-nowrap text-xs text-slate-500">{fmtDate(m.created_at)}</td>
                    <td className="td">{pct(x.accuracy)}</td><td className="td">{pct(x.precision)}</td><td className="td">{pct(x.recall)}</td><td className="td">{x.f1 ?? '—'}</td><td className="td">{x.auroc ?? '—'}</td>
                    <td className="td">{pct(x.false_alarm_rate)}</td><td className="td">{pct(x.mean_pixel_iou)}</td>
                    <td className="td text-right">{m.active ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Active</Badge> :
                      <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => start(() => api.activateModel(m.id), 'Model activated')}>Activate</button>}</td>
                  </tr>
                )
              })}
            </tbody></table></div>
        )}
      </Card>

      {models.find((m) => m.active && m.metrics?.confusion) && (() => {
        const m = models.find((x) => x.active && x.metrics?.confusion)
        const c = m.metrics.confusion
        return (
          <Card className="mt-5" title={`Evaluation detail · ${m.name}`} subtitle={`${m.metrics.n_test} test images · threshold ${m.metrics.threshold} · trained in ${m.metrics.train_seconds}s`}>
            <div className="grid gap-3 sm:grid-cols-4"><Metric label="True positives" value={c.tp} /><Metric label="False positives" value={c.fp} /><Metric label="True negatives" value={c.tn} /><Metric label="False negatives" value={c.fn} /></div>
            <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Accuracy per test folder</h4>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(m.metrics.per_type_accuracy || {}).map(([k, v]) => <Metric key={k} label={k} value={pct(v)} />)}
            </div>
          </Card>
        )
      })()}
    </>
  )
}
