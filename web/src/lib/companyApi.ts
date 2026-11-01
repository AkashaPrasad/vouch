import { API_BASE, ApiError, getToken } from './api'
import type { CompanyJob, CompanyProgress, CompanyRecent, CompanyReport } from './companyTypes'

const enc = encodeURIComponent

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res: Response
  try { res = await fetch(`${API_BASE}${path}`, { ...init, headers }) } catch {
    throw new ApiError('Can’t reach Vouch right now. Check your connection and try again.', 0)
  }
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`
    try { const j = await res.json(); if (typeof (j.detail || j.message) === 'string') msg = j.detail || j.message } catch { /* ignore */ }
    throw new ApiError(msg, res.status)
  }
  const txt = await res.text()
  return (txt ? JSON.parse(txt) : {}) as T
}

export const companyApi = {
  start: (company: string, website?: string) =>
    req<{ id: string; status: string }>('/api/company-research', { method: 'POST', body: JSON.stringify(website ? { company, website } : { company }) }),
  get: (id: string) => req<CompanyJob>(`/api/company-research/${enc(id)}`),
  sample: () => req<CompanyReport | { report: CompanyReport }>('/api/company-research/sample')
    .then((r) => ('report' in r && r.report ? r.report : r) as CompanyReport),
  streamUrl: (id: string) => `${API_BASE}/api/company-research/${enc(id)}/stream`,
}

export interface CompanyStreamHandlers {
  progress?: (p: CompanyProgress) => void
  done?: (report: CompanyReport | null) => void
  error?: (message: string) => void
  /** Stream closed or ended without a report; caller should fall back to polling GET. */
  onConnectionError?: () => void
}

/** Subscribe to a company research job's SSE stream. Returns an unsubscribe function. */
export function subscribeCompany(id: string, h: CompanyStreamHandlers): () => void {
  const es = new EventSource(companyApi.streamUrl(id))
  let closed = false, finished = false
  const close = () => { if (!closed) { closed = true; es.close() } }
  const parse = (ev: Event): any => {
    const raw = (ev as MessageEvent).data
    if (!raw) return {}
    try { return JSON.parse(raw) } catch { return { text: String(raw), message: String(raw) } }
  }
  es.addEventListener('company.progress', (ev) => { const d = parse(ev); h.progress?.({ text: String(d.text ?? ''), at: d.at || new Date().toISOString() }) })
  es.addEventListener('company.done', (ev) => { finished = true; const d = parse(ev); h.done?.(d.report ?? null); close() })
  es.addEventListener('company.error', (ev) => { finished = true; h.error?.(parse(ev).message || 'Research failed.'); close() })
  es.addEventListener('done', () => { close(); if (!finished) h.onConnectionError?.() })
  es.onerror = () => {
    if (finished) { close(); return }
    if (es.readyState === EventSource.CLOSED) { close(); h.onConnectionError?.() }
  }
  return close
}

const RECENT_KEY = 'vouch_company_recent_v1'
export function loadRecent(): CompanyRecent[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 5) : [] } catch { return [] }
}
export function saveRecent(entry: CompanyRecent): CompanyRecent[] {
  const same = (r: CompanyRecent) => r.id === entry.id || r.company.trim().toLowerCase() === entry.company.trim().toLowerCase()
  const next = [entry, ...loadRecent().filter((r) => !same(r))].slice(0, 5)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  return next
}
