import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { RecentItem, Stats } from '../../lib/types'
import { RecentList } from '../../components/RecentWall'
import { BarChart, Empty, Section, StatCard } from '../../components/app/ui'
import { useTitle } from '../../lib/useTitle'
import { useUnreadAlerts } from '../../lib/alerts'

function days14(items: RecentItem[], per?: Stats['per_day']) {
  const out: { date: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10); out.push({ date: d, count: per?.find((p) => p.date === d)?.count ?? items.filter((x) => x.created_at.slice(0, 10) === d).length }) }
  return out
}

export default function Overview() {
  useTitle('Overview')
  const { user } = useAuth()
  const unread = useUnreadAlerts()
  const [items, setItems] = useState<RecentItem[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setLoading(true)
    const list = user ? api.myChecks() : api.recent()
    Promise.all([list.then((r) => r.items ?? []), user ? api.stats().catch(() => null) : Promise.resolve(null)])
      .then(([it, st]) => { if (alive) { setItems(it); setStats(st) } })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [user])
  const it = items ?? []
  const total = stats?.checks_total ?? it.length
  const high = stats?.high_risk ?? it.filter((x) => x.band === 'red').length
  const deep = stats?.deep_checks ?? stats?.research_runs ?? 0
  const doneCount = it.filter((x) => x.band === 'red' || x.band === 'amber' || x.band === 'green').length
  const approval = stats?.approval_rate ?? (doneCount ? it.filter((x) => x.band === 'green').length / doneCount : null)
  const needs = useMemo(() => it.filter((x) => x.band === 'amber').slice(0, 5), [it])
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div>
      <p className="text-sm text-muted">{greet}{user ? `, ${user.name.split(' ')[0]}` : ''} · {total} check{total === 1 ? '' : 's'}{user ? '' : ' on the public wall'}</p>
      <h1 className="mt-1 text-xl font-semibold">Overview</h1>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Checks run" value={total} loading={loading} hint={user ? 'All time' : 'Recent public checks'} />
        <StatCard label="High risk caught" value={high} loading={loading} hint="Verdict HIGH RISK" />
        <StatCard label="Approval rate" value={approval != null ? `${Math.round(approval * 100)}%` : '—'} loading={loading} hint="Share rated LIKELY GENUINE" />
        <StatCard label="Deep checks" value={deep} loading={loading} hint="Agent + research runs" />
      </div>
      {error && <p className="mt-4 border-l-2 border-red pl-3 text-sm text-red">{error}</p>}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Section label="Activity" title="Checks per day" right={<span className="font-mono text-[11px] text-faint">last 14 days</span>}>
          <div className="mt-3 border border-border bg-surface p-2">{loading ? <div className="skeleton h-32" /> : <BarChart data={days14(it, stats?.per_day)} label="Checks per day" />}</div>
        </Section>
        <Section label="Needs you" title="Awaiting your feedback">
          {user && unread != null && (
            <Link to="/app/alerts" className="mt-3 flex items-center justify-between border border-border bg-surface px-3 py-2 text-sm hover:border-border-strong">
              <span><span className="label mr-2">Alerts</span>{unread ? 'New postings match your preferences' : 'No unread match alerts'}</span>
              <span className={`font-mono text-sm tnum ${unread ? 'font-semibold text-text' : 'text-faint'}`}>{unread} →</span>
            </Link>
          )}
          {loading ? <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-5" />)}</div> : needs.length ? (
            <ul className="mt-1 divide-y divide-border">{needs.map((x) => <li key={x.check_id} className="flex items-center justify-between gap-3 py-2 text-sm"><Link to={`/app/c/${x.check_id}`} className="truncate underline decoration-border-strong underline-offset-4 hover:decoration-text">{x.company_name || 'Unknown company'}</Link><span className="font-mono text-[11px] uppercase text-amber">be careful</span></li>)}</ul>
          ) : <div className="mt-3"><Empty title="Nothing waiting" body="BE CAREFUL verdicts without feedback show up here." /></div>}
        </Section>
      </div>
      <Section label="Live" title="Recent checks" className="mt-8" right={<Link to="/app/checks" className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint hover:text-text">All checks →</Link>}>
        <div className="mt-1"><RecentList items={it.slice(0, 8)} loading={loading} error={error} empty={<>No checks yet. <Link to="/app/new" className="text-text underline underline-offset-4">Run your first check</Link>.</>} /></div>
      </Section>
    </div>
  )
}
