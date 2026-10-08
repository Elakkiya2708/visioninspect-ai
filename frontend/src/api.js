const BASE = 'https://visioninspect-ai-backend-smf0.onrender.com/api'
export const tokenStore = {
  get: () => localStorage.getItem('vi_token'),
  set: (t) => localStorage.setItem('vi_token', t),
  clear: () => localStorage.removeItem('vi_token'),
}

function errMessage(data, status) {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(-1)[0]}: ${e.msg}`).join('; ')
  return `Request failed (${status})`
}

async function request(path, { method = 'GET', json, form, blob } = {}) {
  const headers = {}
  const t = tokenStore.get()
  if (t) headers.Authorization = `Bearer ${t}`
  let body
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
  if (form) body = form
  const res = await fetch(BASE + path, { method, headers, body })
  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch { /* ignore */ }
    if (res.status === 401 && t) { tokenStore.clear(); window.dispatchEvent(new Event('vi:unauth')) }
    throw new Error(errMessage(data, res.status))
  }
  if (blob) return res.blob()
  if (res.status === 204) return null
  return res.json()
}

const qs = (o = {}) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', json: { email, password } }),
  register: (data) => request('/auth/register', { method: 'POST', json: data }),
  me: () => request('/auth/me'),

  users: () => request('/users'),
  createUser: (d) => request('/users', { method: 'POST', json: d }),
  updateUser: (id, d) => request(`/users/${id}`, { method: 'PATCH', json: d }),
  audit: () => request('/users/audit'),

  inspect: (files, category) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('category', category)
    return request('/inspections', { method: 'POST', form })
  },
  camera: (d) => request('/inspections/camera', { method: 'POST', json: d }),
  inspections: (params) => request(`/inspections${qs(params)}`),
  inspection: (id) => request(`/inspections/${id}`),
  review: (id, d) => request(`/inspections/${id}/review`, { method: 'POST', json: d }),
  deleteInspection: (id) => request(`/inspections/${id}`, { method: 'DELETE' }),
  imageBlob: (id, kind) => request(`/inspections/${id}/image/${kind}`, { blob: true }),
  pdf: (id) => request(`/inspections/${id}/report.pdf`, { blob: true }),
  csv: (params) => request(`/inspections/export.csv${qs(params)}`, { blob: true }),

  summary: (days) => request(`/analytics/summary?days=${days}`),
  trends: (days) => request(`/analytics/trends?days=${days}`),
  defectTypes: (days) => request(`/analytics/defect-types?days=${days}`),
  severity: (days) => request(`/analytics/severity?days=${days}`),
  categories: (days) => request(`/analytics/categories?days=${days}`),
  insights: (days) => request(`/analytics/insights?days=${days}`),

  dataset: () => request('/dataset/status'),
  generateDemo: () => request('/dataset/generate-demo', { method: 'POST' }),
  train: (d) => request('/dataset/train', { method: 'POST', json: d }),
  inspectSamples: (d) => request('/dataset/inspect-samples', { method: 'POST', json: d }),
  jobs: () => request('/dataset/jobs'),
  job: (id) => request(`/dataset/jobs/${id}`),
  models: () => request('/dataset/models'),
  activateModel: (id) => request(`/dataset/models/${id}/activate`, { method: 'POST' }),
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
