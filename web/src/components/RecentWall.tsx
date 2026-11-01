import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import type { RecentItem } from '../lib/types'
import { relTime } from '../lib/format'
import { BandPill } from './BandPill'

export function RecentList({ items, loading, error, empty }: { items: RecentItem[] | null; loading: boolean; error?: string | null; empty: React.ReactNode }) {
  const base = useLocation().pathname.startsWith('/app') ? '/app/c/' : '/c/'
  if (loading) return (
    <table className="ledger-table" aria-busy="true" aria-label="Loading">
      <tbody>{Array.from({ length: 5 }).map((_, i) => <tr key={i}><td className="pl-0"><span className="skeleton block h-4 w-40" /></td><td><span className="skeleton block h-4 w-24" /></td><td className="pr-0 text-right"><span className="skeleton inline-block h-4 w-14" /></td></tr>)}</tbody>
    </table>
  )
  if (error) return <p className="border-t border-border py-4 text-sm text-muted">{error}</p>
  if (!items?.length) return <p className="border-t border-border py-4 text-sm text-muted">{empty}</p>
  return (
    <table className="ledger-table">
      <thead><tr><th scope="col" className="pl-0">Company</th><th scope="col">Verdict</th><th scope="col" className="hidden sm:table-cell">Score</th><th scope="col" className="pr-0 text-right">When</th></tr></thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.check_id}>
            <td className="pl-0"><Link to={`${base}${it.check_id}`} className="inline-flex min-h-[36px] items-center font-medium text-text underline decoration-border-strong underline-offset-4 hover:decoration-text">{it.company_name || 'Unknown company'}</Link></td>
            <td>{it.band ? <BandPill band={it.band} /> : <span className="font-mono text-xs text-faint">running</span>}</td>
            <td className="hidden font-mono text-xs tnum text-muted sm:table-cell">{it.score ?? ''}</td>
            <td className="pr-0 text-right font-mono text-[11px] text-faint">{relTime(it.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RecentWall() {
  const [items, setItems] = useState<RecentItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.recent().then((r) => { if (alive) { setItems(r.items ?? []); setError(null) } })
      .catch(() => { if (alive && items == null) setError('Recent checks will appear here once Vouch is reachable.') })
      .finally(() => alive && setLoading(false))
    load()
    const id = window.setInterval(load, 15000)
    return () => { alive = false; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <section aria-labelledby="recent-h">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div><p className="label">Live</p><h2 id="recent-h" className="mt-1 text-base font-semibold">Recent checks</h2></div>
        <p className="hidden font-mono text-[11px] text-faint sm:block">anonymised · refreshes every 15 s</p>
      </div>
      <RecentList items={items} loading={loading} error={error} empty={<>No checks yet today. Paste an offer above to be the first.</>} />
    </section>
  )
}
