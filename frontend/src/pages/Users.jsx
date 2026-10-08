import { useCallback, useEffect, useState } from 'react'
import { Plus, ScrollText, UserCheck, UserX } from 'lucide-react'
import { api } from '../api'
import { ROLE_LABEL, useAuth } from '../auth'
import { Badge, Card, Loading, Modal, PageHeader, useToast, fmtDate } from '../components/ui'

export default function UsersPage() {
  const toast = useToast()
  const { user: me } = useAuth()
  const [users, setUsers] = useState(null)
  const [audit, setAudit] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'quality_engineer' })

  const load = useCallback(() => Promise.all([api.users(), api.audit()]).then(([u, a]) => { setUsers(u); setAudit(a) }).catch((e) => toast(e.message, 'error')), [toast])
  useEffect(() => { load() }, [load])

  const patch = async (u, body) => { try { await api.updateUser(u.id, body); toast('User updated', 'success'); load() } catch (e) { toast(e.message, 'error') } }
  const create = async (e) => {
    e.preventDefault()
    try { await api.createUser(f); toast('User created', 'success'); setOpen(false); setF({ full_name: '', email: '', password: '', role: 'quality_engineer' }); load() }
    catch (x) { toast(x.message, 'error') }
  }
  if (!users) return <Loading />

  return (
    <>
      <PageHeader title="User management" subtitle="Role-based access control for quality engineers, supervisors and administrators.">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add user</button>
      </PageHeader>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {[['Administrator', 'Full access: users, models, review, deletion.'], ['Quality Engineer', 'Inspect, train models, manage datasets, view analytics.'], ['Factory Supervisor', 'Inspect, review & approve decisions, view analytics.']].map(([t, s]) => (
          <div key={t} className="card p-4"><p className="text-sm font-bold text-slate-900">{t}</p><p className="mt-1 text-xs text-slate-500">{s}</p></div>
        ))}
      </div>

      <Card pad={false}>
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr>{['User', 'Role', 'Status', 'Last login', 'Joined', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/70">
                <td className="td"><p className="font-semibold text-slate-800">{u.full_name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td className="td"><select className="input !w-auto !py-1.5" value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })}>
                  {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="td">{u.is_active ? <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Active</Badge> : <Badge className="bg-slate-100 text-slate-500 ring-slate-400/20">Disabled</Badge>}</td>
                <td className="td text-xs text-slate-500">{fmtDate(u.last_login)}</td><td className="td text-xs text-slate-500">{fmtDate(u.created_at)}</td>
                <td className="td text-right">{u.id !== me.id && (
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => patch(u, { is_active: !u.is_active })}>
                    {u.is_active ? <><UserX className="h-3.5 w-3.5" /> Disable</> : <><UserCheck className="h-3.5 w-3.5" /> Enable</>}</button>)}</td>
              </tr>
            ))}
          </tbody></table></div>
      </Card>

      <Card className="mt-5" title="Audit trail" subtitle="Latest security-relevant actions" action={<ScrollText className="h-4 w-4 text-slate-400" />} pad={false}>
        <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {audit.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
              <span><b className="text-slate-800">{a.action}</b> <span className="text-slate-500">{a.detail}</span></span><span className="shrink-0 text-xs text-slate-400">{fmtDate(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add user">
        <form onSubmit={create} className="space-y-4">
          <div><label className="label">Full name</label><input className="input" required minLength={2} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label">Temporary password</label><input className="input" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div><label className="label">Role</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary">Create user</button></div>
        </form>
      </Modal>
    </>
  )
}
