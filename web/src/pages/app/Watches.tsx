import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronRight, ExternalLink, FlaskConical, Loader2, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { ParsedPreferences, Posting, PresetField, Resume, ResumeSummary, Settings, Watch, WatchCadence, WatchCheckResult, WatchSourceKind, WatchStatus } from '../../lib/types'
import { hostOf, postedLabel, relTime } from '../../lib/format'
import { Empty, ErrorBox, MatchPill, PageHead, Rows, Section } from '../../components/app/ui'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'
import { useToast } from '../../components/Toast'
import { useTitle } from '../../lib/useTitle'
import { refreshUnread } from '../../lib/alerts'
import { FALLBACK_PRESETS, loadPresets, parsedOf } from '../../lib/presets'
import { runSample, setPendingSample, takePendingSample } from '../../lib/sample'

const SOURCE: Record<WatchSourceKind, string> = { careers: 'careers portal', ats: 'ATS', linkedin_public: 'LinkedIn public', linkedin_session: 'LinkedIn session', other: 'other' }
const CADENCE: Record<WatchCadence, string> = { daily: 'Daily', twice_daily: 'Twice daily', hourly: 'Hourly' }
const STATUS_TONE: Record<WatchStatus, string> = { active: 'border-green text-green', paused: 'border-border-strong text-muted', error: 'border-red text-red' }
const SETTINGS_LS = 'vouch_settings'
const sel = 'h-10 border border-border-strong bg-bg px-2 font-mono text-xs text-text'
const linkCls = 'underline decoration-border-strong underline-offset-4 hover:decoration-text'

export default function Watches() {
  useTitle('Watches')
  const { user, prompt } = useAuth()
  const [prefsKey, setPrefsKey] = useState(0)
  return (
    <div>
      <PageHead label="Monitor" title="Watches" sub="Vouch checks a company's careers page or LinkedIn jobs on a schedule and scores each new posting against what you are looking for." />
      {!user ? (
        <div className="mt-4 border border-dashed border-border-strong p-8 text-center">
          <p className="text-sm font-medium">Sign in to watch companies</p>
          <p className="mt-1 text-sm text-muted">Watches, your preferences and match alerts are saved to your account.</p>
          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row"><GoogleSignInButton /><button type="button" onClick={() => { setPendingSample(true); prompt() }} className="btn-secondary h-10 min-h-0 px-4"><FlaskConical className="h-4 w-4" strokeWidth={1.5} aria-hidden />Try a sample</button></div>
          <p className="mt-2 text-xs text-faint">Try a sample asks you to sign in first, then runs right after.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <WatchList onPrefsChanged={() => setPrefsKey((k) => k + 1)} />
          <MatchColumn key={prefsKey} />
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- watches */

function WatchList({ onPrefsChanged }: { onPrefsChanged: () => void }) {
  const toast = useToast()
  const [sampling, setSampling] = useState(false)
  const [items, setItems] = useState<Watch[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [input, setInput] = useState('')
  const [cadence, setCadence] = useState<WatchCadence>('daily')
  const [adding, setAdding] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [checking, setChecking] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, WatchCheckResult | string>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [postings, setPostings] = useState<Record<string, Posting[] | string | null>>({})
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    api.watches()
      .then((r) => { if (alive) { setItems(r.items ?? []); setUnavailable(false) } })
      .catch((e) => {
        if (!alive) return
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) { setUnavailable(true); setItems([]) }
        else setError(e instanceof Error ? e.message : 'Could not load watches')
      })
    return () => { alive = false }
  }, [tick])

  const patchLocal = (id: string, p: Partial<Watch>) => setItems((xs) => (xs ?? []).map((w) => (w.id === id ? { ...w, ...p } : w)))

  async function trySample() {
    if (sampling) return
    setSampling(true); setFormErr(null)
    try {
      const { watch, result, checkError, prefsSaved } = await runSample()
      const w: Watch = result ? { ...watch, last_checked_at: new Date().toISOString(), postings_count: result.postings_count ?? watch.postings_count, new_last_run: result.new_postings?.length ?? 0 } : watch
      setItems((xs) => [w, ...(xs ?? []).filter((x) => x.id !== w.id)])
      setUnavailable(false)
      setOpen((o) => ({ ...o, [w.id]: true }))
      if (checkError) setResults((x) => ({ ...x, [w.id]: checkError }))
      const fromCheck = result?.new_postings ?? []
      setPostings((p) => ({ ...p, [w.id]: fromCheck.length ? fromCheck : null }))
      api.watchPostings(w.id)
        .then((r) => { if (r.items?.length || !fromCheck.length) setPostings((p) => ({ ...p, [w.id]: r.items ?? [] })) })
        .catch(() => { if (!fromCheck.length) setPostings((p) => ({ ...p, [w.id]: [] })) })
      if (prefsSaved) onPrefsChanged()
      if (result?.alerts_created) void refreshUnread()
      toast.show('Sample watch created', 'success')
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Could not run the sample')
    } finally { setSampling(false) }
  }
  // A guest pressed "Try a sample" before signing in: run it now.
  useEffect(() => { if (takePendingSample()) void trySample() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: FormEvent) {
    e.preventDefault()
    const v = input.trim()
    if (!v) { setFormErr('Paste a careers page, an ATS link, a LinkedIn company URL or a company name.'); return }
    setAdding(true); setFormErr(null)
    try {
      const w = await api.createWatch(v, cadence)
      setItems((xs) => [w, ...(xs ?? []).filter((x) => x.id !== w.id)])
      setInput('')
      toast.show(`Watching ${w.company_name || hostOf(w.source_url)}`, 'success')
    } catch (err) {
      setFormErr(err instanceof ApiError && err.status === 404 ? 'Watches are not available yet.' : err instanceof Error ? err.message : 'Could not create the watch')
    } finally { setAdding(false) }
  }

  async function checkNow(w: Watch) {
    setChecking((c) => ({ ...c, [w.id]: true }))
    setResults((r) => { const n = { ...r }; delete n[w.id]; return n })
    try {
      const r = await api.checkWatch(w.id)
      setResults((x) => ({ ...x, [w.id]: r }))
      patchLocal(w.id, { last_checked_at: new Date().toISOString(), postings_count: r.postings_count ?? w.postings_count, new_last_run: r.new_postings?.length ?? 0, status: w.status === 'error' ? 'active' : w.status, last_error: null })
      if (r.alerts_created) void refreshUnread()
      if (open[w.id]) void loadPostings(w.id)
    } catch (e) {
      setResults((x) => ({ ...x, [w.id]: e instanceof Error ? e.message : 'Check failed' }))
    } finally { setChecking((c) => ({ ...c, [w.id]: false })) }
  }

  async function loadPostings(id: string) {
    setPostings((p) => ({ ...p, [id]: null }))
    try { const r = await api.watchPostings(id); setPostings((p) => ({ ...p, [id]: r.items ?? [] })) }
    catch (e) { setPostings((p) => ({ ...p, [id]: e instanceof ApiError && e.status === 404 ? [] : e instanceof Error ? e.message : 'Could not load postings' })) }
  }
  function togglePostings(id: string) {
    const next = !open[id]
    setOpen((o) => ({ ...o, [id]: next }))
    if (next && postings[id] === undefined) void loadPostings(id)
  }

  async function update(w: Watch, body: { cadence?: WatchCadence; status?: WatchStatus }) {
    const prev = { cadence: w.cadence, status: w.status }
    patchLocal(w.id, body)
    try { const r = await api.updateWatch(w.id, body); if (r && r.id) patchLocal(w.id, r) }
    catch (e) { patchLocal(w.id, prev); toast.show(e instanceof Error ? e.message : 'Could not update the watch', 'error') }
  }

  async function remove(w: Watch) {
    if (confirmDel !== w.id) { setConfirmDel(w.id); return }
    setConfirmDel(null)
    const before = items
    setItems((xs) => (xs ?? []).filter((x) => x.id !== w.id))
    try { await api.deleteWatch(w.id); toast.show('Watch deleted', 'success') }
    catch (e) { setItems(before); toast.show(e instanceof Error ? e.message : 'Could not delete', 'error') }
  }

  return (
    <div className="min-w-0">
      <form onSubmit={add} className="border border-border bg-surface p-3">
        <label htmlFor="watch-input" className="label">Watch a company</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="watch-input" value={input} onChange={(e) => setInput(e.target.value)} disabled={unavailable} placeholder="Company name, careers URL, ATS URL or LinkedIn company URL" className="input h-10 min-w-0 font-mono text-sm" autoComplete="off" />
          <select value={cadence} onChange={(e) => setCadence(e.target.value as WatchCadence)} aria-label="Check cadence" className={sel} disabled={unavailable}>
            {(Object.keys(CADENCE) as WatchCadence[]).map((c) => <option key={c} value={c}>{CADENCE[c]}</option>)}
          </select>
          <button type="submit" disabled={adding || unavailable} className="btn-primary h-10 min-h-0 whitespace-nowrap px-5">{adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}Watch</button>
          <button type="button" onClick={trySample} disabled={sampling || unavailable} className="btn-secondary h-10 min-h-0 whitespace-nowrap px-4">{sampling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="h-4 w-4" strokeWidth={1.5} aria-hidden />}{sampling ? 'Running sample' : 'Try a sample'}</button>
        </div>
        {formErr && <p role="alert" className="mt-2 text-sm text-red">{formErr}</p>}
        {sampling && <p className="mt-2 text-xs text-muted">Saving sample preferences if you have none (Engineering · Software Engineer, Frontend Developer), watching careers.navi.com and running the first check…</p>}
      </form>

      <Section label="Monitor" title="Company watches" className="mt-6" right={items?.length ? <span className="font-mono text-[11px] text-faint tnum">{items.length} watching</span> : undefined}>
        <div className="mt-2">
          {items == null && !error ? <Rows n={3} cols={5} /> : error ? <ErrorBox msg={error} onRetry={() => setTick((t) => t + 1)} /> : unavailable ? (
            <Empty title="Watches are not available yet." body="The watch service is still rolling out. Your resume can be saved now and will be used once it is live." />
          ) : !items?.length ? (
            <Empty title="No watches yet. Paste a careers page or a LinkedIn company URL." body="Vouch checks it on your cadence and alerts you when a new posting matches your resume." />
          ) : (
            <div className="overflow-x-auto">
              <table className="ledger-table min-w-[860px]">
                <thead><tr>
                  <th scope="col" className="pl-0">Company</th><th scope="col">Source</th><th scope="col">Cadence</th><th scope="col">Last checked</th>
                  <th scope="col" className="text-right">Postings</th><th scope="col" className="text-right">New last run</th><th scope="col">Status</th><th scope="col" className="pr-0 text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {items.map((w) => {
                    const res = results[w.id]
                    const ps = postings[w.id]
                    return (
                      <Fragment key={w.id}>
                        <tr>
                          <td className="pl-0 font-medium"><Link to={`/app/watches/${w.id}`} className={linkCls}>{w.company_name || hostOf(w.source_url)}</Link>{w.status === 'error' && w.last_error && <span className="mt-0.5 block max-w-[220px] truncate text-xs font-normal text-red" title={w.last_error}>{w.last_error}</span>}</td>
                          <td>
                            <span className="inline-flex border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{SOURCE[w.source_kind] ?? w.source_kind}</span>
                            <a href={w.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex max-w-[200px] items-center gap-1 truncate font-mono text-[11px] text-faint hover:text-text" title={w.source_url}><span className="truncate">{hostOf(w.source_url)}</span><ExternalLink className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden /></a>
                          </td>
                          <td>
                            <select value={w.cadence} onChange={(e) => update(w, { cadence: e.target.value as WatchCadence })} aria-label={`Cadence for ${w.company_name}`} className="h-8 border border-border bg-transparent px-1 font-mono text-[11px] text-text">
                              {(Object.keys(CADENCE) as WatchCadence[]).map((c) => <option key={c} value={c}>{CADENCE[c]}</option>)}
                            </select>
                          </td>
                          <td className="font-mono text-[11px] text-muted" title={w.last_checked_at ?? undefined}>{w.last_checked_at ? relTime(w.last_checked_at) : 'never'}</td>
                          <td className="text-right font-mono text-xs tnum">{w.postings_count ?? '—'}</td>
                          <td className={`text-right font-mono text-xs tnum ${w.new_last_run ? 'font-semibold text-text' : 'text-faint'}`}>{w.new_last_run ?? '—'}</td>
                          <td>
                            <select value={w.status} onChange={(e) => update(w, { status: e.target.value as WatchStatus })} aria-label={`Status for ${w.company_name}`} title={w.last_error ?? undefined} className={`h-7 border bg-transparent px-1 font-mono text-[10px] uppercase tracking-[0.06em] ${STATUS_TONE[w.status] ?? STATUS_TONE.paused}`}>
                              <option value="active">{w.status === 'paused' ? 'Resume' : 'Active'}</option>
                              <option value="paused">{w.status === 'paused' ? 'Paused' : 'Pause'}</option>
                              {w.status === 'error' && <option value="error" disabled>Error</option>}
                            </select>
                          </td>
                          <td className="pr-0 text-right">
                            <div className="flex justify-end gap-3 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em]">
                              <button onClick={() => checkNow(w)} disabled={!!checking[w.id]} className="inline-flex min-h-[32px] items-center gap-1 text-text hover:underline disabled:opacity-60">{checking[w.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />}{checking[w.id] ? 'Checking' : 'Check now'}</button>
                              <Link to={`/app/watches/${w.id}`} className="inline-flex min-h-[32px] items-center text-muted hover:text-text">Details</Link>
                              <button onClick={() => togglePostings(w.id)} aria-expanded={!!open[w.id]} className={`inline-flex min-h-[32px] items-center ${open[w.id] ? 'text-text underline underline-offset-4' : 'text-muted hover:text-text'}`}>Postings</button>
                              <button onClick={() => remove(w)} onBlur={() => confirmDel === w.id && setConfirmDel(null)} className="inline-flex min-h-[32px] items-center gap-1 text-red" aria-label={`Delete watch for ${w.company_name}`}><Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />{confirmDel === w.id ? 'Confirm' : 'Delete'}</button>
                            </div>
                          </td>
                        </tr>
                        {res !== undefined && (
                          <tr><td colSpan={8} className="bg-surface px-3">
                            {typeof res === 'string' ? <p className="text-sm text-red">{res}</p> : (
                              <div>
                                <p className="label">Check result · {res.new_postings?.length ?? 0} new · {res.alerts_created ?? 0} alert{res.alerts_created === 1 ? '' : 's'} · {res.postings_count ?? 0} open postings</p>
                                {res.new_postings?.length ? <PostingTable rows={res.new_postings} /> : <p className="mt-1 text-sm text-muted">No new postings since the last run.</p>}
                              </div>
                            )}
                            <button onClick={() => setResults((r) => { const n = { ...r }; delete n[w.id]; return n })} className="mt-2 font-mono text-[11px] uppercase text-faint hover:text-text">Dismiss</button>
                          </td></tr>
                        )}
                        {open[w.id] && (
                          <tr><td colSpan={8} className="bg-surface px-3">
                            <p className="label">Latest postings</p>
                            {ps === null || ps === undefined ? <div className="mt-2 space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-4" />)}</div>
                              : typeof ps === 'string' ? <p className="mt-1 text-sm text-red">{ps}</p>
                              : ps.length ? <PostingTable rows={ps} /> : <p className="mt-1 text-sm text-muted">No postings found yet. Run “Check now” to fetch them.</p>}
                          </td></tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function PostingTable({ rows }: { rows: Posting[] }) {
  const sorted = [...rows].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1))
  return (
    <table className="ledger-table mt-1">
      <thead><tr><th scope="col" className="pl-0">Posting</th><th scope="col">Location</th><th scope="col">Posted</th><th scope="col" className="pr-0">Match</th></tr></thead>
      <tbody>
        {sorted.map((p, i) => (
          <tr key={`${p.url}-${i}`}>
            <td className="pl-0"><a href={p.url} target="_blank" rel="noopener noreferrer" className={linkCls}>{p.title || 'Untitled role'}</a></td>
            <td className="text-xs text-muted">{p.location || '—'}</td>
            <td className="font-mono text-[11px] text-faint">{postedLabel(p.posted)}</td>
            <td className="pr-0">
              <div className="flex items-start gap-2">
                <MatchPill score={p.match_score} />
                <span className="min-w-0 text-xs text-muted">
                  {p.match_reasons?.[0]}
                  {p.missing?.length ? <span className="block text-faint">Missing: {p.missing.slice(0, 3).join(', ')}</span> : null}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------------------------------------------------------------- match profile */

function Chips({ label, items }: { label: string; items: (string | number)[] }) {
  if (!items.length) return null
  return (
    <div className="mt-3">
      <p className="label">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">{items.map((x, i) => <span key={`${x}-${i}`} className="border border-border bg-surface-2 px-1.5 py-0.5 text-xs">{x}</span>)}</div>
    </div>
  )
}

function MatchColumn() {
  return (
    <aside className="min-w-0">
      <PreferencesPanel />
      <ResumeBlock />
    </aside>
  )
}

function RoleCombobox({ options, selected, onAdd, onRemove }: { options: string[]; selected: string[]; onAdd: (r: string) => void; onRemove: (r: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const taken = new Set(selected.map((s) => s.toLowerCase()))
  const needle = q.trim().toLowerCase()
  const matches = options.filter((o) => !taken.has(o.toLowerCase()) && (!needle || o.toLowerCase().includes(needle))).slice(0, 8)
  const exact = matches.some((m) => m.toLowerCase() === needle)
  const showCustom = !!needle && !exact && !taken.has(needle)
  const list = [...matches, ...(showCustom ? [q.trim()] : [])]
  const add = (r: string) => { const v = r.trim(); if (v && !taken.has(v.toLowerCase())) onAdd(v); setQ(''); setHi(0) }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(list.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && list[hi]) add(list[hi]); else if (q.trim()) add(q) }
    else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Backspace' && !q && selected.length) onRemove(selected[selected.length - 1])
  }
  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selected.map((r) => (
            <span key={r} className="inline-flex items-center gap-1 border border-border-strong bg-surface px-1.5 py-0.5 text-xs">
              {r}
              <button type="button" onClick={() => onRemove(r)} className="grid h-4 w-4 place-items-center text-faint hover:text-text" aria-label={`Remove ${r}`}><X className="h-3 w-3" strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          id="role-input" role="combobox" aria-expanded={open && list.length > 0} aria-controls="role-listbox" aria-autocomplete="list"
          aria-activedescendant={open && list[hi] ? `role-opt-${hi}` : undefined}
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0) }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey}
          placeholder="Type a role, Enter to add" className="input h-10 text-sm" autoComplete="off"
        />
        {open && list.length > 0 && (
          <ul id="role-listbox" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-px max-h-60 overflow-y-auto border border-border-strong bg-surface">
            {list.map((o, i) => {
              const custom = showCustom && i === list.length - 1
              return (
                <li key={`${o}-${i}`} id={`role-opt-${i}`} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); add(o) }} onMouseEnter={() => setHi(i)}
                  className={`flex min-h-[36px] cursor-pointer items-center justify-between px-3 text-sm ${i === hi ? 'bg-surface-2 text-text' : 'text-muted'}`}>
                  <span>{custom ? <>Add “<span className="text-text">{o}</span>”</> : o}</span>
                  {custom && <span className="font-mono text-[10px] uppercase text-faint">custom</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function PreferencesPanel() {
  const toast = useToast()
  const [presets, setPresets] = useState<PresetField[]>(FALLBACK_PRESETS)
  const [fields, setFields] = useState<string[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [parsed, setParsed] = useState<ParsedPreferences | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadPresets().then((p) => alive && setPresets(p))
    api.preferences()
      .then((r) => { if (!alive) return; setFields(r.fields ?? []); setRoles(r.roles ?? []); setFreeText(r.free_text ?? ''); setParsed(parsedOf(r)); setUpdatedAt(r.updated_at ?? null) })
      .catch(() => { /* 404 = nothing saved yet */ })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const roleOptions = [...new Set((fields.length ? presets.filter((p) => fields.includes(p.name)) : presets).flatMap((p) => p.roles))]
  const touch = () => { setDirty(true); setErr(null) }
  const toggleField = (f: string) => { touch(); setFields((xs) => (xs.includes(f) ? xs.filter((x) => x !== f) : [...xs, f])) }

  async function save() {
    if (!fields.length && !roles.length && !freeText.trim()) { setErr('Pick a field, add a role, or describe what you want.'); return }
    setSaving(true); setErr(null)
    try {
      const r = await api.savePreferences({ fields, roles, free_text: freeText.trim() })
      setParsed(parsedOf(r)); setUpdatedAt(r.updated_at ?? new Date().toISOString()); setDirty(false)
      if (r.fields) setFields(r.fields)
      if (r.roles) setRoles(r.roles)
      toast.show('Preferences saved', 'success')
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404 ? 'Saving preferences is not available yet.' : e instanceof Error ? e.message : 'Could not save')
    } finally { setSaving(false) }
  }

  const remote = parsed?.remote
  const remoteLabel = remote == null || remote === '' ? [] : [typeof remote === 'boolean' ? (remote ? 'Remote ok' : 'On-site') : String(remote)]
  return (
    <Section label="Match" title="What I’m looking for" right={updatedAt ? <span className="font-mono text-[11px] text-faint" title={updatedAt}>Updated {relTime(updatedAt)}</span> : undefined}>
      {loading ? <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-6" />)}</div> : (
        <div className="mt-3">
          <fieldset>
            <legend className="label">Field</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const on = fields.includes(p.name)
                return <button key={p.name} type="button" aria-pressed={on} onClick={() => toggleField(p.name)} className={`min-h-[30px] border px-2 text-xs ${on ? 'border-text bg-surface-2 font-medium text-text' : 'border-border text-muted hover:border-border-strong hover:text-text'}`}>{p.name}</button>
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="role-input" className="label">Roles</label>
            <div className="mt-1.5"><RoleCombobox options={roleOptions} selected={roles} onAdd={(r) => { touch(); setRoles((xs) => [...xs, r]) }} onRemove={(r) => { touch(); setRoles((xs) => xs.filter((x) => x !== r)) }} /></div>
            <p className="mt-1 text-xs text-faint">{fields.length ? `Suggestions from ${fields.join(', ')}.` : 'Suggestions from every field.'} Press Enter to add your own.</p>
          </div>

          <div className="mt-4">
            <label htmlFor="pref-free" className="label">Or describe it in your words</label>
            <textarea id="pref-free" value={freeText} onChange={(e) => { touch(); setFreeText(e.target.value) }} rows={3} placeholder="e.g. fresher backend roles in Bengaluru, remote ok, Node or Go" className="input mt-1.5 resize-y py-2 text-sm leading-relaxed" />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="btn-primary h-10 min-h-0 px-5">{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save</button>
            {dirty && !saving && <span className="font-mono text-[11px] text-faint">unsaved changes</span>}
          </div>
          {err && <p role="alert" className="mt-2 text-sm text-red">{err}</p>}

          {parsed && (
            <div className="mt-4 border border-border bg-surface p-3">
              <p className="label">How Vouch reads it</p>
              <div className="-mt-1">
                <Chips label="Titles" items={parsed.titles ?? []} />
                <Chips label="Skills" items={parsed.skills ?? []} />
                <Chips label="Locations" items={parsed.locations ?? []} />
                <Chips label="Seniority" items={parsed.seniority ? [parsed.seniority] : []} />
                <Chips label="Remote" items={remoteLabel} />
              </div>
            </div>
          )}

          <ThresholdInput />
        </div>
      )}
    </Section>
  )
}

function ThresholdInput() {
  const settingsRef = useRef<Settings | null>(null)
  const [threshold, setThreshold] = useState<string>('70')
  const [savedThreshold, setSavedThreshold] = useState<number>(70)
  const [thrState, setThrState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    let alive = true
    let local: Settings = {}
    try { local = JSON.parse(localStorage.getItem(SETTINGS_LS) || '{}') } catch { /* ignore */ }
    const apply = (s: Settings) => { settingsRef.current = s; const t = s.preferences?.match_threshold; if (typeof t === 'number') { setThreshold(String(t)); setSavedThreshold(t) } }
    apply(local)
    api.settings().then((s) => alive && apply(s)).catch(() => { /* keep local */ })
    return () => { alive = false }
  }, [])
  async function saveThreshold() {
    const n = Math.round(Number(threshold))
    if (threshold.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) { setThreshold(String(savedThreshold)); return }
    setThreshold(String(n))
    if (n === savedThreshold) return
    const base = settingsRef.current ?? {}
    const next: Settings = { ...base, preferences: { ...(base.preferences ?? {}), match_threshold: n } }
    setThrState('saving')
    try { localStorage.setItem(SETTINGS_LS, JSON.stringify(next)) } catch { /* ignore */ }
    try { await api.saveSettings(next); settingsRef.current = next; setSavedThreshold(n); setThrState('saved') }
    catch { setThrState('error') }
  }
  const n = Number(threshold)
  return (
    <div className="mt-5 border-t border-border pt-4">
      <label htmlFor="match-threshold" className="label">Match threshold</label>
      <div className="mt-1 flex items-center gap-2">
        <input id="match-threshold" type="number" min={0} max={100} step={1} inputMode="numeric" value={threshold} onChange={(e) => { setThreshold(e.target.value); setThrState('idle') }} onBlur={saveThreshold} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveThreshold() } }} className="input h-10 w-24 font-mono text-sm tnum" />
        <span className="font-mono text-[11px] text-faint">{thrState === 'saving' ? 'saving…' : thrState === 'saved' ? 'saved' : thrState === 'error' ? 'saved on this device only' : '/ 100'}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Alert me when a new posting scores at least <span className="font-mono text-text tnum">{threshold.trim() !== '' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : savedThreshold}</span>.</p>
    </div>
  )
}

function ResumeBlock() {
  const toast = useToast()
  const [text, setText] = useState('')
  const [resume, setResume] = useState<{ summary: ResumeSummary; updated_at?: string | null; text_excerpt?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    api.resume().then((r: Resume) => alive && setResume(r)).catch(() => { /* 404 = no resume yet */ })
    return () => { alive = false }
  }, [])

  async function save() {
    if (!text.trim()) { setErr('Paste your resume text first, or upload a PDF.'); return }
    setSaving(true); setErr(null)
    try { const r = await api.saveResume(text.trim()); setResume({ ...r, text_excerpt: text.trim().slice(0, 200) }); setText(''); toast.show('Resume saved', 'success') }
    catch (e) { setErr(e instanceof ApiError && e.status === 404 ? 'Resume matching is not available yet.' : e instanceof Error ? e.message : 'Could not save') }
    finally { setSaving(false) }
  }
  async function upload(f?: File | null) {
    if (!f) return
    if (f.type && f.type !== 'application/pdf') { setErr('Upload a PDF file.'); return }
    if (f.size > 5 * 1024 * 1024) { setErr('That PDF is over 5 MB.'); return }
    setUploading(true); setErr(null)
    try { const r = await api.uploadResume(f); setResume({ ...r, text_excerpt: f.name }); toast.show(`Read ${f.name}`, 'success') }
    catch (e) { setErr(e instanceof ApiError && e.status === 404 ? 'PDF upload is not available yet. Paste the text instead.' : e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const sum = resume?.summary
  return (
    <details className="group mt-6 border border-border bg-surface" open={false}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-faint transition-transform group-open:rotate-90" strokeWidth={1.5} aria-hidden />Add resume (optional) for better matching</span>
        {resume?.updated_at ? <span className="font-mono text-[11px] text-faint">on file · {relTime(resume.updated_at)}</span> : null}
      </summary>
      <div className="border-t border-border p-3">
        <p className="text-xs text-muted">Your preferences drive matching. A resume adds your skills and experience so scores are sharper.</p>
        <label htmlFor="resume-text" className="sr-only">Paste your resume</label>
        <textarea id="resume-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={resume ? 'Paste an updated resume to replace the one on file.' : 'Paste your resume text.'} className="input mt-2 resize-y py-2 text-sm leading-relaxed" />
        <div className="mt-2 flex gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" id="resume-file" onChange={(e) => upload(e.target.files?.[0])} />
          <label htmlFor="resume-file" className={`btn-secondary h-10 min-h-0 flex-1 cursor-pointer px-3 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" strokeWidth={1.5} aria-hidden />}Upload PDF</label>
          <button type="button" onClick={save} disabled={saving} className="btn-secondary h-10 min-h-0 flex-1 px-3">{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Save resume</button>
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-red">{err}</p>}
        {sum && (
          <div className="mt-2">
            <Chips label="Skills" items={sum.skills ?? []} />
            <Chips label="Roles" items={sum.roles ?? []} />
            <Chips label="Seniority" items={sum.seniority ? [sum.seniority] : []} />
            <Chips label="Locations" items={sum.locations ?? []} />
            <Chips label="Experience" items={sum.years != null ? [`${sum.years} yr${sum.years === 1 ? '' : 's'}`] : []} />
            {resume?.updated_at && <p className="mt-3 font-mono text-[11px] text-faint">Updated {relTime(resume.updated_at)}</p>}
          </div>
        )}
      </div>
    </details>
  )
}
