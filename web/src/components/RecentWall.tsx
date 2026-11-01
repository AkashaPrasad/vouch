import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { api } from '../lib/api'
import type { RecentItem } from '../lib/types'
import { relTime } from '../lib/format'
import { BandPill } from './BandPill'

export function RecentList({ items, loading, error, empty }: { items: RecentItem[] | null; loading: boolean; error?: string | null; empty: React.ReactNode }) {
  if (loading) return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }).map((_, i) => <li key={i} className="card flex h-[68px] items-center gap-3 p-4"><span className="skeleton h-4 flex-1" /><span className="skeleton h-5 w-24 rounded-full" /></li>)}
    </ul>
  )
  if (error) return <p className="card p-6 text-sm text-muted">{error}</p>
  if (!items?.length) return <div className="card border-dashed p-8 text-center text-sm text-muted">{empty}</div>
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <li key={it.check_id}>
          <Link to={`/c/${it.check_id}`} className="card flex min-h-[68px] items-center gap-3 p-4 transition-colors hover:border-border-strong hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text">{it.company_name || 'Unknown company'}</div>
              <div className="mt-0.5 font-mono text-[11px] text-faint">{relTime(it.created_at)}{it.status === 'running' ? ' · running' : ''}</div>
            </div>
            {it.band && <BandPill band={it.band} score={it.score} />}
          </Link>
        </li>
      ))}
    </ul>
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
    <section aria-labelledby="recent-h" className="container-x mt-16">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} aria-hidden />Live</p>
          <h2 id="recent-h" className="mt-1 text-xl font-semibold tracking-tight">Recent checks</h2>
        </div>
        <p className="hidden text-xs text-faint sm:block">Anonymised. Company names masked when unconfirmed.</p>
      </div>
      <RecentList items={items} loading={loading} error={error} empty={<>No checks yet today. Paste an offer above to be the first.</>} />
    </section>
  )
}
