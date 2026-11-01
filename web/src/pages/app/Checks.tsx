import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Band, RecentItem } from '../../lib/types'
import { BandPill } from '../../components/BandPill'
import { Trash2 } from 'lucide-react'
import { relTime } from '../../lib/format'
import { Empty, ErrorBox, PageHead, Rows } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'

const PAGE = 15
export default function Checks() {
  useTitle('Checks')
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') ?? ''
  const band = (sp.get('band') ?? '') as Band | ''
  const range = sp.get('range') ?? 'all'
  const page = Number(sp.get('page') ?? 1)
  const [items, setItems] = useState<RecentItem[] | null>(null)
  const remove = async (id: string) => {
    if (!window.confirm('Delete this check? This cannot be undone.')) return
    try { await api.deleteCheck(id); setItems((prev) => (prev ?? []).filter((x) => x.check_id !== id)) } catch (e) { window.alert(e instanceof Error ? e.message : 'Could not delete') }
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true; setLoading(true); setError(null)
    ;(user ? api.myChecks() : api.recent()).then((r) => alive && setItems(r.items ?? [])).catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load')).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [user, tick])
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n) }
  const filtered = useMemo(() => (items ?? []).filter((x) => (!q || (x.company_name || '').toLowerCase().includes(q.toLowerCase()) || x.check_id.includes(q)) && (!band || x.band === band)
    && (range === 'all' || Date.now() - Date.parse(x.created_at) < (range === '24h' ? 1 : range === '7d' ? 7 : 30) * 86400e3)), [items, q, band, range])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const slice = filtered.slice((page - 1) * PAGE, page * PAGE)
  const sel = 'h-9 border border-border-strong bg-bg px-2 font-mono text-xs text-text'
  return (
    <div>
      <PageHead label="History" title="Checks" sub={user ? `${items?.length ?? 0} checks on your account` : 'Guest view shows the public wall. Sign in to keep your own history.'} actions={<Link to="/app/new" className="btn-primary">New check</Link>} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Search company or id" aria-label="Search" className={`${sel} w-56 font-sans`} />
        <select value={band} onChange={(e) => set('band', e.target.value)} aria-label="Verdict" className={sel}><option value="">All verdicts</option><option value="green">Likely genuine</option><option value="amber">Be careful</option><option value="red">High risk</option></select>
        <select value={range} onChange={(e) => set('range', e.target.value)} aria-label="Date range" className={sel}><option value="all">All time</option><option value="24h">Last 24 h</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
        <span className="ml-auto font-mono text-[11px] text-faint">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-2">
        {loading ? <Rows n={6} cols={4} /> : error ? <ErrorBox msg={error} onRetry={() => setTick((t) => t + 1)} /> : !filtered.length ? (
          <Empty title={items?.length ? 'No checks match these filters' : user ? 'No checks yet' : 'Nothing on the public wall yet'} body={items?.length ? 'Clear a filter to see more.' : 'Run your first check to start a history.'} cta="New check" to="/app/new" />
        ) : (
          <table className="ledger-table">
            <thead><tr><th scope="col" className="pl-0">Company</th><th scope="col">Verdict</th><th scope="col" className="hidden sm:table-cell">Score</th><th scope="col" className="hidden md:table-cell">Id</th><th scope="col" className="text-right">When</th>{user && <th scope="col" className="pr-0 text-right"><span className="sr-only">Delete</span></th>}</tr></thead>
            <tbody>{slice.map((x) => <tr key={x.check_id}><td className="pl-0"><Link to={`/app/c/${x.check_id}`} className="inline-flex min-h-[36px] items-center font-medium underline decoration-border-strong underline-offset-4 hover:decoration-text">{x.company_name || 'Unknown company'}</Link></td><td>{x.band ? <BandPill band={x.band} /> : <span className="font-mono text-xs text-faint">running</span>}</td><td className="hidden font-mono text-xs tnum text-muted sm:table-cell">{x.score ?? ''}</td><td className="hidden font-mono text-[11px] text-faint md:table-cell">{x.check_id}</td><td className="text-right font-mono text-[11px] text-faint">{relTime(x.created_at)}</td>{user && <td className="pr-0 text-right"><button type="button" aria-label={`Delete check for ${x.company_name || 'unknown company'}`} onClick={() => remove(x.check_id)} className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center text-faint hover:text-red"><Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden /></button></td>}</tr>)}</tbody>
          </table>
        )}
      </div>
      {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 font-mono text-xs"><button disabled={page <= 1} onClick={() => set('page', String(page - 1))} className="btn-secondary h-9 min-h-0 px-3">Prev</button><span className="tnum text-faint">{page} / {pages}</span><button disabled={page >= pages} onClick={() => set('page', String(page + 1))} className="btn-secondary h-9 min-h-0 px-3">Next</button></div>}
    </div>
  )
}
