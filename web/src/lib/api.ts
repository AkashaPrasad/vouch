import type { WatchDetail } from './watchDetailTypes'
import type { Alert, ApiKey, JobPreferences, CheckDetail, LinkedInState, Posting, RecentItem, ResearchState, Resume, ResumeSummary, Screenshot, Settings, Stats, User, Watch, WatchCadence, WatchCheckResult, WatchStatus } from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '908727741603-i1m08dkm436q3tcigan76sqleq1511gm.apps.googleusercontent.com'

const TOKEN_KEY = 'vouch_token'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (init.auth && token) headers.set('Authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Can’t reach Vouch right now. Check your connection and try again.', 0)
  }
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`
    try { const j = await res.json(); msg = j.detail || j.message || msg } catch { /* ignore */ }
    if (typeof msg !== 'string') msg = `Something went wrong (${res.status}).`
    throw new ApiError(msg, res.status)
  }
  if (res.status === 204) return {} as T
  const txt = await res.text()
  return (txt ? JSON.parse(txt) : {}) as T
}

const enc = encodeURIComponent

export const api = {
  createCheck: (body: { text?: string; url?: string }) =>
    request<{ check_id: string }>('/api/checks', { method: 'POST', body: JSON.stringify({ ...body, channel: 'web' }), auth: true }),
  getCheck: (id: string) => request<CheckDetail>(`/api/checks/${enc(id)}`, { auth: true }),
  feedback: (id: string, correct: boolean, note?: string) =>
    request<{ ok: boolean }>(`/api/checks/${enc(id)}/feedback`, { method: 'POST', body: JSON.stringify({ correct, note }) }),
  recent: () => request<{ items: RecentItem[] }>('/api/recent'),
  me: () => request<User & { checks_count: number }>('/api/me', { auth: true }),
  myChecks: () => request<{ items: RecentItem[] }>('/api/me/checks', { auth: true }),
  googleAuth: (credential: string) => request<{ token: string; user: User }>('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  streamUrl: (id: string) => `${API_BASE}/api/checks/${enc(id)}/stream`,
  // v2: TinyFish Research / Browser / Monitor (all optional on the backend)
  research: (id: string) => request<{ status: string }>(`/api/checks/${enc(id)}/research`, { method: 'POST', auth: true }),
  researchGet: (id: string) => request<ResearchState>(`/api/checks/${enc(id)}/research`),
  researchStreamUrl: (id: string) => `${API_BASE}/api/checks/${enc(id)}/research/stream`,
  screenshots: (id: string) => request<{ items: Screenshot[] }>(`/api/checks/${enc(id)}/screenshots`),
  watch: (id: string) => request<{ ok: boolean; monitor_id?: string | null; message: string }>(`/api/checks/${enc(id)}/watch`, { method: 'POST', auth: true }),
  stats: () => request<Stats>('/api/me/stats', { auth: true }),
  // Company watches + resume match
  watches: () => request<{ items: Watch[] }>('/api/watches', { auth: true }),
  createWatch: (company_or_url: string, cadence?: WatchCadence) =>
    request<Watch>('/api/watches', { method: 'POST', body: JSON.stringify({ company_or_url, cadence }), auth: true }),
  checkWatch: (id: string) => request<WatchCheckResult>(`/api/watches/${enc(id)}/check`, { method: 'POST', auth: true }),
  updateWatch: (id: string, body: { cadence?: WatchCadence; status?: WatchStatus }) =>
    request<Watch>(`/api/watches/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body), auth: true }),
  deleteWatch: (id: string) => request<{ ok?: boolean }>(`/api/watches/${enc(id)}`, { method: 'DELETE', auth: true }),
  watchDetail: (id: string) => request<WatchDetail>(`/api/watches/${enc(id)}`, { auth: true }),
  watchPostings: (id: string) => request<{ items: Posting[] }>(`/api/watches/${enc(id)}/postings`, { auth: true }),
  presets: () => request<unknown>('/api/presets', { auth: true }),
  preferences: () => request<JobPreferences>('/api/me/preferences', { auth: true }),
  savePreferences: (body: { fields: string[]; roles: string[]; free_text: string }) =>
    request<JobPreferences>('/api/me/preferences', { method: 'PUT', body: JSON.stringify(body), auth: true }),
  resume: () => request<Resume>('/api/me/resume', { auth: true }),
  saveResume: (text: string) =>
    request<{ summary: ResumeSummary; updated_at: string }>('/api/me/resume', { method: 'PUT', body: JSON.stringify({ text }), auth: true }),
  uploadResume: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return request<{ summary: ResumeSummary; updated_at: string }>('/api/me/resume/file', { method: 'POST', body: fd, auth: true })
  },
  alerts: () => request<{ items: Alert[] }>('/api/alerts', { auth: true }),
  readAlert: (id: string) => request<{ ok?: boolean }>(`/api/alerts/${enc(id)}/read`, { method: 'POST', auth: true }),
  unreadAlerts: () => request<{ count: number }>('/api/alerts/unread_count', { auth: true }),
  linkedinConnect: () => request<{ setup_url: string; profile_id: string }>('/api/me/linkedin/connect', { method: 'POST', auth: true }),
  linkedin: () => request<LinkedInState>('/api/me/linkedin', { auth: true }),
  settings: () => request<Settings>('/api/me/settings', { auth: true }),
  saveSettings: (s: Settings) => request<Settings>('/api/me/settings', { method: 'PUT', body: JSON.stringify(s), auth: true }),
  apiKeys: () => request<{ items: ApiKey[] }>('/api/me/apikeys', { auth: true }),
  createApiKey: (name: string) => request<ApiKey & { key: string }>('/api/me/apikeys', { method: 'POST', body: JSON.stringify({ name }), auth: true }),
  revokeApiKey: (id: string) => request<{ ok: boolean }>(`/api/me/apikeys/${enc(id)}`, { method: 'DELETE', auth: true }),
  exportUrl: () => `${API_BASE}/api/me/export`,
  exportData: () => request<unknown>('/api/me/export', { auth: true }),
  deleteMe: () => request<{ ok: boolean }>('/api/me', { method: 'DELETE', auth: true }),
  deleteCheck: (id: string) => request<{ ok: boolean }>(`/api/checks/${id}`, { method: 'DELETE', auth: true }),
  imageUrl: (p: string) => (p.startsWith('http') ? p : `${API_BASE}${p}`),
}
