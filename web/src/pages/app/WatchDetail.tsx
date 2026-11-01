import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Bell, ExternalLink, Loader2, Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { WatchCadence, WatchCheckResult, WatchSourceKind, WatchStatus } from '../../lib/types'
import type { WatchDetail as Detail, WatchDetailAlert, WatchDetailPosting, WatchPreferences, WatchRun } from '../../lib/watchDetailTypes'
import { hostOf, postedLabel, relTime } from '../../lib/format'
import { Empty, ErrorBox, MatchPill, Rows, Section, StatCard } from '../../components/app/ui'
import { GoogleSignInButton } from '../../components/GoogleSignInButton'
import { useToast } from '../../components/Toast'
import { useTitle } from '../../lib/useTitle'
import { refreshUnread } from '../../lib/alerts'

const SOURCE: Record<WatchSourceKind, string> = { careers: 'careers portal', ats: 'ATS', linkedin_public: 'LinkedIn public', linkedin_session: 'LinkedIn session', other: 'other' }
const CADENCE: Record<WatchCadence, string> = { daily: 'Daily', twice_daily: 'Twice daily', hourly: 'Hourly' }
const STATUS_TONE: Record<WatchStatus, string> = { active: 'border-green text-green', paused: 'border-border-strong text-muted', error: 'border-red text-red' }
const SCHED: Record<string, string> = { tinyfish_monitor: 'TinyFish Monitor', in_process: 'in-process' }
const linkCls = 'underline decoration-border-strong underline-offset-4 hover:decoration-text'
const badge = 'inline-flex border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted'
const PAGE = 20

type CheckResult = WatchCheckResult & { method?: string | null; note?: string | null }
type State = { kind: 'loading' } | { kind: 'ok'; data: Detail } | { kind: 'notfound' } | { kind: 'auth' } | { kind: 'error'; msg: string }

function absTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
/** Relative time that understands the future ("in 3 h"). */
function relAny(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = t - Date.now()
  if (diff <= 0) return diff > -60e3 ? 'due now' : relTime(iso)
  const m = Math.round(diff / 60e3)
  if (m < 1) return 'in <1 min'
  if (m < 60) return `in ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `in ${h} h`
  return `in ${Math.round(h / 24)} d`
}

export default function WatchDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [checking, setChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const data = state.kind === 'ok' ? state.data : null
  const w = data?.watch
  useTitle(w ? w.company_name || hostOf(w.source_url) : 'Watch')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState({ kind: 'loading' })
    try {
      const d = await api.watchDetail(id)
      setState({ kind: 'ok', data: d })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState({ kind: 'notfound' })
      else if (e instanceof ApiError && e.status === 401) setState({ kind: 'auth' })
      else if (!quiet) setState({ kind: 'error', msg: e instanceof Error ? e.message : 'Could not load this watch' })
      else toast.show(e instanceof Error ? e.message : 'Could not refresh', 'error')
    }
  }, [id, toast])

  useEffect(() => { if (user) void load() }, [user, load])

  const patchWatch = (p: Partial<Detail['watch']>) => setState((s) => (s.kind === 'ok' ? { kind: 'ok', data: { ...s.data, watch: { ...s.data.watch, ...p } } } : s))

  async function update(body: { cadence?: WatchCadence; status?: WatchStatus }) {
    if (!w) return
    const prev = { cadence: w.cadence, status: w.status }
    patchWatch(body)
    try { await api.updateWatch(w.id, body); void load(true) }
    catch (e) { patchWatch(prev); toast.show(e instanceof Error ? e.message : 'Could not update the watch', 'error') }
  }

  async function checkNow() {
    if (!w || checking) return
    setChecking(true); setLastCheck(null)
    try {
      const r = (await api.checkWatch(w.id)) as CheckResult
      setLastCheck(r)
      if (r.alerts_created) void refreshUnread()
      toast.show(`Check done · ${r.new_postings?.length ?? 0} new · ${r.alerts_created ?? 0} alert${r.alerts_created === 1 ? '' : 's'}`, 'success')
      await load(true)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Check failed', 'error')
    } finally { setChecking(false) }
  }

  async function remove() {
    if (!w) return
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try { await api.deleteWatch(w.id); toast.show('Watch deleted', 'success'); nav('/app/watches') }
    catch (e) { toast.show(e instanceof Error ? e.message : 'Could not delete', 'error'); setDeleting(false); setConfirmDel(false) }
  }

  const back = <Link to="/app/watches" className="label inline-flex min-h-[32px] items-center gap-1 hover:text-text"><ArrowLeft className="h-3 w-3" strokeWidth={1.5} aria-hidden />Watches</Link>

  if (!user || state.kind === 'auth') {
    return (
      <div>
        {back}
        <div className="mt-3 border border-dashed border-border-strong p-8 text-center">
          <p className="text-sm font-medium">Sign in to see this watch</p>
          <p className="mt-1 text-sm text-muted">Watches, your preferences and match alerts are saved to your account.</p>
          <div className="mt-4 flex justify-center"><GoogleSignInButton /></div>
        </div>
      </div>
    )
  }
  if (state.kind === 'notfound') {
    return <div>{back}<div className="mt-3"><Empty title="Watch not found" body="It may have been deleted, or it belongs to another account." cta="Back to watches" to="/app/watches" /></div></div>
  }
  if (state.kind === 'error') {
    return <div>{back}<div className="mt-3"><ErrorBox msg={state.msg} onRetry={() => void load()} /></div></div>
  }

  const alerts = data?.alerts ?? []
  const unread = alerts.filter((a) => !a.read_at).length
  const sched = data?.scheduler
  const err = sched?.last_error || w?.last_error
  const next = w?.status === 'paused' ? 'paused' : sched?.next_check_at ? relAny(sched.next_check_at) : '—'

  return (
    <div>
      {back}
      {/* header */}
      <div className="mt-1 flex flex-col justify-between gap-3 border-b border-border pb-3 lg:flex-row lg:items-end">
        {!w ? (
          <div><span className="skeleton block h-3 w-16" /><span className="skeleton mt-2 block h-6 w-48" /><span className="skeleton mt-2 block h-4 w-64" /></div>
        ) : (
          <div className="min-w-0">
            <p className="label">Watch</p>
            <h1 className="mt-1 truncate text-xl font-semibold">{w.company_name || hostOf(w.source_url)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={badge}>{SOURCE[w.source_kind] ?? w.source_kind}</span>
              <span className="max-w-[280px] truncate font-mono text-xs text-muted" title={w.source_url}>{hostOf(w.source_url)}</span>
              <a href={w.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.04em] text-faint hover:text-text">open<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden /></a>
              <span className={`inline-flex border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${STATUS_TONE[w.status] ?? STATUS_TONE.paused}`}>{w.status}</span>
            </div>
          </div>
        )}
        {w && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={w.cadence} onChange={(e) => update({ cadence: e.target.value as WatchCadence })} aria-label="Check cadence" className="h-10 border border-border-strong bg-bg px-2 font-mono text-xs text-text">
              {(Object.keys(CADENCE) as WatchCadence[]).map((c) => <option key={c} value={c}>{CADENCE[c]}</option>)}
            </select>
            {w.status === 'active'
              ? <button onClick={() => update({ status: 'paused' })} className="btn-secondary h-10 min-h-0 px-3"><Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden />Pause</button>
              : <button onClick={() => update({ status: 'active' })} className="btn-secondary h-10 min-h-0 px-3"><Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />Resume</button>}
            <button onClick={checkNow} disabled={checking} className="btn-primary h-10 min-h-0 px-4">{checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden />}{checking ? 'Checking' : 'Check now'}</button>
            <button onClick={remove} onBlur={() => !deleting && setConfirmDel(false)} disabled={deleting} className="btn-secondary h-10 min-h-0 px-3 text-red" aria-label={`Delete watch for ${w.company_name}`}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />}{confirmDel ? 'Confirm delete' : 'Delete'}</button>
          </div>
        )}
      </div>

      {lastCheck && (
        <div className="mt-3 flex items-start justify-between gap-3 border border-border bg-surface px-3 py-2 text-sm">
          <p><span className="label mr-2">Last check</span><span className="font-mono text-xs tnum">{lastCheck.new_postings?.length ?? 0} new · {lastCheck.alerts_created ?? 0} alerts · {lastCheck.postings_count ?? 0} open{lastCheck.method ? ` · ${lastCheck.method}` : ''}</span>{lastCheck.note && <span className="mt-0.5 block text-xs text-muted">{lastCheck.note}</span>}</p>
          <button onClick={() => setLastCheck(null)} className="font-mono text-[11px] uppercase text-faint hover:text-text">Dismiss</button>
        </div>
      )}

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Postings tracked" loading={!w} value={w?.postings_count ?? data?.latest?.items.length ?? 0} hint={w?.last_checked_at ? <>checked <span className="font-mono" title={w.last_checked_at}>{relTime(w.last_checked_at)}</span></> : w ? 'never checked' : undefined} />
        <StatCard label="New in last run" loading={!w} value={w?.new_last_run ?? data?.runs?.[0]?.new_count ?? 0} hint={data?.runs?.[0]?.method ? <>via <span className="font-mono">{data.runs[0].method}</span></> : undefined} />
        <StatCard label="Alerts" loading={!w} value={alerts.length} hint={w ? <span className="font-mono tnum">{unread} unread</span> : undefined} />
        <StatCard label="Next check" loading={!w} value={<span className="text-xl">{next}</span>} hint={w ? (
          <>
            <span className="font-mono" title={sched?.next_check_at ?? undefined}>{sched ? SCHED[sched.kind] ?? sched.kind : 'scheduler unknown'}</span>
            {err && <span className="mt-1 block text-red" title={err}>{err}</span>}
          </>
        ) : undefined} />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <Section label="Snapshot" title="Latest postings" right={data?.latest?.taken_at ? <span className="font-mono text-[11px] text-faint" title={data.latest.taken_at}>{relTime(data.latest.taken_at)}{data.latest.method ? ` · ${data.latest.method}` : ''}</span> : undefined}>
            <div className="mt-2">{!data ? <Rows n={5} cols={4} /> : <PostingsTable rows={data.latest?.items ?? []} alerted={new Set(alerts.map((a) => a.posting.url))} />}</div>
          </Section>
          <Section label="History" title="Run history" right={data?.runs?.length ? <span className="font-mono text-[11px] text-faint tnum">{data.runs.length} runs</span> : undefined}>
            <div className="mt-2">{!data ? <Rows n={4} cols={4} /> : <RunsTable rows={data.runs ?? []} />}</div>
          </Section>
        </div>
        <aside className="min-w-0 space-y-8">
          <Section label="Match profile" title="Matching against" right={<Link to="/app/watches" className="font-mono text-[11px] uppercase tracking-[0.04em] text-muted hover:text-text">Edit</Link>}>
            {!data ? <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton block h-4" />)}</div> : <Prefs prefs={data.preferences ?? null} threshold={data.threshold} />}
          </Section>
          <Section label="Alerts" title="Alerts for this watch" right={alerts.length ? <span className="font-mono text-[11px] text-faint tnum">{unread} unread</span> : undefined}>
            {!data ? <div className="mt-2"><Rows n={3} cols={2} /></div> : <AlertList items={alerts} />}
          </Section>
        </aside>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- postings */

function PostingsTable({ rows, alerted }: { rows: WatchDetailPosting[]; alerted: Set<string> }) {
  const [key, setKey] = useState<'score' | 'title'>('score')
  const [desc, setDesc] = useState(true)
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => {
    const xs = [...rows]
    if (key === 'score') xs.sort((a, b) => ((b.match?.score ?? -1) - (a.match?.score ?? -1)) * (desc ? 1 : -1))
    else xs.sort((a, b) => (a.title || '').localeCompare(b.title || '') * (desc ? -1 : 1))
    return xs
  }, [rows, key, desc])
  if (!rows.length) return <Empty title="No postings yet." body="Run Check now to fetch the current openings." />
  const shown = all ? sorted : sorted.slice(0, PAGE)
  const sortBtn = (k: 'score' | 'title', label: string) => {
    const on = key === k
    const Icon = desc ? ArrowDown : ArrowUp
    return (
      <button onClick={() => { if (on) setDesc((d) => !d); else { setKey(k); setDesc(k === 'score') } }} className={`inline-flex items-center gap-1 uppercase ${on ? 'text-text' : 'hover:text-text'}`}>
        {label}{on && <Icon className="h-3 w-3" strokeWidth={1.5} aria-hidden />}
      </button>
    )
  }
  const ariaSort = (k: 'score' | 'title') => (key === k ? (desc ? 'descending' : 'ascending') : 'none')
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="ledger-table min-w-[640px]">
          <thead><tr>
            <th scope="col" className="pl-0" aria-sort={ariaSort('title')}>{sortBtn('title', 'Posting')}</th>
            <th scope="col">Location</th>
            <th scope="col" aria-sort={ariaSort('score')}>{sortBtn('score', 'Match')}</th>
            <th scope="col">Top reason</th>
            <th scope="col" className="pr-0 text-right">Alert</th>
          </tr></thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.fingerprint || `${p.url}-${i}`}>
                <td className="pl-0">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className={linkCls}>{p.title || 'Untitled role'}</a>
                  {p.posted && <span className="mt-0.5 block font-mono text-[11px] text-faint">{postedLabel(p.posted)}</span>}
                </td>
                <td className="text-xs text-muted">{p.location || '—'}</td>
                <td><MatchPill score={p.match?.score} /></td>
                <td className="max-w-[280px] text-xs text-muted" title={p.match?.missing?.length ? `Missing: ${p.match.missing.join(', ')}` : undefined}>{p.match?.reasons?.[0] ?? <span className="text-faint">—</span>}</td>
                <td className="pr-0 text-right">{alerted.has(p.url) ? <span className="inline-flex items-center gap-1 border border-border-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text"><Bell className="h-3 w-3" strokeWidth={1.5} aria-hidden />alert</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE && <ShowAll all={all} onToggle={() => setAll((a) => !a)} total={sorted.length} />}
    </div>
  )
}

function ShowAll({ all, onToggle, total }: { all: boolean; onToggle: () => void; total: number }) {
  return <button onClick={onToggle} className="mt-2 min-h-[32px] font-mono text-[11px] uppercase tracking-[0.04em] text-muted hover:text-text">{all ? `Show first ${PAGE}` : `Show all ${total}`}</button>
}

/* ---------------------------------------------------------------- runs */

function RunsTable({ rows }: { rows: WatchRun[] }) {
  const [all, setAll] = useState(false)
  if (!rows.length) return <Empty title="No runs yet." body="Each scheduled or manual check is logged here." />
  const shown = all ? rows : rows.slice(0, PAGE)
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="ledger-table min-w-[520px]">
          <thead><tr><th scope="col" className="pl-0">Taken at</th><th scope="col">Method</th><th scope="col" className="text-right">Postings</th><th scope="col" className="pr-0 text-right">New</th></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.taken_at}-${i}`}>
                <td className="pl-0 font-mono text-xs"><span className="tnum">{absTime(r.taken_at)}</span><span className="ml-2 text-faint">{relTime(r.taken_at)}</span></td>
                <td>{r.method ? <span className={badge}>{r.method}</span> : <span className="text-faint">—</span>}</td>
                <td className="text-right font-mono text-xs tnum">{r.postings_count ?? '—'}</td>
                <td className={`pr-0 text-right font-mono text-xs tnum ${r.new_count ? 'font-semibold text-text' : 'text-faint'}`}>{r.new_count ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && <ShowAll all={all} onToggle={() => setAll((a) => !a)} total={rows.length} />}
    </div>
  )
}

/* ---------------------------------------------------------------- preferences */

function Chips({ label, items }: { label: string; items: ReactNode[] }) {
  if (!items.length) return null
  return (
    <div className="mt-3">
      <p className="label">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">{items.map((x, i) => <span key={i} className="border border-border bg-surface-2 px-1.5 py-0.5 text-xs">{x}</span>)}</div>
    </div>
  )
}

function Prefs({ prefs, threshold }: { prefs: WatchPreferences | null; threshold?: number | null }) {
  if (!prefs) return <div className="mt-3"><Empty title="No preferences yet." body="Postings are listed but not scored. Add what you are looking for on the Watches page." cta="Set preferences" to="/app/watches" /></div>
  const remote = prefs.remote == null || prefs.remote === '' ? [] : [typeof prefs.remote === 'boolean' ? (prefs.remote ? 'Remote OK' : 'On-site') : String(prefs.remote)]
  return (
    <div>
      <Chips label="Titles" items={prefs.titles ?? []} />
      <Chips label="Locations" items={prefs.locations ?? []} />
      <Chips label="Seniority" items={prefs.seniority ? [prefs.seniority] : []} />
      <Chips label="Remote" items={remote} />
      <Chips label="Skills" items={prefs.skills ?? []} />
      <Chips label="Exclude" items={prefs.exclude ?? []} />
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="label">Alert threshold</span>
        <span className="font-mono text-sm tnum">{threshold != null ? <>{Math.round(threshold)}<span className="text-faint"> / 100</span></> : '—'}</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- alerts */

function AlertList({ items }: { items: WatchDetailAlert[] }) {
  if (!items.length) return <div className="mt-3"><Empty title="No alerts yet." body="You get an alert when a new posting scores at or above your threshold." /></div>
  return (
    <ul className="mt-1">
      {items.map((a) => (
        <li key={a.id} className="border-b border-border py-3">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${a.read_at ? 'bg-transparent' : 'bg-text'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <a href={a.posting.url} target="_blank" rel="noopener noreferrer" className={`min-w-0 text-sm ${a.read_at ? 'text-muted' : 'font-medium text-text'} ${linkCls}`}>{a.posting.title || 'Untitled role'}</a>
                <MatchPill score={a.match_score} />
              </div>
              {a.match_reasons?.length ? <p className="mt-1 text-xs text-muted">{a.match_reasons.slice(0, 2).join(' · ')}</p> : null}
              {a.match_missing?.length ? <p className="mt-0.5 text-xs text-faint">Missing: {a.match_missing.slice(0, 3).join(', ')}</p> : null}
              <p className="mt-1 font-mono text-[11px] text-faint"><span title={a.created_at}>{relTime(a.created_at)}</span> · {a.read_at ? 'read' : <span className="text-text">unread</span>}{a.posting.location ? ` · ${a.posting.location}` : ''}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
